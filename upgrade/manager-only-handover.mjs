// Recovery-preserving 4.0.18 -> 5.0.0 handover for installer-managed hosts
// that never had a VPN agent because TUN was unavailable. Runs in the pinned
// 5.0.0 image, but is supplied by the host updater rather than that image.
import fs from "node:fs/promises";
import fsSync from "node:fs";
import http from "node:http";
import path from "node:path";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import { pipeline } from "node:stream/promises";
import { createRequire } from "node:module";

const require = createRequire("/app/package.json");
const yaml = require("js-yaml");
const env = process.env;
const recoveryId = env.RECOVERY_MODE === "restore" ? env.RECOVERY_ID : `nyx-500-manager-only-${Date.now()}`;
if (!/^nyx-500-manager-only-[0-9]{10,16}$/.test(recoveryId || "")) throw new Error("Invalid recovery ID");
const recoveryRoot = `/recovery/${recoveryId}`;
const volumes = ["nyxguard_data", "nyxguard_db", "nyxguard_letsencrypt", "nyxguard_vpn_auth"];
const expectedManager = "nyxmael/nyxguardmanager:4.0.18";
const targetManager = "nyxmael/nyxguardmanager:5.0.0";
const expectedVpn = "nyxmael/nyxguardmanager-vpn-agent:4.0.18";
const targetVpn = "nyxmael/nyxguardmanager-vpn-agent:5.0.0";

function api(method, endpoint, body = null) {
	return new Promise((resolve, reject) => {
		const request = http.request({ socketPath: "/var/run/docker.sock", path: `/v1.41${endpoint}`, method,
			headers: body ? { "Content-Type": "application/json" } : undefined }, (response) => {
			const chunks = [];
			response.on("data", (chunk) => chunks.push(chunk));
			response.on("end", () => {
				const raw = Buffer.concat(chunks).toString("utf8");
				if ((response.statusCode || 500) >= 400) return reject(new Error(`Docker ${method} ${endpoint}: ${response.statusCode} ${raw.slice(0, 256)}`));
				try { resolve(raw ? JSON.parse(raw) : {}); } catch { resolve(raw); }
			});
		});
		request.on("error", reject);
		if (body) request.write(JSON.stringify(body));
		request.end();
	});
}

const ignore = (promise) => promise.catch(() => undefined);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const q = encodeURIComponent;

async function run(program, args) {
	await new Promise((resolve, reject) => {
		const child = spawn(program, args, { stdio: "ignore" });
		child.on("error", reject);
		child.on("exit", (code) => code === 0 ? resolve() : reject(new Error(`${program} exited ${code}`)));
	});
}

async function digest(filename) {
	const hash = crypto.createHash("sha256");
	for await (const chunk of fsSync.createReadStream(filename)) hash.update(chunk);
	return hash.digest("hex");
}

async function waitHealthy(id, timeoutMs = 180000) {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		const info = await api("GET", `/containers/${q(id)}/json`);
		if (!info.State?.Running) throw new Error("Replacement Manager stopped during startup");
		if (info.State.Health?.Status === "healthy") return;
		if (info.State.Health?.Status === "unhealthy") throw new Error("Replacement Manager became unhealthy");
		await sleep(2000);
	}
	throw new Error("Replacement Manager did not become healthy in time");
}

async function runDbSidecar(db, command, maxAttempts = 300) {
	const name = `nyx-update-db-${recoveryId}-${Date.now()}`;
	const created = await api("POST", `/containers/create?name=${q(name)}`, {
		Image: db.Config.Image, Entrypoint: ["sh", "-lc"], Cmd: [command], Env: db.Config.Env,
		HostConfig: { Binds: ["nyxguard_update_recovery:/recovery:rw"], NetworkMode: db.HostConfig.NetworkMode },
	});
	try {
		await api("POST", `/containers/${created.Id}/start`);
		for (let attempt = 0; attempt < maxAttempts; attempt++) {
			const info = await api("GET", `/containers/${created.Id}/json`);
			if (!info.State.Running) {
				if (info.State.ExitCode !== 0) throw new Error(`MariaDB recovery command failed (exit ${info.State.ExitCode})`);
				return;
			}
			await sleep(1000);
		}
		throw new Error("MariaDB recovery command timed out");
	} finally {
		await ignore(api("DELETE", `/containers/${created.Id}?force=1`));
	}
}

