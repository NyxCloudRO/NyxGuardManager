import releasePolicy,{persistentSource,assertDatabasePair} from './release-policy.mjs';
import {assertProgress} from './startup-progress-check.mjs';
import {baselinePlan} from './baseline-acceptance.mjs';
import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import {docker as negotiatedDocker} from "./recovery-docker.mjs";
import {dockerHealthcheck,policy} from './readiness-policy.mjs';
import {durableJson} from './recovery-files.mjs';
import {assertUpdateTarget} from './update-contract.mjs';
import {recoveryWorkerWait} from './recovery-worker-wait.mjs';
import {sanitizedFailure} from './handover-transaction.mjs';

const env = process.env;
let interrupted = false;
let recovering = false;
process.on("SIGTERM", () => { if (!recovering) interrupted = true; });
process.on("SIGINT", () => { if (!recovering) interrupted = true; });
function assertNotInterrupted() {
	if (interrupted) throw new Error("Handover interrupted before health commit");
}
const api = negotiatedDocker;
// Reuse a worker's deadline across forward execution and rollback in this
// invocation; an expired forward wait cannot buy a second full rollback wait.
const waitRecoveryWorker = recoveryWorkerWait(id => api('GET', `/containers/${id}/json`));

const ignore = (promise) => promise.catch(() => undefined);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitHealthy(id, timeoutMs = policy.handoverDeadlineMs) {
  let startupAttempt,lastUnits=-1;
	let deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		assertNotInterrupted();
		const info = await api("GET", `/containers/${id}/json`);
		if (!info.State?.Running) throw new Error(`${id} stopped during startup`);
		const health = info.State.Health?.Status;
		if (health === "healthy" || (!info.State.Health && Date.now() + 5000 < deadline)) {
			if (!info.State.Health) await sleep(5000);
			return;
		}
		if(info.Config?.Labels?.['org.opencontainers.image.version']===releasePolicy.version||info.Config?.Env?.includes('NPM_BUILD_VERSION='+releasePolicy.version)) {
      let progress;
      try {
        const exec=await api('POST',`/containers/${id}/exec`,{AttachStdout:true,AttachStderr:true,Cmd:['cat','/tmp/nyxguard-startup.json']});
        const raw=await api('POST',`/exec/${exec.Id}/start`,{Detach:false,Tty:false});
        const clean=String(raw).replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g,'');
        progress=JSON.parse(clean.slice(clean.indexOf('{'),clean.lastIndexOf('}')+1));
      } catch {if(health==='unhealthy')throw new Error('STARTUP_FAILED: startup progress unavailable; inspect Manager logs');}
      if(progress&&!progress.complete){
        assertProgress(progress);
        if(startupAttempt&&startupAttempt!==progress.attempt)throw new Error('STARTUP_FAILED: replacement restarted before readiness');
        if(progress.units<lastUnits)throw new Error('STARTUP_FAILED: migration progress regressed');
        startupAttempt=progress.attempt;lastUnits=progress.units;
        deadline=Date.now()+Math.max(releasePolicy.readiness.migrationIdleMs,releasePolicy.readiness.startupIdleMs);
      } else if(health==='unhealthy'){
        const readyGrace=policy.intervalMs+policy.timeoutMs+2000;
        if(!Number.isSafeInteger(progress?.completedAt)||Date.now()-progress.completedAt>readyGrace)throw new Error('STARTUP_FAILED: initialization complete but readiness checks failed');
        deadline=Math.max(deadline,progress.completedAt+readyGrace);
      }
    } else if(health==='unhealthy')throw new Error(`${id} became unhealthy`);
		await sleep(2000);
	}
	throw new Error(`${id} did not become healthy in time`);
}

async function normalizeReplacement() {
  const manager=await api('GET',`/containers/${env.NEW_MANAGER_ID}/json`);
  // Keep Compose's real source-config identity. A changed target model is
  // reconciled by normal Compose startup; do not invent a matching target hash.
  const composeLabels=async (replacement,sourceId)=>{
    const labels={...replacement.Config.Labels,'com.docker.compose.image':replacement.Image};
    if(!labels['com.docker.compose.config-hash']) {
      const source=await api('GET',`/containers/${sourceId}/json`);
      for(const key of ['com.docker.compose.project','com.docker.compose.service','com.docker.compose.project.config_files'])
        if(!labels[key]||labels[key]!==source.Config.Labels?.[key])throw new Error('Replacement Compose identity differs from source');
      labels['com.docker.compose.config-hash']=source.Config.Labels?.['com.docker.compose.config-hash'];
    }
    if(!/^[a-f0-9]{64}$/.test(labels['com.docker.compose.config-hash']||''))throw new Error('Verified source Compose config identity missing');
    return labels;
  };
  const managerLabels=await composeLabels(manager,env.OLD_MANAGER_ID);
  const wanted=dockerHealthcheck();
  const actual=manager.Config.Healthcheck||{};
  if(Object.keys(wanted).every(key=>JSON.stringify(wanted[key])===JSON.stringify(actual[key])) && manager.Config.Labels?.['com.docker.compose.image']===manager.Image && manager.Config.Labels?.['com.docker.compose.config-hash']===managerLabels['com.docker.compose.config-hash']) return;
  if(manager.State.Running)throw new Error('Cannot normalize a running replacement');
  const beforeManager=env.NEW_MANAGER_ID,beforeVpn=env.NEW_VPN_ID;
  const vpn=beforeVpn?await api('GET',`/containers/${beforeVpn}/json`):null;
  if(vpn?.State.Running)throw new Error('Cannot normalize a running replacement VPN Agent');
  const vpnLabels=vpn?await composeLabels(vpn,env.OLD_VPN_ID):null;
  if(vpn)await api('DELETE',`/containers/${beforeVpn}`);
  await api('DELETE',`/containers/${beforeManager}`);
  const replacement=await api('POST',`/containers/create?name=${encodeURIComponent(manager.Name.replace(/^\//,''))}`,{
    ...manager.Config,Hostname:manager.Config.Hostname===beforeManager.slice(0,12)?'':manager.Config.Hostname,
    Image:manager.Image,Healthcheck:wanted,HostConfig:manager.HostConfig,
    Labels:managerLabels,
    NetworkingConfig:{EndpointsConfig:Object.fromEntries(Object.entries(manager.NetworkSettings.Networks).map(([name,network])=>[name,{Aliases:network.Aliases,IPAMConfig:network.IPAMConfig}]))},
  });
  env.NEW_MANAGER_ID=replacement.Id;
  if(vpn)env.NEW_VPN_ID=(await api('POST',`/containers/create?name=${encodeURIComponent(vpn.Name.replace(/^\//,''))}`,{
    ...vpn.Config,Labels:vpnLabels,Hostname:'',Image:vpn.Image,HostConfig:{...vpn.HostConfig,NetworkMode:`container:${replacement.Id}`},
  })).Id;
  const file='/handover-data/update-manager/state.json';
  let state;
  try{state=JSON.parse(await fs.readFile(file,'utf8'));}catch(error){if(error.code==='ENOENT')return;throw error;}
  if(state.stage==='activating'&&state.activation?.newManagerId===beforeManager){
    state.activation.newManagerId=env.NEW_MANAGER_ID;
    if(beforeVpn)state.activation.newVpnId=env.NEW_VPN_ID;
    await writeState(file,state,'normalize');
  }
}

