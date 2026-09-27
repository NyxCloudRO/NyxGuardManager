import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";

const env = process.env;
const api = (method, pathname, body = null) =>
	new Promise((resolve, reject) => {
		const req = http.request(
			{
				socketPath: "/var/run/docker.sock",
				path: `/v1.41${pathname}`,
				method,
				headers: body ? { "Content-Type": "application/json" } : undefined,
			},
			(res) => {
				let raw = "";
				res.setEncoding("utf8");
				res.on("data", (chunk) => (raw += chunk));
				res.on("end", () => {
					if ((res.statusCode || 500) >= 400) {
						reject(new Error(`${method} ${pathname}: ${res.statusCode} ${raw}`));
						return;
					}
					try {
						resolve(raw ? JSON.parse(raw) : {});
					} catch {
						resolve(raw);
					}
				});
			},
		);
		req.on("error", reject);
		if (body) req.write(JSON.stringify(body));
		req.end();
	});

const ignore = (promise) => promise.catch(() => undefined);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitHealthy(id, timeoutMs = 120000) {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		const info = await api("GET", `/containers/${id}/json`);
		if (!info.State?.Running) throw new Error(`${id} stopped during startup`);
		const health = info.State.Health?.Status;
		if (health === "healthy" || (!info.State.Health && Date.now() + 5000 < deadline)) {
			if (!info.State.Health) await sleep(5000);
			return;
		}
		if (health === "unhealthy") throw new Error(`${id} became unhealthy`);
		await sleep(2000);
	}
	throw new Error(`${id} did not become healthy in time`);
}

async function updateState(success, error = null, manualRecoveryRequired = false, recoveryStatus = null, migrationBoundary = null) {
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
		state.restartPending = true;
		state.pendingVersion = env.TARGET_VERSION;
		state.lastApplyFailure = { at: new Date().toISOString(), error: String(error || "handover failed"),
			...(recoveryStatus ? { recoveryStatus } : {}), ...(migrationBoundary ? { migrationBoundary } : {}) };
		state.manualRecoveryRequired = manualRecoveryRequired;
	}
	await fs.mkdir("/handover-data/update-manager", { recursive: true });
	await fs.writeFile(file, JSON.stringify(state, null, 2), "utf8");
}

async function rollback(error) {
	console.error(`Handover failed: ${error instanceof Error ? error.message : String(error)}`);
	await ignore(api("POST", `/containers/${env.NEW_VPN_ID}/stop?t=5`));
	await ignore(api("DELETE", `/containers/${env.NEW_VPN_ID}?force=1`));
	await ignore(api("POST", `/containers/${env.NEW_MANAGER_ID}/stop?t=5`));
	await ignore(api("DELETE", `/containers/${env.NEW_MANAGER_ID}?force=1`));
	await ignore(api("POST", `/containers/${env.OLD_MANAGER_ID}/rename?name=${encodeURIComponent(env.OLD_MANAGER_NAME)}`));
	await ignore(api("POST", `/containers/${env.OLD_VPN_ID}/rename?name=${encodeURIComponent(env.OLD_VPN_NAME)}`));
	await ignore(api("POST", `/containers/${env.OLD_MANAGER_ID}/start`));
	await waitHealthy(env.OLD_MANAGER_ID).catch(() => undefined);
	await ignore(api("POST", `/containers/${env.OLD_VPN_ID}/start`));
	await updateState(false, error).catch(() => undefined);
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

if (majorHandover) {
	try { await runMajorHandover(); }
	catch { process.exitCode = 1; }
} else try {
	await sleep(1500);
	await api("POST", `/containers/${env.OLD_VPN_ID}/stop?t=15`);
	await api("POST", `/containers/${env.OLD_MANAGER_ID}/stop?t=20`);
	await api("POST", `/containers/${env.NEW_MANAGER_ID}/start`);
	await waitHealthy(env.NEW_MANAGER_ID);
	await api("POST", `/containers/${env.NEW_VPN_ID}/start`);
	await waitHealthy(env.NEW_VPN_ID);
	await updateState(true);
	await api("DELETE", `/containers/${env.OLD_VPN_ID}?force=1`);
	await api("DELETE", `/containers/${env.OLD_MANAGER_ID}?force=1`);
	console.log(`Handover to v${env.TARGET_VERSION} completed successfully.`);
} catch (error) {
	await rollback(error);
	process.exitCode = 1;
}