async function saveImage(imageId) {
	await new Promise((resolve, reject) => {
		const request = http.get({ socketPath: "/var/run/docker.sock", path: `/v1.41/images/${q(imageId)}/get` }, (response) => {
			if (response.statusCode !== 200) { response.resume(); reject(new Error(`Rollback image export failed (${response.statusCode})`)); return; }
			pipeline(response, fsSync.createWriteStream(path.join(recoveryRoot, "rollback-image.tar"), { flags: "wx", mode: 0o600 })).then(resolve, reject);
		});
		request.on("error", reject);
	});
	await run("tar", ["-tf", path.join(recoveryRoot, "rollback-image.tar")]);
}

async function saveVault() {
	const key = "/host-vault/vault.key";
	await fs.chmod("/host-vault", 0o700);
	let existed = true;
	try { await fs.stat(key); } catch (error) { if (error.code === "ENOENT") existed = false; else throw error; }
	if (existed) {
		const stat = await fs.stat(key);
		if (!stat.isFile() || stat.size !== 32 || (stat.mode & 0o077)) throw new Error("Existing vault key is invalid");
	} else {
		const handle = await fs.open(key, "wx", 0o600);
		try { await handle.writeFile(crypto.randomBytes(32)); await handle.sync(); }
		finally { await handle.close(); }
	}
	const uid = Number(env.APP_UID), gid = Number(env.APP_GID);
	if (!Number.isSafeInteger(uid) || !Number.isSafeInteger(gid) || uid < 1 || gid < 1) throw new Error("Invalid application UID/GID");
	await fs.chown(key, uid, gid);
	await fs.chmod(key, 0o600);
	await fs.copyFile(key, path.join(recoveryRoot, "vault.key"));
	return existed;
}

async function snapshot(manager, db) {
	await fs.mkdir(recoveryRoot, { recursive: false, mode: 0o700 });
	for (const filename of ["docker-compose.yml", "docker-compose.vpn.yml", ".env", ".version"]) {
		try { await fs.copyFile(`/host-install/${filename}`, path.join(recoveryRoot, filename)); }
		catch (error) { if (error.code !== "ENOENT") throw error; }
	}
	for (const filename of ["docker-compose.yml", ".env", ".version"]) await fs.access(path.join(recoveryRoot, filename));
	const vaultPreexisting = await saveVault();
	if (!/^sha256:[a-f0-9]{64}$/.test(manager.Image || "")) throw new Error("Invalid rollback image ID");
	await saveImage(manager.Image);
	await runDbSidecar(db, `umask 077; MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mariadb-dump -h db -uroot --single-transaction --routines --events "$MYSQL_DATABASE" > /recovery/${recoveryId}/database.sql && MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mariadb -N -h db -uroot "$MYSQL_DATABASE" -e 'select count(*) from migrations' > /recovery/${recoveryId}/migration-count.txt`);
	if ((await fs.stat(path.join(recoveryRoot, "database.sql"))).size < 1024) throw new Error("MariaDB dump is empty");
	if ((await fs.readFile(path.join(recoveryRoot, "migration-count.txt"), "utf8")).trim() !== "41") throw new Error("Expected migration 41 before upgrade");
	for (const volume of volumes) {
		await run("tar", ["-C", `/source/${volume}`, "-cf", path.join(recoveryRoot, `${volume}.tar`), "."]);
		await run("tar", ["-tf", path.join(recoveryRoot, `${volume}.tar`)]);
	}
	const files = await fs.readdir(recoveryRoot);
	const hashes = {};
	for (const filename of files) hashes[filename] = await digest(path.join(recoveryRoot, filename));
	await fs.writeFile(path.join(recoveryRoot, "manifest.json"), JSON.stringify({
		format: "nyxguard-manager-only-recovery-v1", recoveryId, from: "4.0.18", to: "5.0.0",
		oldImage: manager.Image, vaultPreexisting, volumes, files: hashes, createdAt: new Date().toISOString(),
	}, null, 2), { mode: 0o600 });
}