async function writeState(file, state, suffix) {
	// Handover runs as root, while the Manager reads this file as npm.
	// Keep the existing state owner's uid/gid across the atomic rename.
	let owner;
	try { owner = await fs.stat(file); }
	catch (error) {
		if (error.code !== "ENOENT") throw error;
		owner = await fs.stat(path.dirname(file));
	}
	const temporary = `${file}.${suffix}.tmp`;
	const handle=await fs.open(temporary,'w',0o600);
  try{await handle.writeFile(JSON.stringify(state,null,2));await handle.sync();}finally{await handle.close();}
	try {
		if (owner.uid !== process.getuid?.() || owner.gid !== process.getgid?.())
			await fs.chown(temporary, owner.uid, owner.gid);
		await fs.rename(temporary, file);
    const directory=await fs.open(path.dirname(file),'r');try{await directory.sync();}finally{await directory.close();}
	} catch (error) {
		await fs.rm(temporary, { force: true }).catch(() => undefined);
		throw error;
	}
}

async function updateState(success, error = null, manualRecoveryRequired = false, recoveryStatus = null, migrationBoundary = null, reconcileFailure = false, recoveryId = null) {
	const file = "/handover-data/update-manager/state.json";
	let state = {};
	try {
		state = JSON.parse(await fs.readFile(file, "utf8"));
	} catch {
		// The application recreates defaults if this file did not exist.
	}
	if (success) {
		const record = { from: env.CURRENT_VERSION, to: env.TARGET_VERSION, at: new Date().toISOString() };
		state.currentVersion = env.TARGET_VERSION;
		state.stage = "success";
		state.downloadedVersion = null;
		state.downloadedImageId = null;
		state.activation = null;
		state.recoveryCleanupPending = recoveryId || null;
		state.pendingVersion = null;
		state.restartPending = false;
		state.updateAvailable = false;
		state.lastSuccessfulUpdate = record;
		state.updateHistory = Array.isArray(state.updateHistory) ? state.updateHistory : [];
		state.updateHistory.unshift(record);
		state.updateHistory = state.updateHistory.slice(0, 50);
		delete state.lastApplyFailure;
		delete state.manualRecoveryRequired;
	} else {
		state.restartPending = false;
		state.pendingVersion = null;
		state.stage = manualRecoveryRequired ? "recovery_required" : "failed";
		state.activation = null;
		state.lastApplyFailure = { at: new Date().toISOString(), error: String(error || "handover failed"),
			...(recoveryStatus ? { recoveryStatus } : {}), ...(migrationBoundary ? { migrationBoundary } : {}) };
		state.manualRecoveryRequired = manualRecoveryRequired;
    state.recoveryId = recoveryId;
	}
	await fs.mkdir("/handover-data/update-manager", { recursive: true });
	await writeState(file, state, "handover");
}

async function finishRecoveryCleanup(recoveryId) {
	const file = "/handover-data/update-manager/state.json";
	const state = JSON.parse(await fs.readFile(file, "utf8"));
	if (state.stage !== "success" || state.recoveryCleanupPending !== recoveryId)
		throw new Error("Recovery cleanup state changed");
	state.recoveryCleanupPending = null;
	await writeState(file, state, "cleanup");
}

async function updatePhase(phase, recoveryId) {
	const file = "/handover-data/update-manager/state.json";
	let state;
	try { state = JSON.parse(await fs.readFile(file, "utf8")); }
	catch (error) { if (error.code === "ENOENT") return; throw error; }
	// Task 1A's standalone handover fixtures intentionally have no update caller.
	if (state.stage !== "activating") return;
	if (state.activation?.newManagerId !== env.NEW_MANAGER_ID)
		throw new Error("Activation state does not match handover");
	state.activation = { ...state.activation, phase, recoveryId };
	await writeState(file, state, "handover");
}

