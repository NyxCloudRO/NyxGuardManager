// Host adapter for the guarded same-major engine in the published Manager image.
// The root handover helper owns backup, replacement, health gates and recovery.
import http from "node:http";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";

const legacyApi = (method, endpoint, body = null) => new Promise((resolve, reject) => {
	const request = http.request({ socketPath: "/var/run/docker.sock", path: `/v1.41${endpoint}`, method,
		headers: body ? { "Content-Type": "application/json" } : undefined }, (response) => {
		let raw = "";
		response.setEncoding("utf8");
		response.on("data", (part) => { raw += part; });
		response.on("end", () => {
			if ((response.statusCode || 500) >= 400) return reject(new Error(`Docker ${method} ${endpoint}: ${response.statusCode}`));
			try { resolve(raw ? JSON.parse(raw) : {}); } catch { resolve(raw); }
		});
	});
	request.on("error", reject);
	if (body) request.write(JSON.stringify(body));
	request.end();
});
const api = async (...args) => {
  if(/^5\.(?:[1-9]\d*\.\d+|0\.(?:[4-9]|[1-9]\d+))$/.test(process.env.TARGET_VERSION||'')) return (await import('/app/internal/recovery-docker.mjs')).docker(...args);
  return legacyApi(...args);
};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const q = encodeURIComponent;
const releasePolicy=/^5\.(?:[1-9]\d*\.\d+|0\.(?:[6-9]|[1-9]\d+))$/.test(process.env.TARGET_VERSION||'')?(await import('/app/internal/release-policy.mjs')).default:null;
let image;
let approvedBaselinePlan=null;
let vpnImage;
let oldManager, oldVpn, newManagerId, newVpnId, helperId;
let managerRenamed = false, vpnRenamed = false, helperStartAttempted = false;

export function groupAddForSocket(previous, socketGid) {
	if (!Number.isSafeInteger(socketGid) || socketGid < 0) throw new Error("Invalid Docker socket GID");
	const groups = Array.isArray(previous) ? previous.map(String) : [];
	return [...new Set(socketGid === 0 ? groups : [...groups, String(socketGid)])];
}

export function selectTopology(containers, installDir) {
	const configFile = `${installDir}/docker-compose.yml`;
	const matching = (service) => containers.filter((item) =>
		item.Labels?.["com.docker.compose.service"] === service &&
		String(item.Labels?.["com.docker.compose.project.config_files"] || "").split(",")[0] === configFile);
	const managers = matching("nyxguard-manager").filter(c=>c.State==='running');
	if (managers.length !== 1) throw new Error(`Expected exactly one installed Manager; found ${managers.length}`);
	const manager = managers[0];
	const project = manager.Labels?.["com.docker.compose.project"];
	if (!project) throw new Error("Manager has no Compose project identity");
	const withinProject = (service) => matching(service).filter((item) => item.Labels?.["com.docker.compose.project"] === project);
	const databases = withinProject("db").filter(c=>c.State==='running');
	if (databases.length !== 1) throw new Error(`Expected exactly one installed database; found ${databases.length}`);
	const vpns = withinProject("vpn-client-agent").filter(c=>c.State==='running');
	if (vpns.length > 1) throw new Error(`Ambiguous VPN agents in Compose project ${project}`);
	if (matching("vpn-client-agent").filter(c=>c.State==='running').length !== vpns.length) throw new Error("VPN service has inconsistent Compose project labels");
	if (!releasePolicy && containers.some((item) => item.Id !== vpns[0]?.Id &&
		(item.Names || []).includes("/nyxguard-vpn-agent"))) {
		throw new Error("A VPN container exists outside the installed Compose service");
	}
	return { manager, database: databases[0], vpn: vpns[0] || null, project };
}

async function checkedContainer(summary, expectedImage) {
	const container = await api("GET", `/containers/${q(summary.Id)}/json`);
	if (!container.State?.Running || container.State.Health?.Status !== "healthy" || container.Image !== (await api("GET", `/images/${q(expectedImage)}/json`)).Id) {
		throw new Error(`Expected one healthy running ${expectedImage} Compose service`);
	}
	return container;
}

export function supportedTransition(current, target) {
  if(target===releasePolicy?.version)return Object.hasOwn(releasePolicy.sources,current);
	return (["5.0.1","5.0.2","5.0.3","5.0.4"].includes(current) && target === "5.0.5") ||
		(["5.0.1","5.0.2","5.0.3"].includes(current) && target === "5.0.4") ||
		(current === "5.0.1" && ["5.0.2", "5.0.3"].includes(target)) ||
		(current === "5.0.2" && target === "5.0.3");
}