async function verifyManifest() {
	const manifest = JSON.parse(await fs.readFile(path.join(recoveryRoot, "manifest.json"), "utf8"));
	if (manifest.format !== "nyxguard-manager-only-recovery-v1" || manifest.recoveryId !== recoveryId ||
		JSON.stringify(manifest.volumes) !== JSON.stringify(volumes)) throw new Error("Recovery manifest mismatch");
	for (const [filename, expected] of Object.entries(manifest.files)) {
		if (!/^[A-Za-z0-9_.-]+$/.test(filename) || await digest(path.join(recoveryRoot, filename)) !== expected) throw new Error(`Recovery checksum failed: ${filename}`);
	}
	return manifest;
}

async function restore(db) {
	const manifest = await verifyManifest();
	for (const volume of volumes.filter((name) => name !== "nyxguard_db")) {
		const directory = `/source/${volume}`;
		for (const entry of await fs.readdir(directory)) await fs.rm(path.join(directory, entry), { recursive: true, force: true });
		await run("tar", ["-C", directory, "-xf", path.join(recoveryRoot, `${volume}.tar`)]);
	}
	const database = (db.Config.Env || []).find((item) => item.startsWith("MYSQL_DATABASE="))?.slice(15);
	if (!/^[A-Za-z0-9_]+$/.test(database || "")) throw new Error("Invalid database name");
	await runDbSidecar(db, `MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mariadb -h db -uroot -e 'DROP DATABASE IF EXISTS ${database}; CREATE DATABASE ${database}' && MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mariadb -h db -uroot "$MYSQL_DATABASE" < /recovery/${recoveryId}/database.sql && MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mariadb -N -h db -uroot "$MYSQL_DATABASE" -e 'select count(*) from migrations' > /recovery/${recoveryId}/restored-migration-count.txt`, 900);
	if ((await fs.readFile(path.join(recoveryRoot, "restored-migration-count.txt"), "utf8")).trim() !== "41") throw new Error("Rollback did not restore migration 41");
	for (const filename of ["docker-compose.yml", "docker-compose.vpn.yml", ".env", ".version"]) {
		if (manifest.files[filename]) await fs.copyFile(path.join(recoveryRoot, filename), `/host-install/${filename}`);
		else await fs.rm(`/host-install/${filename}`, { force: true });
	}
	if (manifest.vaultPreexisting) await fs.copyFile(path.join(recoveryRoot, "vault.key"), "/host-vault/vault.key");
	else await fs.rm("/host-vault/vault.key", { force: true });
}

async function updateCompose(socketGid) {
	const composeFile = "/host-install/docker-compose.yml";
	const compose = yaml.load(await fs.readFile(composeFile, "utf8"));
	const manager = compose?.services?.["nyxguard-manager"];
	const vpn = compose?.services?.["vpn-client-agent"];
	if (manager?.image !== expectedManager || vpn?.image !== expectedVpn || vpn?.network_mode !== "service:nyxguard-manager") {
		throw new Error("Unexpected historical Compose services or images");
	}
	manager.image = targetManager;
	vpn.image = targetVpn;
	manager.environment ||= {};
	for (const key of ["NPM_BUILD_VERSION", "NPM_BUILD_COMMIT", "NPM_BUILD_DATE"]) delete manager.environment[key];
	manager.environment.NYXCLOUD_LICENSE_VAULT_KEY_PATH = "/run/nyxguard-licensing/vault.key";
	manager.environment.NYXCLOUD_AUTHORITY_URL = "https://licensing.nyxcloud.ro";
	manager.environment.NYXCLOUD_SUPPORT_URL = "https://support-storage.nyxcloud.ro";
	const vaultBind = "/var/lib/nyxguard-licensing/vault.key:/run/nyxguard-licensing/vault.key:ro";
	manager.volumes ||= [];
	if (!manager.volumes.includes(vaultBind)) manager.volumes.push(vaultBind);
	const groups = (manager.group_add || []).map(String);
	if (!groups.some((group) => group === String(socketGid) || group.includes("DOCKER_SOCK_GID"))) groups.push(String(socketGid));
	manager.group_add = groups;
	await fs.writeFile(composeFile, yaml.dump(compose, { lineWidth: 120 }), { mode: 0o600 });
	const overlayFile = "/host-install/docker-compose.vpn.yml";
	try {
		const overlay = yaml.load(await fs.readFile(overlayFile, "utf8"));
		if (overlay?.services?.["vpn-client-agent"]?.image !== expectedVpn) throw new Error("Unexpected historical VPN overlay");
		overlay.services["vpn-client-agent"].image = targetVpn;
		await fs.writeFile(overlayFile, yaml.dump(overlay, { lineWidth: 120 }), { mode: 0o600 });
	} catch (error) { if (error.code !== "ENOENT") throw error; }
	await fs.writeFile("/host-install/.version", "5.0.0\n", { mode: 0o600 });
}