function requiredVolume(container,destination,key){
  const mount=(container.Mounts||[]).find(item=>item.Destination===destination);
  return {key,name:persistentSource(mount)};
}
let installedDatabase,recoveryVolume,vaultDirectory;
async function resolveInstalledTopology(manager){
  const project=manager.Config.Labels?.['com.docker.compose.project'];
  const files=manager.Config.Labels?.['com.docker.compose.project.config_files'];
  if(!project||!files)throw new Error('Installed Compose provenance missing');
  const all=await api('GET','/containers/json?all=1');
  const dbs=all.filter(c=>c.Labels?.['com.docker.compose.service']==='db'&&c.Labels?.['com.docker.compose.project']===project&&c.Labels?.['com.docker.compose.project.config_files']===files);
  if(dbs.length!==1)throw new Error('Installed Compose database identity ambiguous');
  installedDatabase=await api('GET',`/containers/${dbs[0].Id}/json`);
  if(!installedDatabase.State.Running)throw new Error('Installed MariaDB is not running');
  assertDatabasePair(manager,installedDatabase);
  persistentSource(installedDatabase.Mounts.find(m=>m.Destination==='/var/lib/mysql'));
  const vault=manager.Mounts.find(m=>m.Destination==='/run/nyxguard-licensing/vault.key'||m.Destination==='/run/nyxguard-licensing');
  if(vault?.Type!=='bind'||vault.RW||!path.isAbsolute(vault.Source))throw new Error('Protected licensing vault mount missing');
  vaultDirectory=vault.Destination.endsWith('/vault.key')?path.dirname(vault.Source):vault.Source;
  recoveryVolume=project.replace(/[^A-Za-z0-9_.-]/g,'_')+'_nyxguard_update_recovery';
}

function assertCoveredWritableMounts(container, permitted) {
	for (const mount of container.Mounts || []) {
		if (mount.RW && !permitted.has(mount.Destination))
			throw new Error(`Unprotected writable mount at ${mount.Destination}`);
	}
}

async function sameMajorVolumes(manager, vpn) {
	if (manager.State?.Health?.Status !== "healthy") throw new Error("Current Manager is not healthy");
	assertCoveredWritableMounts(manager, new Set(["/data", "/etc/letsencrypt", "/var/run/docker.sock"]));
	const volumes = [requiredVolume(manager, "/data", "data"),
		requiredVolume(manager, "/etc/letsencrypt", "letsencrypt")];
	if (vpn) {
		if (vpn.State?.Health?.Status !== "healthy" || vpn.HostConfig?.NetworkMode !== `container:${manager.Id}`)
			throw new Error("Current VPN Agent is unhealthy or outside the Manager namespace");
		assertCoveredWritableMounts(vpn, new Set(["/var/lib/nyxguard-vpn", "/run/nyxguard-vpn-auth"]));
		volumes.push(requiredVolume(vpn, "/var/lib/nyxguard-vpn", "vpn"));
		volumes.push(requiredVolume(vpn, "/run/nyxguard-vpn-auth", "vpn_auth"));
	}
	await resolveInstalledTopology(manager);
	return volumes;
}

let sameMajorInstallDir;
async function runSameMajorWorker(mode, recoveryId, volumes, transaction = null) {
	const runtime = await api('GET', `/containers/${transaction?.phase==='COMMITTED'?transaction.target.id:env.OLD_MANAGER_ID}/json`);
	if(!sameMajorInstallDir) {
		const previous = await api("GET", `/containers/${env.OLD_MANAGER_ID}/json`);
		const composeFile=String(previous.Config.Labels?.["com.docker.compose.project.config_files"]||"").split(",")[0];
		if(!path.isAbsolute(composeFile)||path.basename(composeFile)!=="docker-compose.yml")throw new Error("Installed Compose identity missing");
		sameMajorInstallDir=path.dirname(composeFile);
	}
	await api('POST','/volumes/create',{Name:recoveryVolume,Labels:{'nyxguard.purpose':'same-major-update-recovery'}});
  const binds = 
		["/var/run/docker.sock:/var/run/docker.sock:ro", `${recoveryVolume}:/recovery:rw`,
		...runtime.Mounts.filter(m=>['/etc/localtime','/etc/timezone'].includes(m.Destination)).map(m=>`${persistentSource(m)}:${m.Destination}:ro`),
		`${persistentSource(installedDatabase.Mounts.find(m=>m.Destination==='/var/lib/mysql'))}:/source/db:ro`, `${vaultDirectory}:/host-vault:rw`,
		`${sameMajorInstallDir}:/host-install:rw`,
		...volumes.map((v) => `${v.name}:/source/${v.key}:${["restore","finalize","baseline"].includes(mode) ? "rw" : "ro"}`)];
	const name = `nyxguard-same-major-${mode}-${recoveryId}`;
  let previous;
  try{previous=await api('GET',`/containers/${name}/json`);}catch(error){if(!/failed: 404$/.test(error.message))throw error;}
  if(previous) {
    previous=await waitRecoveryWorker(previous.Id);
    if(mode==='backup'&&previous.State.ExitCode===0)return;
    await api('DELETE',`/containers/${previous.Id}`);
  }
	const created = await api("POST", `/containers/create?name=${name}`, {
		Image: env.TARGET_IMAGE_ID || `nyxmael/nyxguardmanager:${env.TARGET_VERSION}`,
		Entrypoint: ["node", "/app/internal/same-major-recovery.js"], Cmd: [],
		Env: [`RECOVERY_ID=${recoveryId}`,
      ...runtime.Config.Env.filter(value=>value.startsWith('TZ=')),
      `RECOVERY_DATABASE_ID=${installedDatabase.Id}`,
      `RECOVERY_COMPOSE_FILES=${JSON.stringify(String(runtime.Config.Labels['com.docker.compose.project.config_files']).split(',').map(file=>{if(path.dirname(file)!==sameMajorInstallDir)throw new Error('Compose overrides outside installation directory require a protected install layout');return path.basename(file);} ))}`,`RECOVERY_VOLUME=${recoveryVolume}`,
      `BASELINE_AUTHORIZATION=${env.BASELINE_AUTHORIZATION||''}`,`BASELINE_REASON=${env.BASELINE_REASON||''}`,
      `BASELINE_PLAN=${env.BASELINE_PLAN||''}`, `RECOVERY_MODE=${mode}`,
			`RECOVERY_TARGET_IMAGE=${env.TARGET_IMAGE_ID}`,
      `RECOVERY_SOURCE_VERSION=${transaction?.source.version||env.CURRENT_VERSION}`,
      `RECOVERY_MUTATION_POSSIBLE=${transaction?.mutationPossible?1:0}`,
			`RECOVERY_VOLUMES=${JSON.stringify(volumes)}`],
		Healthcheck: { Test: ["NONE"] },
		HostConfig: { Binds: binds, NetworkMode: `container:${installedDatabase.Id}` },
	});
	try {
		await api("POST", `/containers/${created.Id}/start`);
		const status = await waitRecoveryWorker(created.Id);
		if (status.State.ExitCode !== 0) throw new Error(`Same-major recovery ${mode} failed with exit ${status.State.ExitCode}`);
		return;
	} finally {
		const final = await api("GET", `/containers/${created.Id}/json`).catch(() => null);
		if (final && final.State?.Status === 'exited' && !final.State.Running && final.State.ExitCode === 0)
			await ignore(api("DELETE", `/containers/${created.Id}`));
	}
}