async function setup() {
	const currentVersion = process.env.CURRENT_VERSION;
	const targetVersion = process.env.TARGET_VERSION;
	if (!supportedTransition(currentVersion, targetVersion)) {
		throw new Error("Unsupported CLI handover transition");
	}
	const target = await api("GET", `/images/${q(process.env.TARGET_IMAGE_REF || `nyxmael/nyxguardmanager:${targetVersion}`)}/json`);
	if (target.Config?.Labels?.["org.opencontainers.image.version"] !== targetVersion) throw new Error("Unexpected target Manager version");
	image = target.Id;
	const agent = await api("GET", "/images/nyxmael%2Fnyxguardmanager-vpn-agent%3A5.0.1/json").catch((error) => {
		if (!String(error.message).endsWith(": 404")) throw error;
		return null;
	});
	vpnImage = agent?.Id;
	const all = await api("GET", "/containers/json?all=1");
	const installDir = process.env.HOST_INSTALL_DIR;
	if (!installDir?.startsWith("/") || installDir.includes("..")) throw new Error("Invalid installed Compose directory");
	const topology = selectTopology(all, installDir);
	oldManager = await checkedContainer(topology.manager, `nyxmael/nyxguardmanager:${currentVersion}`);
	const database = await api("GET", `/containers/${q(topology.database.Id)}/json`);
	if (!database.State?.Running) throw new Error("Installed database is not running");
  if(releasePolicy)(await import("/app/internal/release-policy.mjs")).assertDatabasePair(oldManager,database);
	const names = all.flatMap((item) => item.Names || []);
  for(const summary of all.filter(c=>(c.Names||[]).some(name=>/^\/nyxguard-update-handover/.test(name))&&c.State!=='exited')){
    const helper=await api('GET',`/containers/${summary.Id}/json`);
    if(helper.Config.Env?.includes('OLD_MANAGER_ID='+oldManager.Id)||helper.Config.Env?.includes('NEW_MANAGER_ID='+oldManager.Id)||helper.Config.Labels?.['nyxguard.install-dir']===installDir)throw new Error('An active handover owns this installation; use supported resume after it exits');
  }
	if (topology.vpn) {
		oldVpn = await checkedContainer(topology.vpn, "nyxmael/nyxguardmanager-vpn-agent:5.0.1");
		if (!vpnImage || oldVpn.Image !== vpnImage) throw new Error("Installed VPN Agent differs from the published compatible image");
	}
	const data = (oldManager.Mounts || []).find((mount) => mount.Destination === "/data");
	if (!data || !["volume", "bind"].includes(data.Type)) throw new Error("Persistent Manager /data mount not found");
	const dataSource = data.Type === "volume" ? data.Name : data.Source;
	if (!dataSource) throw new Error("Invalid Manager /data mount");
  if(process.env.BASELINE_PLAN_ONLY==='1'||process.env.BASELINE_AUTHORIZATION) {
    const {docker}=await import('/app/internal/recovery-docker.mjs');
    const identity={Id:oldManager.Id,Image:oldManager.Image,Mounts:oldManager.Mounts,Config:{Labels:oldManager.Config.Labels}};
    const c=await docker('POST','/containers/create',{Image:image,Entrypoint:['node','/app/internal/baseline-plan-cli.mjs'],Env:['BASELINE_MANAGER='+JSON.stringify(identity)],Healthcheck:{Test:['NONE']},HostConfig:{Binds:[dataSource+':/handover-data:ro'],NetworkMode:'none'}});
    await docker('POST',`/containers/${c.Id}/start`);
    let planVerified=false;
    for(let n=0;n<30;n++){const info=await docker('GET',`/containers/${c.Id}/json`);if(!info.State.Running){const raw=String(await docker('GET',`/containers/${c.Id}/logs?stdout=1&stderr=1`));const clean=raw.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g,'');if(info.State.ExitCode)throw new Error('Baseline plan refused; inspect plan helper logs');const plan=JSON.parse(clean.slice(clean.indexOf('{'),clean.lastIndexOf('}')+1));planVerified=true;approvedBaselinePlan=plan;await docker('DELETE',`/containers/${c.Id}`);if(process.env.BASELINE_PLAN_ONLY==='1'){console.log(JSON.stringify(plan));return;}if(process.env.BASELINE_AUTHORIZATION!==plan.challenge||!process.env.BASELINE_REASON?.trim())throw new Error('BASELINE_REQUIRED: authorization differs; request a fresh plan before retrying');break;}await sleep(1000);}
    if(!planVerified)throw new Error('Baseline plan deadline exceeded');
  }
  // Reject incompatible or corrupt retained evidence before renaming services.
  // Explicit baseline acceptance retains its separately verified authorization.
  if(releasePolicy && !approvedBaselinePlan) {
    let pointer;
    try {pointer=JSON.parse(await fs.readFile('/handover-data/.nyx-handover/active.json','utf8'));}
    catch(error) {if(error.code!=='ENOENT')throw new Error('Invalid historical handover pointer; review recovery evidence');}
    if(pointer) {
      if(!/^[a-f0-9]{12,64}$/.test(pointer.id||''))throw new Error('Invalid historical handover identity');
      const {loadTransaction}=await import('/app/internal/handover-transaction.mjs');
      const previous=await loadTransaction(`/handover-data/.nyx-handover/${pointer.id}.json`);
      if(!previous||!['ROLLBACK_COMPLETE','COMMITTED'].includes(previous.phase))
        throw new Error('BASELINE_REQUIRED: review unfinished historical recovery before authorizing a new baseline');
    }
  }
	const socketGid = (await fs.stat("/var/run/docker.sock")).gid;
	const token = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
	const oldManagerName = String(oldManager.Name).replace(/^\//, "");
	const oldVpnName = oldVpn ? String(oldVpn.Name).replace(/^\//, "") : "";
	const safeLabels = (labels = {}) => Object.fromEntries(Object.entries(labels).filter(([key]) =>
		!["org.opencontainers.image.version", "org.opencontainers.image.revision", "org.opencontainers.image.created", "com.docker.compose.image"].includes(key)));
	const managerConfig = {
		Image: image,
    NetworkingConfig:{EndpointsConfig:Object.fromEntries(Object.entries(oldManager.NetworkSettings.Networks).map(([name,network])=>[name,{Aliases:network.Aliases,IPAMConfig:network.IPAMConfig}]))},
		Env: (oldManager.Config.Env || []).filter((entry) => !/^NPM_BUILD_(VERSION|COMMIT|DATE)=/.test(entry)),
		Cmd: oldManager.Config.Cmd, Entrypoint: oldManager.Config.Entrypoint,
		WorkingDir: oldManager.Config.WorkingDir, ExposedPorts: oldManager.Config.ExposedPorts,
		Healthcheck: ["5.0.4","5.0.5","5.0.6"].includes(targetVersion) ? target.Config.Healthcheck : oldManager.Config.Healthcheck, Labels: {...safeLabels(oldManager.Config.Labels),"com.docker.compose.image":image},
		HostConfig: {
			Binds: oldManager.HostConfig.Binds, PortBindings: oldManager.HostConfig.PortBindings,
			RestartPolicy: oldManager.HostConfig.RestartPolicy, NetworkMode: oldManager.HostConfig.NetworkMode,
			GroupAdd: groupAddForSocket(oldManager.HostConfig.GroupAdd, socketGid), ExtraHosts: oldManager.HostConfig.ExtraHosts,
			LogConfig: oldManager.HostConfig.LogConfig, CapAdd: oldManager.HostConfig.CapAdd,
			Devices: oldManager.HostConfig.Devices,
		},
	};
	const vpnConfig = oldVpn ? {
		Image: vpnImage, Env: oldVpn.Config.Env, Cmd: oldVpn.Config.Cmd,
		Entrypoint: oldVpn.Config.Entrypoint, WorkingDir: oldVpn.Config.WorkingDir,
		ExposedPorts: oldVpn.Config.ExposedPorts, Healthcheck: oldVpn.Config.Healthcheck,
		Labels: {...safeLabels(oldVpn.Config.Labels),"com.docker.compose.image":vpnImage},
		HostConfig: {
			Binds: oldVpn.HostConfig.Binds, RestartPolicy: oldVpn.HostConfig.RestartPolicy,
			NetworkMode: `container:${oldManager.Id}`, ExtraHosts: oldVpn.HostConfig.ExtraHosts,
			GroupAdd: oldVpn.HostConfig.GroupAdd, LogConfig: oldVpn.HostConfig.LogConfig,
			CapAdd: oldVpn.HostConfig.CapAdd, Devices: oldVpn.HostConfig.Devices,
		},
	} : null;
	await api("POST", `/containers/${oldManager.Id}/rename?name=${q(`${oldManagerName}-rollback-${token}`)}`);
	managerRenamed = true;
	if (oldVpn) {
		await api("POST", `/containers/${oldVpn.Id}/rename?name=${q(`${oldVpnName}-rollback-${token}`)}`);
		vpnRenamed = true;
	}
	newManagerId = (await api("POST", `/containers/create?name=${q(oldManagerName)}`, managerConfig)).Id;
	if (vpnConfig) {
		vpnConfig.HostConfig.NetworkMode = `container:${newManagerId}`;
		newVpnId = (await api("POST", `/containers/create?name=${q(oldVpnName)}`, vpnConfig)).Id;
	}
	const helper = await api("POST", `/containers/create?name=${q(`nyxguard-update-handover-${token}`)}`, {
		Image: image, Entrypoint: ["node", "/app/internal/update-handover.js"], Cmd: [], Healthcheck:{Test:["NONE"]},
    Labels:{"nyxguard.install-dir":installDir,"nyxguard.target-version":targetVersion},
		Env: [
			`OLD_MANAGER_ID=${oldManager.Id}`, `OLD_MANAGER_NAME=${oldManagerName}`,
			`NEW_MANAGER_ID=${newManagerId}`, `TARGET_IMAGE_ID=${image}`,
			...(oldVpn ? [`OLD_VPN_ID=${oldVpn.Id}`, `OLD_VPN_NAME=${oldVpnName}`, `NEW_VPN_ID=${newVpnId}`] : []),
			`CURRENT_VERSION=${currentVersion}`, `TARGET_VERSION=${targetVersion}`,
      `BASELINE_PLAN=${approvedBaselinePlan?JSON.stringify(approvedBaselinePlan):""}`,`BASELINE_AUTHORIZATION=${process.env.BASELINE_AUTHORIZATION||''}`,`BASELINE_REASON=${process.env.BASELINE_REASON||''}`,
		],
		HostConfig: { Binds: ["/var/run/docker.sock:/var/run/docker.sock", `${dataSource}:/handover-data`], NetworkMode: "none" },
	});
	helperId = helper.Id;
	helperStartAttempted = true;
	await api("POST", `/containers/${helper.Id}/start`);
	console.log("Verified handover helper started; waiting for recovery and health gates...");
	for (let attempt = 0; attempt < 1800; attempt++) {
		const state = await api("GET", `/containers/${helper.Id}/json`);
		if (!state.State.Running) {
			const logs = await new Promise((resolve, reject) => {
				const request = http.get({ socketPath: "/var/run/docker.sock", path: `/containers/${helper.Id}/logs?stdout=1&stderr=1&tail=60` }, (response) => {
					const chunks = []; response.on("data", (chunk) => chunks.push(chunk));
					response.on("end", () => resolve(Buffer.concat(chunks).toString("utf8").replace(/[^\x09\x0A\x0D\x20-\x7E]/g, "")));
				}); request.on("error", reject);
			});
			console.log(logs);
			if (state.State.ExitCode !== 0) throw new Error(`Handover failed (helper exit ${state.State.ExitCode}); inspect persistent recovery state before retrying`);
			console.log(`Upgrade complete. Now running: ${targetVersion}`);
			return;
		}
		await sleep(1000);
	}
	throw new Error("Handover helper is still running; inspect it before retrying");
}


async function main() {
	try { await setup(); }
	catch (error) {
		let safeToClean = !helperStartAttempted;
		if (helperStartAttempted && helperId) {
			try {
				const helper = await api("GET", `/containers/${helperId}/json`);
				safeToClean = helper.State?.Status === "created";
			} catch {
				// A lost start response is ambiguous. Do not remove containers the
				// handover helper may already be using.
			}
		}
		if (safeToClean) {
			try {
				if (helperId) await api("DELETE", `/containers/${helperId}?force=1`);
				if (newVpnId) await api("DELETE", `/containers/${newVpnId}?force=1`);
				if (newManagerId) await api("DELETE", `/containers/${newManagerId}?force=1`);
				if (managerRenamed) await api("POST", `/containers/${oldManager.Id}/rename?name=${q(String(oldManager.Name).replace(/^\//, ""))}`);
				if (vpnRenamed) await api("POST", `/containers/${oldVpn.Id}/rename?name=${q(String(oldVpn.Name).replace(/^\//, ""))}`);
			} catch (cleanupError) {
				console.error(`Setup cleanup is incomplete; inspect containers before retrying: ${cleanupError instanceof Error ? cleanupError.message : String(cleanupError)}`);
			}
		} else {
			console.error(`Handover helper state requires review before retrying (container ${helperId}).`);
		}
		console.error(`ERROR: ${error instanceof Error ? error.message : String(error)}`);
		process.exitCode = 1;
	}
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