async function updateState(success, error = null, recoveryStatus = null) {
	const filename = "/source/nyxguard_data/update-manager/state.json";
	let state = {};
	try { state = JSON.parse(await fs.readFile(filename, "utf8")); } catch { /* New installation. */ }
	if (success) {
		const record = { from: "4.0.18", to: "5.0.0", at: new Date().toISOString(), vpn: "unavailable" };
		Object.assign(state, { currentVersion: "5.0.0", pendingVersion: null, restartPending: false,
			updateAvailable: false, lastSuccessfulUpdate: record });
		state.updateHistory = [record, ...(state.updateHistory || [])].slice(0, 50);
		delete state.lastApplyFailure;
		delete state.manualRecoveryRequired;
	} else {
		Object.assign(state, { restartPending: true, pendingVersion: "5.0.0", manualRecoveryRequired: recoveryStatus === "manual_recovery_required",
			lastApplyFailure: { at: new Date().toISOString(), error: String(error), recoveryStatus } });
	}
	await fs.mkdir(path.dirname(filename), { recursive: true });
	await fs.writeFile(filename, JSON.stringify(state, null, 2), "utf8");
}

async function main() {
	if (env.CURRENT_VERSION !== "4.0.18" || env.TARGET_VERSION !== "5.0.0" || env.VPN_SOURCE !== "absent") throw new Error("Unsupported Manager-only handover");
	const oldManager = await api("GET", `/containers/${q(env.OLD_MANAGER_ID)}/json`);
	const db = await api("GET", `/containers/${q(env.DB_ID)}/json`);
	if (!oldManager.State?.Running || oldManager.Config?.Image !== expectedManager || !db.State?.Running) throw new Error("Historical Manager/DB state changed before handover");
	const project = oldManager.Config?.Labels?.["com.docker.compose.project"];
	if (!project || db.Config?.Labels?.["com.docker.compose.project"] !== project ||
		db.Config?.Labels?.["com.docker.compose.service"] !== "db") throw new Error("Historical Compose identity changed before handover");
	const all = await api("GET", "/containers/json?all=1");
	if (all.some((item) => item.Image === expectedVpn || (item.Labels?.["com.docker.compose.project"] === project &&
		item.Labels?.["com.docker.compose.service"] === "vpn-client-agent"))) throw new Error("VPN agent appeared before Manager-only handover");
	try { await api("GET", "/volumes/nyxguard_vpn"); throw new Error("VPN state appeared before Manager-only handover"); }
	catch (error) { if (!String(error.message).includes("/volumes/nyxguard_vpn: 404")) throw error; }
	const oldName = String(oldManager.Name || "").replace(/^\//, "");
	if (oldName !== env.OLD_MANAGER_NAME) throw new Error("Historical Manager identity changed");
	const socketGid = (await fs.stat("/var/run/docker.sock")).gid;
	if (!Number.isSafeInteger(socketGid) || socketGid < 1) throw new Error("Invalid Docker socket GID");
	let stopped = false, renamed = false, newId = null, startedNew = false, snapshotComplete = false;
	try {
		await api("POST", `/containers/${oldManager.Id}/stop?t=20`);
		stopped = true;
		await snapshot(oldManager, db);
		snapshotComplete = true;
		await updateCompose(socketGid);
		await api("POST", `/containers/${oldManager.Id}/rename?name=${q(`${oldName}-rollback-${Date.now()}`)}`);
		renamed = true;
		const safeLabels = Object.fromEntries(Object.entries(oldManager.Config.Labels || {}).filter(([key]) =>
			!["org.opencontainers.image.version", "org.opencontainers.image.revision", "org.opencontainers.image.created"].includes(key)));
		const vaultBind = "/var/lib/nyxguard-licensing/vault.key:/run/nyxguard-licensing/vault.key:ro";
		const managerEnv = (oldManager.Config.Env || []).filter((entry) => !/^NPM_BUILD_(VERSION|COMMIT|DATE)=/.test(entry));
		const replacements = { NYXCLOUD_LICENSE_VAULT_KEY_PATH: "/run/nyxguard-licensing/vault.key",
			NYXCLOUD_AUTHORITY_URL: "https://licensing.nyxcloud.ro", NYXCLOUD_SUPPORT_URL: "https://support-storage.nyxcloud.ro" };
		const envEntries = [...managerEnv.filter((entry) => !Object.keys(replacements).some((key) => entry.startsWith(`${key}=`))),
			...Object.entries(replacements).map(([key, value]) => `${key}=${value}`)];
		const network = oldManager.HostConfig.NetworkMode;
		const aliases = oldManager.NetworkSettings?.Networks?.[network]?.Aliases || [];
		const stableAliases = aliases.filter((alias) => alias !== oldManager.Id && alias !== oldManager.Id.slice(0, 12));
		const created = await api("POST", `/containers/create?name=${q(oldName)}`, {
			Image: targetManager, Env: envEntries, Cmd: oldManager.Config.Cmd, Entrypoint: oldManager.Config.Entrypoint,
			WorkingDir: oldManager.Config.WorkingDir, ExposedPorts: oldManager.Config.ExposedPorts,
			Healthcheck: oldManager.Config.Healthcheck, Labels: safeLabels,
			HostConfig: { Binds: [...new Set([...(oldManager.HostConfig.Binds || []), vaultBind])],
				PortBindings: oldManager.HostConfig.PortBindings, RestartPolicy: oldManager.HostConfig.RestartPolicy,
				NetworkMode: network, GroupAdd: [...new Set([...(oldManager.HostConfig.GroupAdd || []).map(String), String(socketGid)])],
				ExtraHosts: oldManager.HostConfig.ExtraHosts, LogConfig: oldManager.HostConfig.LogConfig,
				CapAdd: oldManager.HostConfig.CapAdd, Devices: oldManager.HostConfig.Devices },
			NetworkingConfig: { EndpointsConfig: { [network]: { Aliases: stableAliases } } },
		});
		newId = created.Id;
		await api("POST", `/containers/${newId}/start`);
		startedNew = true;
		await waitHealthy(newId);
		await runDbSidecar(db, `MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mariadb -N -h db -uroot "$MYSQL_DATABASE" -e 'select count(*) from migrations' > /recovery/${recoveryId}/post-migration-count.txt`);
		if ((await fs.readFile(path.join(recoveryRoot, "post-migration-count.txt"), "utf8")).trim() !== "42") throw new Error("Expected migration 42 after startup");
		await updateState(true);
		await ignore(api("DELETE", `/containers/${oldManager.Id}?force=1`));
		console.log(`Manager-only 5.0.0 handover complete; verified recovery set ${recoveryId} retained; VPN unavailable`);
	} catch (error) {
		console.error(`Manager-only handover failed ${startedNew ? "after" : "before"} new Manager startup: ${error instanceof Error ? error.message : String(error)}`);
		if (newId) { await ignore(api("POST", `/containers/${newId}/stop?t=5`)); await ignore(api("DELETE", `/containers/${newId}?force=1`)); }
		let recoveryStatus = "old_runtime_resumed_before_migration";
		try {
			if (snapshotComplete) { await restore(db); recoveryStatus = "full_db_and_volume_restore"; }
			if (renamed) await api("POST", `/containers/${oldManager.Id}/rename?name=${q(oldName)}`);
			if (stopped) { await api("POST", `/containers/${oldManager.Id}/start`); await waitHealthy(oldManager.Id); }
		} catch (restoreError) {
			recoveryStatus = "manual_recovery_required";
			console.error(`Automatic recovery incomplete; old Manager remains stopped: ${restoreError instanceof Error ? restoreError.message : String(restoreError)}`);
			await ignore(api("POST", `/containers/${oldManager.Id}/stop?t=5`));
		}
		await updateState(false, error, recoveryStatus).catch(() => undefined);
		throw error;
	}
}

try {
	if (env.RECOVERY_MODE === "restore") {
		if (!env.DB_ID) throw new Error("Database identity is required for restore");
		const db = await api("GET", `/containers/${q(env.DB_ID)}/json`);
		if (!db.State?.Running) throw new Error("Database must be running for restore");
		await restore(db);
		console.log(`Manager-only recovery set ${recoveryId} restored; start the saved 4.x Manager only after DB verification`);
	} else await main();
} catch (error) { console.error(`ERROR: ${error instanceof Error ? error.message : String(error)}`); process.exitCode = 1; }