const majorHandover = env.CURRENT_VERSION?.startsWith("4.") && env.TARGET_VERSION === "5.0.0";

async function runRecoveryWorker(mode, recoveryId, manager) {
	const label = manager.Config?.Labels?.["com.docker.compose.project.config_files"];
	const composeFile = String(label || "").split(",")[0];
	if (!path.isAbsolute(composeFile) || path.basename(composeFile) !== "docker-compose.yml") {
		throw new Error("Cannot identify the installed Compose directory");
	}
	const socketGid = (await fs.stat("/var/run/docker.sock")).gid;
	const managerEnv = Object.fromEntries((manager.Config?.Env || []).map((entry) => {
		const at = entry.indexOf("=");
		return at < 0 ? [entry, ""] : [entry.slice(0, at), entry.slice(at + 1)];
	}));
	const binds = [
		"/var/run/docker.sock:/var/run/docker.sock:ro",
		"nyxguard_update_recovery:/recovery:rw",
		`${path.dirname(composeFile)}:/host-install:rw`,
		"/var/lib/nyxguard-licensing:/host-vault:rw",
		...(["nyxguard_data", "nyxguard_db", "nyxguard_letsencrypt", "nyxguard_vpn", "nyxguard_vpn_auth"]
			.map((volume) => `${volume}:/source/${volume}:${mode === "restore" ? "rw" : "ro"}`)),
	];
	const name = `nyxguard-recovery-${mode}-${Date.now()}`;
	const created = await api("POST", `/containers/create?name=${encodeURIComponent(name)}`, {
		Image: `nyxmael/nyxguardmanager:${env.TARGET_VERSION}`,
		Entrypoint: ["node", "/app/internal/update-recovery-worker.js"], Cmd: [],
		Env: [
			`RECOVERY_ID=${recoveryId}`, `RECOVERY_MODE=${mode}`,
			`CURRENT_VERSION=${env.CURRENT_VERSION}`, `TARGET_VERSION=${env.TARGET_VERSION}`,
			`OLD_IMAGE_ID=${manager.Image}`, `APP_UID=${managerEnv.PUID || "1000"}`,
			`APP_GID=${managerEnv.PGID || "1000"}`, `SOCKET_GID=${socketGid}`,
		],
		HostConfig: { Binds: binds, NetworkMode: "none", AutoRemove: false },
	});
	try {
		await api("POST", `/containers/${created.Id}/start`);
		for (let attempt = 0; attempt < 900; attempt++) {
			const state = await api("GET", `/containers/${created.Id}/json`);
			if (!state.State?.Running) {
				if (state.State?.ExitCode !== 0) throw new Error(`Recovery ${mode} worker failed with exit ${state.State?.ExitCode}`);
				return;
			}
			await sleep(1000);
		}
		throw new Error(`Recovery ${mode} worker timed out`);
	} finally {
		await ignore(api("DELETE", `/containers/${created.Id}?force=1`));
	}
}

function replaceEnv(entries, replacements) {
	const keys = new Set(Object.keys(replacements));
	return [...(entries || []).filter((entry) => !keys.has(entry.slice(0, entry.indexOf("=")))),
		...Object.entries(replacements).map(([key, value]) => `${key}=${value}`)];
}

async function runMajorHandover() {
	const oldManager = await api("GET", `/containers/${env.OLD_MANAGER_ID}/json`);
	const oldVpn = await api("GET", `/containers/${env.OLD_VPN_ID}/json`);
	const initialNewManager = await api("GET", `/containers/${env.NEW_MANAGER_ID}/json`);
	const initialNewVpn = await api("GET", `/containers/${env.NEW_VPN_ID}/json`);
	const recoveryId = `nyx-500-${Date.now()}`;
	let managerId = env.NEW_MANAGER_ID;
	let vpnId = env.NEW_VPN_ID;
	let stoppedOld = false;
	let startedNew = false;
	await api("POST", "/volumes/create", { Name: "nyxguard_update_recovery", Labels: { "nyxguard.purpose": "major-update-recovery" } });
	try {
		// No application or VPN writes may occur between the SQL/volume backup and migration.
		await api("POST", `/containers/${env.OLD_VPN_ID}/stop?t=15`);
		await api("POST", `/containers/${env.OLD_MANAGER_ID}/stop?t=20`);
		stoppedOld = true;
		await runRecoveryWorker("backup", recoveryId, oldManager);
		const socketGid = (await fs.stat("/var/run/docker.sock")).gid;
		await api("DELETE", `/containers/${vpnId}?force=1`);
		await api("DELETE", `/containers/${managerId}?force=1`);
		const vaultBind = "/var/lib/nyxguard-licensing/vault.key:/run/nyxguard-licensing/vault.key:ro";
		const managerBody = {
			Image: initialNewManager.Config.Image,
			Env: replaceEnv(initialNewManager.Config.Env, {
				NYXCLOUD_LICENSE_VAULT_KEY_PATH: "/run/nyxguard-licensing/vault.key",
				NYXCLOUD_AUTHORITY_URL: "https://licensing.nyxcloud.ro",
				NYXCLOUD_SUPPORT_URL: "https://support-storage.nyxcloud.ro",
			}),
			Cmd: initialNewManager.Config.Cmd, Entrypoint: initialNewManager.Config.Entrypoint,
			WorkingDir: initialNewManager.Config.WorkingDir, ExposedPorts: initialNewManager.Config.ExposedPorts,
			Healthcheck: initialNewManager.Config.Healthcheck, Labels: initialNewManager.Config.Labels,
			HostConfig: {
				Binds: [...new Set([...(initialNewManager.HostConfig.Binds || []), vaultBind])],
				PortBindings: initialNewManager.HostConfig.PortBindings,
				RestartPolicy: initialNewManager.HostConfig.RestartPolicy,
				NetworkMode: initialNewManager.HostConfig.NetworkMode,
				ExtraHosts: initialNewManager.HostConfig.ExtraHosts,
				LogConfig: initialNewManager.HostConfig.LogConfig,
				GroupAdd: [...new Set([...(oldManager.HostConfig.GroupAdd || []).map(String), String(socketGid)])],
				CapAdd: initialNewManager.HostConfig.CapAdd, Devices: initialNewManager.HostConfig.Devices,
			},
		};
		managerId = (await api("POST", `/containers/create?name=${encodeURIComponent(env.OLD_MANAGER_NAME)}`, managerBody)).Id;
		const vpnBody = {
			Image: initialNewVpn.Config.Image, Env: initialNewVpn.Config.Env,
			Cmd: initialNewVpn.Config.Cmd, Entrypoint: initialNewVpn.Config.Entrypoint,
			WorkingDir: initialNewVpn.Config.WorkingDir, ExposedPorts: initialNewVpn.Config.ExposedPorts,
			Healthcheck: initialNewVpn.Config.Healthcheck || oldVpn.Config.Healthcheck,
			Labels: initialNewVpn.Config.Labels,
			HostConfig: {
				Binds: initialNewVpn.HostConfig.Binds, RestartPolicy: initialNewVpn.HostConfig.RestartPolicy,
				NetworkMode: `container:${managerId}`, ExtraHosts: initialNewVpn.HostConfig.ExtraHosts,
				LogConfig: initialNewVpn.HostConfig.LogConfig, GroupAdd: initialNewVpn.HostConfig.GroupAdd,
				CapAdd: initialNewVpn.HostConfig.CapAdd, Devices: initialNewVpn.HostConfig.Devices,
			},
		};
		vpnId = (await api("POST", `/containers/create?name=${encodeURIComponent(env.OLD_VPN_NAME)}`, vpnBody)).Id;
		await api("POST", `/containers/${managerId}/start`);
		startedNew = true;
		await waitHealthy(managerId);
		await runRecoveryWorker("verify", recoveryId, oldManager);
		await api("POST", `/containers/${vpnId}/start`);
		await waitHealthy(vpnId);
		const runningVpn = await api("GET", `/containers/${vpnId}/json`);
		if (runningVpn.HostConfig.NetworkMode !== `container:${managerId}`) throw new Error("VPN agent attached to the wrong Manager namespace");
		await updateState(true);
		await ignore(api("DELETE", `/containers/${env.OLD_VPN_ID}?force=1`));
		await ignore(api("DELETE", `/containers/${env.OLD_MANAGER_ID}?force=1`));
		console.log(`Major handover completed; verified recovery set ${recoveryId} retained`);
	} catch (error) {
		recovering = true;
		interrupted = false;
		console.error(`Major handover failed ${startedNew ? "after" : "before"} new Manager start: ${error instanceof Error ? error.message : String(error)}`);
		await ignore(api("POST", `/containers/${vpnId}/stop?t=5`));
		await ignore(api("DELETE", `/containers/${vpnId}?force=1`));
		await ignore(api("POST", `/containers/${managerId}/stop?t=5`));
		await ignore(api("DELETE", `/containers/${managerId}?force=1`));
		let migrationBoundary = "pre_migration";
		if (startedNew) {
			migrationBoundary = "unknown_after_start";
			try { await runRecoveryWorker("verify", recoveryId, oldManager); migrationBoundary = "post_migration"; }
			catch { /* The full recovery set is restored for either boundary. */ }
		}
		let recoveryRequired = startedNew;
		let recoveryManifestPresent = false;
		let recoveryRestored = false;
		try {
			await runRecoveryWorker("inspect", recoveryId, oldManager);
			recoveryManifestPresent = true;
			await runRecoveryWorker("restore", recoveryId, oldManager);
			recoveryRestored = true;
			recoveryRequired = false;
		} catch (restoreError) {
			// Only an explicit missing manifest proves backup stopped before
			// Compose could change. An inspect transport or worker failure is
			// ambiguous, so leave the old runtime stopped for manual recovery.
			const absentBeforeMigration = !startedNew && !recoveryManifestPresent &&
				String(restoreError?.message || "").includes("Recovery inspect worker failed with exit 2");
			recoveryRequired = !absentBeforeMigration;
			if (startedNew) console.error(`Database/volume recovery failed; old runtime will remain stopped: ${restoreError instanceof Error ? restoreError.message : String(restoreError)}`);
		}
		if (!recoveryRequired) {
			try {
				await api("POST", `/containers/${env.OLD_MANAGER_ID}/rename?name=${encodeURIComponent(env.OLD_MANAGER_NAME)}`);
				await api("POST", `/containers/${env.OLD_VPN_ID}/rename?name=${encodeURIComponent(env.OLD_VPN_NAME)}`);
				if (stoppedOld) {
					await api("POST", `/containers/${env.OLD_MANAGER_ID}/start`);
					await waitHealthy(env.OLD_MANAGER_ID);
					await api("POST", `/containers/${env.OLD_VPN_ID}/start`);
					await waitHealthy(env.OLD_VPN_ID);
				}
			} catch (restartError) {
				recoveryRequired = true;
				console.error(`Old runtime did not recover automatically: ${restartError instanceof Error ? restartError.message : String(restartError)}`);
			}
		}
		const recoveryStatus = recoveryRequired ? "manual_recovery_required" :
			(recoveryRestored ? "full_db_and_volume_restore" : "old_runtime_resumed_before_migration");
		await updateState(false, error, recoveryRequired, recoveryStatus, migrationBoundary).catch(() => undefined);
		throw error;
	}
}

async function runSameMajorHandover() {
  const {loadTransaction,persistTransaction,runTransaction,sourceSchemas}=await import('./handover-transaction.mjs');
  const transactionId=env.HOSTNAME;
  const identity={id:transactionId,sourceId:env.OLD_MANAGER_ID,sourceVersion:env.CURRENT_VERSION,
    targetId:env.NEW_MANAGER_ID,targetImage:env.TARGET_IMAGE_ID,targetVersion:env.TARGET_VERSION};
  const file=`/handover-data/.nyx-handover/${transactionId}.json`;
  let transaction=await loadTransaction(file,identity);
  const resumed=!!transaction;
  const activeFile='/handover-data/.nyx-handover/active.json';
  let active;
  try{active=JSON.parse(await fs.readFile(activeFile,'utf8'));}catch(error){if(error.code!=='ENOENT')throw new Error('Corrupt active handover identity');}
  if(active && !/^[a-f0-9]{12,64}$/.test(active.id||''))throw new Error('Invalid active handover identity');
  let needsBaseline=!!env.BASELINE_AUTHORIZATION;
  if(transaction&&active&&active.id!==transactionId){
    const actual=await baselinePlan('/handover-data',await api('GET',`/containers/${env.OLD_MANAGER_ID}/json`));
    const authorized=env.BASELINE_PLAN?JSON.parse(env.BASELINE_PLAN):null;
    // The helper's immutable creation environment retains the reviewed plan.
    // Its own recovery guard may change during uncertainty; original source
    // topology and historical pointer/ledger must still match before rollback.
    const fields=['format','managerId','image','mounts','project','configFiles','historicalId','pointerHash','ledgerHash'];
    if(!authorized||authorized.challenge!==env.BASELINE_AUTHORIZATION||fields.some(key=>JSON.stringify(actual[key])!==JSON.stringify(authorized[key])))throw new Error('Stale helper transaction cannot act on a newer handover');
  }
  if(needsBaseline&&!env.BASELINE_PLAN&&!transaction){const plan=await baselinePlan('/handover-data',await api('GET',`/containers/${env.OLD_MANAGER_ID}/json`));if(env.BASELINE_AUTHORIZATION!==plan.challenge||!env.BASELINE_REASON?.trim())throw new Error('BASELINE_REQUIRED: request a fresh plan and authorize it with a reason');env.BASELINE_PLAN=JSON.stringify(plan);}
  if(!transaction && active) {
    const previous=await loadTransaction(`/handover-data/.nyx-handover/${active.id}.json`);
    if(!previous||!['ROLLBACK_COMPLETE','COMMITTED'].includes(previous.phase)){
      const plan=await baselinePlan('/handover-data',await api('GET',`/containers/${env.OLD_MANAGER_ID}/json`));
      if(!env.BASELINE_AUTHORIZATION||env.BASELINE_AUTHORIZATION!==plan.challenge||!env.BASELINE_REASON?.trim())throw new Error('BASELINE_REQUIRED: request a baseline plan and explicitly authorize its challenge with a reason');
      env.BASELINE_PLAN=JSON.stringify(plan);needsBaseline=true;
    }
  }
  if(!transaction) {
    const old=await api('GET',`/containers/${env.OLD_MANAGER_ID}/json`);
    const vpn=env.OLD_VPN_ID?await api('GET',`/containers/${env.OLD_VPN_ID}/json`):null;
    const replacement=await api('GET',`/containers/${env.NEW_MANAGER_ID}/json`);
    // A missing ledger can only initialize against an actually healthy source
    // and a replacement which has NEVER run. Missing state after mutation is
    // corruption, not permission to select a new backup from the current DB.
    if(replacement.State.Running||!String(replacement.State.StartedAt).startsWith('0001-'))
      throw new Error('Missing transaction for an already-started replacement');
    const sourceImage=await api('GET',`/images/${encodeURIComponent(old.Image)}/json`);
    if(sourceImage.Config?.Labels?.['org.opencontainers.image.version']!==env.CURRENT_VERSION)
      throw new Error('Rollback runtime differs from declared source version');
    assertUpdateTarget(await api('GET',`/images/${encodeURIComponent(env.TARGET_IMAGE_ID)}/json`),env.TARGET_VERSION,env.CURRENT_VERSION);
    const volumes=await sameMajorVolumes(old,vpn);
    const compose=String(old.Config.Labels?.['com.docker.compose.project.config_files']||'').split(',')[0];
    if(!path.isAbsolute(compose)||path.basename(compose)!=='docker-compose.yml')throw new Error('Installed Compose identity missing');
    transaction={format:'nyxguard-handover-v1',id:transactionId,sequence:0,phase:'INITIALIZED',
      recoveryId:`nyx-same-${transactionId}`,backupVerified:false,mutationPossible:false,committed:false,
      source:{id:old.Id,image:old.Image,version:env.CURRENT_VERSION,schema:sourceSchemas[env.CURRENT_VERSION],
        name:env.OLD_MANAGER_NAME,vpnId:env.OLD_VPN_ID||null,vpnName:env.OLD_VPN_NAME||null,volumes,installDir:path.dirname(compose)},
      target:{id:env.NEW_MANAGER_ID,originalId:env.NEW_MANAGER_ID,vpnId:env.NEW_VPN_ID||null,image:env.TARGET_IMAGE_ID,version:env.TARGET_VERSION}};
    await persistTransaction(file,transaction);
  }
  if(!needsBaseline&&(!active||active.id!==transactionId))await durableJson(activeFile,{id:transactionId});
  sameMajorInstallDir=transaction.source.installDir;
  await resolveInstalledTopology(await api('GET',`/containers/${transaction.phase==='COMMITTED'?transaction.target.id:transaction.source.id}/json`));
  const volumes=transaction.source.volumes,recoveryId=transaction.recoveryId;
  const hasVpn=!!transaction.source.vpnId;
  const worker=(mode,t)=>runSameMajorWorker(mode,recoveryId,volumes,t);
  const inspect=async id=>{
    try{return await api('GET',`/containers/${id}/json`);}catch(error){if(/failed: 404$/.test(error.message))return null;throw error;}
  };
  const assertSource=async t=>{
    const old=await inspect(t.source.id);
    if(!old||old.Image!==t.source.image)throw new Error('Source runtime identity lost');
    const image=await api('GET',`/images/${encodeURIComponent(old.Image)}/json`);
    if(image.Config?.Labels?.['org.opencontainers.image.version']!==t.source.version)throw new Error('Source runtime version differs');
  };
  const sourceStart=async t=>{
    await assertSource(t);
    const source=await inspect(t.source.id);
    if(source.Name.replace(/^\//,'')!==t.source.name)await api('POST',`/containers/${t.source.id}/rename?name=${encodeURIComponent(t.source.name)}`);
    if(hasVpn){const vpn=await inspect(t.source.vpnId);if(vpn.Name.replace(/^\//,'')!==t.source.vpnName)await api('POST',`/containers/${t.source.vpnId}/rename?name=${encodeURIComponent(t.source.vpnName)}`);}
    if(!(await inspect(t.source.id)).State.Running)await api('POST',`/containers/${t.source.id}/start`);
    await waitHealthy(t.source.id);
    if(hasVpn){if(!(await inspect(t.source.vpnId)).State.Running)await api('POST',`/containers/${t.source.vpnId}/start`);await waitHealthy(t.source.vpnId);}
  };
  const stop=async id=>{const c=id?await inspect(id):null;if(c?.State.Running)await api('POST',`/containers/${id}/stop?t=10`);};
  const effects={
    boundary:async phase=>{console.log(`Durable handover phase: ${phase}`);if(['SOURCE_VERIFIED','REPLACEMENT_PREPARED','BACKUP_STARTING','BACKUP_VERIFIED','REPLACEMENT_STARTING','REPLACEMENT_READY','APPLICATION_DATA_VERIFIED','COMMITTING'].includes(phase))assertNotInterrupted();},
    verifySourcePair:async t=>{await assertSource(t);await worker(t.restoreVerified?'verify-source':'pair',t);},
    prepareReplacement:async t=>{
      env.NEW_MANAGER_ID=t.target.id;env.NEW_VPN_ID=t.target.vpnId||'';
      await normalizeReplacement();return {id:env.NEW_MANAGER_ID,vpnId:env.NEW_VPN_ID||null};
    },
    backup:async t=>{
      if(hasVpn)await stop(t.source.vpnId);await stop(t.source.id);
      await worker('backup',t);
      // A successful process exit is not a protected-backup acknowledgment.
      // Reuse the existing verification worker against the source-stage ledger.
      if(needsBaseline){await worker('baseline',t);await durableJson(activeFile,{id:transactionId});}
    },
    startReplacement:async t=>{
      env.NEW_MANAGER_ID=t.target.id;env.NEW_VPN_ID=t.target.vpnId||'';
      await api('POST',`/containers/${t.target.id}/start`);await waitHealthy(t.target.id);
      if(hasVpn){await api('POST',`/containers/${t.target.vpnId}/start`);await waitHealthy(t.target.vpnId);
        if((await inspect(t.target.vpnId)).HostConfig.NetworkMode!==`container:${t.target.id}`)throw new Error('VPN Agent namespace differs');}
    },
    verifyTargetData:async t=>{await worker('verify',t);},
    commitMetadata:async t=>{await worker('metadata',t);},
    verifyCommitted:async t=>{
      const target=await inspect(t.target.id);
      if(!target||target.Image!==t.target.image)throw new Error('Committed runtime differs');
      await waitHealthy(t.target.id);await worker('verify',t);
    },
    finishCommit:async t=>{
      await updateState(true,null,false,null,null,false,recoveryId);
      if(hasVpn){const old=await inspect(t.source.vpnId);if(old)await api('DELETE',`/containers/${old.Id}?force=1`);}
      const old=await inspect(t.source.id);if(old)await api('DELETE',`/containers/${old.Id}?force=1`);
      // Keep the validated original stage through idempotent committed resume.
      // Rotation is a later explicit lifecycle operation, never a success test.
      await finishRecoveryCleanup(recoveryId);
    },
    stopReplacement:async t=>{
      await assertSource(t);
      recovering=true;interrupted=false;
      // Resolve only a transaction-owned target with its immutable image. This
      // also handles death inside legacy stopped-container normalization.
      const ids=new Set([t.target.id,t.target.vpnId].filter(Boolean));
      const canonical=await inspect(t.source.name);
      if(canonical&&canonical.Id!==t.source.id){
        if(canonical.Image!==t.target.image)throw new Error('Unrecognized runtime occupies source name');
        ids.add(canonical.Id);
      }
      if(hasVpn){const canonicalVpn=await inspect(t.source.vpnName);if(canonicalVpn&&canonicalVpn.Id!==t.source.vpnId)ids.add(canonicalVpn.Id);}
      for(const id of [...ids].reverse()) {await stop(id);if(await inspect(id))await api('DELETE',`/containers/${id}`);}
      // An interrupted parent does not terminate its already-created worker.
      // Join transaction-owned workers before restoring files/metadata so a
      // late metadata or filesystem write cannot race the rollback.
      const all=await api('GET','/containers/json?all=1');
      for(const summary of all) {
        if(!(summary.Names||[]).some(name=>name.startsWith('/nyxguard-same-major-')))continue;
        let child=await inspect(summary.Id);
        if(!child?.Config.Env.includes(`RECOVERY_ID=${t.recoveryId}`))continue;
        if(child.Image!==t.target.image)throw new Error('Recovery worker image differs from transaction');
        await waitRecoveryWorker(summary.Id);
      }
    },
    restore:async t=>{if(hasVpn)await stop(t.source.vpnId);await stop(t.source.id);await worker('restore',t);},
    startSource:sourceStart,
    verifySourceData:async t=>{await worker('verify-source',t);},
    recordRollback:async t=>{
      if(needsBaseline){
        const completed=await fs.readFile(`/handover-data/.nyx-baselines/${env.BASELINE_AUTHORIZATION}/${recoveryId}/completed.json`,'utf8').catch(error=>{if(error.code==='ENOENT')return null;throw error;});
        if(!completed){console.log('Current baseline acceptance incomplete; historical recovery guard retained. Request a fresh baseline plan before retry.');return;}
      }
      await updateState(false,t.failure?`${t.failure.category}: ${t.failure.message}`:'Handover rolled back',false,'source_pair_verified',t.mutationPossible?'after_start':'before_start',true,recoveryId);
    },
    finalizeRollback:async t=>{if(t.mutationPossible)await worker('finalize',t).catch(()=>console.error('Evidence rotation deferred; verified source retained'));},
  };
  try {
    const outcome=await runTransaction(transaction,effects,t=>persistTransaction(file,t),resumed);
    if(outcome.result!=='committed') {
      const failure=outcome.transaction.failure;
      throw Object.assign(new Error('Upgrade failed; verified source runtime/data restored'),{handoverFailure:failure});
    }
    console.log(`Same-major handover to v${env.TARGET_VERSION} completed`);
  } catch(error) {
    // Retain journal/recovery identity; never restart old code on unverified DB.
    const final=await loadTransaction(file,identity);
    const workerUncertain=['WORKER_STATE_UNCERTAIN','WORKER_DEADLINE_EXCEEDED'].includes(error?.code);
    // A historical terminal phase does not certify a newly timed-out worker.
    // Existing recovery-required state blocks the normal caller/CLI retry path.
    if(workerUncertain||(final?.phase!=='ROLLBACK_COMPLETE'&&final?.phase!=='COMMITTED'))
      await updateState(false,JSON.stringify({message:'Durable recovery requires retry',originalFailure:final?.failure||sanitizedFailure(error,final?.phase),recoveryFailure:error.handoverRecoveryFailure||sanitizedFailure(error,final?.phase)}),true,'durable_resume_required',final?.mutationPossible?'after_start':'before_start',true,recoveryId).catch(()=>undefined);
    throw error;
  }
}

if (majorHandover) {
	try { await runMajorHandover(); }
	catch { process.exitCode = 1; }
} else {
	try { await runSameMajorHandover(); }
	catch(error) { console.error(JSON.stringify({message:'Same-major handover refused/failed',failure:error.handoverFailure||sanitizedFailure(error),recoveryFailure:error.handoverRecoveryFailure}));process.exitCode = 1; }
}
