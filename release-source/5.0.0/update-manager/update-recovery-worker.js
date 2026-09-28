import fs from "node:fs/promises";
import fsSync from "node:fs";
import http from "node:http";
import path from "node:path";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import { pipeline } from "node:stream/promises";
import yaml from "js-yaml";

// Runs only in a short-lived Docker helper created by update-handover.js.
// The recovery volume is separate from every application volume.
const recoveryId = process.env.RECOVERY_ID;
const mode = process.env.RECOVERY_MODE;
const root = `/recovery/${recoveryId}`;
const volumes = ["nyxguard_data", "nyxguard_db", "nyxguard_letsencrypt", "nyxguard_vpn", "nyxguard_vpn_auth"];
if (!/^[a-zA-Z0-9_-]{12,80}$/.test(recoveryId || "")) throw new Error("Invalid recovery ID");
if (!["backup", "restore", "inspect", "verify"].includes(mode)) throw new Error("Invalid recovery mode");

function docker(method, endpoint, body) {
	return new Promise((resolve, reject) => {
		const req = http.request({ socketPath: "/var/run/docker.sock", path: `/v1.41${endpoint}`, method,
			headers: body ? { "Content-Type": "application/json" } : undefined }, (res) => {
			const chunks = [];
			let size = 0;
			res.on("data", (part) => {
				size += part.length;
				if (size > 4 * 1024 * 1024) { req.destroy(new Error("Docker response too large")); return; }
				chunks.push(part);
			});
			res.on("end", () => {
				const raw = Buffer.concat(chunks).toString("utf8");
				if ((res.statusCode || 500) >= 400) { reject(new Error(`Docker API ${method} ${endpoint}: ${res.statusCode} ${raw.slice(0, 512)}`)); return; }
				try { resolve(raw ? JSON.parse(raw) : {}); } catch { resolve(raw); }
			});
		});
		req.on("error", reject);
		if (body) req.write(JSON.stringify(body));
		req.end();
	});
}

async function run(program, args) {
	await new Promise((resolve, reject) => {
		const child = spawn(program, args, { stdio: "ignore" });
		child.on("error", reject);
		child.on("exit", (code) => code === 0 ? resolve() : reject(new Error(`${program} exited ${code}`)));
	});
}

async function runDbSidecar(command) {
	const db = await docker("GET", "/containers/nyxguard-db/json");
	if (!db.State?.Running) throw new Error("MariaDB is not running");
	const name = `nyx-update-db-${recoveryId}-${Date.now()}`;
	const created = await docker("POST", `/containers/create?name=${encodeURIComponent(name)}`, {
		Image: db.Config.Image,
		Entrypoint: ["sh", "-lc"], Cmd: [command], Env: db.Config.Env,
		HostConfig: { Binds: ["nyxguard_update_recovery:/recovery:rw"], NetworkMode: db.HostConfig.NetworkMode, AutoRemove: false },
	});
	try {
		await docker("POST", `/containers/${created.Id}/start`);
		for (let attempt = 0; attempt < 120; attempt++) {
			const state = await docker("GET", `/containers/${created.Id}/json`);
			if (!state.State.Running) {
				if (state.State.ExitCode !== 0) throw new Error(`MariaDB backup/restore command exited ${state.State.ExitCode}`);
				return;
			}
			await new Promise((resolve) => setTimeout(resolve, 1000));
		}
		throw new Error("MariaDB backup/restore command timed out");
	} finally {
		await docker("DELETE", `/containers/${created.Id}?force=1`).catch(() => undefined);
	}
}

async function saveImage(imageId, filename) {
	await new Promise((resolve, reject) => {
		const req = http.request({ socketPath: "/var/run/docker.sock", path: `/v1.41/images/${encodeURIComponent(imageId)}/get`, method: "GET" }, (res) => {
			if ((res.statusCode || 500) !== 200) { reject(new Error(`Rollback image export failed: ${res.statusCode}`)); res.resume(); return; }
			pipeline(res, fsSync.createWriteStream(filename, { flags: "wx", mode: 0o600 })).then(resolve, reject);
		});
		req.on("error", reject);
		req.end();
	});
}

async function digest(file) {
	const hash = crypto.createHash("sha256");
	for await (const chunk of fsSync.createReadStream(file)) hash.update(chunk);
	return hash.digest("hex");
}

async function copyOptional(filename) {
	const source = path.join("/host-install", filename);
	try { await fs.copyFile(source, path.join(root, filename)); }
	catch (error) { if (error.code !== "ENOENT") throw error; }
}

async function prepareVault() {
	const vault = "/host-vault/vault.key";
	await fs.chmod("/host-vault", 0o700);
	let exists = true;
	try { await fs.stat(vault); } catch (error) { if (error.code === "ENOENT") exists = false; else throw error; }
	if (exists) {
		const stat = await fs.stat(vault);
		if (!stat.isFile() || stat.size !== 32 || (stat.mode & 0o077) !== 0) throw new Error("Existing licensing vault key is invalid; refusing replacement");
		await fs.copyFile(vault, path.join(root, "vault.key"));
	} else {
		const handle = await fs.open(vault, "wx", 0o600);
		try { await handle.writeFile(crypto.randomBytes(32)); await handle.sync(); }
		finally { await handle.close(); }
	}
	const uid = Number(process.env.APP_UID);
	const gid = Number(process.env.APP_GID);
	if (!Number.isSafeInteger(uid) || !Number.isSafeInteger(gid) || uid < 1 || gid < 1) throw new Error("Invalid app UID/GID");
	await fs.chown(vault, uid, gid);
	await fs.chmod(vault, 0o600);
	await fs.copyFile(vault, path.join(root, "vault.key"));
	return exists;
}

async function updateCompose() {
	const managerFile = "/host-install/docker-compose.yml";
	const compose = yaml.load(await fs.readFile(managerFile, "utf8"));
	const manager = compose?.services?.["nyxguard-manager"];
	if (!manager || typeof manager.image !== "string" || !manager.image.includes("nyxguardmanager:4.0.18")) {
		throw new Error("Unexpected Compose Manager image; refusing automatic major upgrade");
	}
	if (!Array.isArray(manager.volumes)) throw new Error("Unexpected Manager volume layout");
	manager.image = "nyxmael/nyxguardmanager:5.0.0";
	manager.environment ||= {};
	for (const key of ["NPM_BUILD_VERSION", "NPM_BUILD_COMMIT", "NPM_BUILD_DATE"]) delete manager.environment[key];
	manager.environment.NYXCLOUD_LICENSE_VAULT_KEY_PATH = "/run/nyxguard-licensing/vault.key";
	manager.environment.NYXCLOUD_AUTHORITY_URL = "https://licensing.nyxcloud.ro";
	manager.environment.NYXCLOUD_SUPPORT_URL = "https://support-storage.nyxcloud.ro";
	const vaultMount = "/var/lib/nyxguard-licensing/vault.key:/run/nyxguard-licensing/vault.key:ro";
	if (!manager.volumes.includes(vaultMount)) manager.volumes.push(vaultMount);
	const socketGid = Number(process.env.SOCKET_GID);
	if (!Number.isSafeInteger(socketGid) || socketGid < 1) throw new Error("Invalid socket GID");
	const groups = (manager.group_add || []).map(String);
	if (!groups.some((group) => group === String(socketGid) || group.includes("DOCKER_SOCK_GID"))) groups.push(String(socketGid));
	manager.group_add = groups;
	await fs.writeFile(managerFile, yaml.dump(compose, { lineWidth: 120 }), { mode: 0o600 });
	const vpnFile = "/host-install/docker-compose.vpn.yml";
	const vpnCompose = yaml.load(await fs.readFile(vpnFile, "utf8"));
	const vpn = vpnCompose?.services?.["vpn-client-agent"];
	if (!vpn || typeof vpn.image !== "string" || !vpn.image.includes("vpn-agent:4.0.18")) throw new Error("Unexpected VPN Compose image");
	vpn.image = "nyxmael/nyxguardmanager-vpn-agent:5.0.0";
	await fs.writeFile(vpnFile, yaml.dump(vpnCompose, { lineWidth: 120 }), { mode: 0o600 });
	await fs.writeFile("/host-install/.version", "5.0.0\n", { mode: 0o600 });
}

async function backup() {
	await fs.mkdir(root, { recursive: false, mode: 0o700 });
	for (const filename of ["docker-compose.yml", "docker-compose.vpn.yml", ".env", ".version"]) await copyOptional(filename);
	for (const required of ["docker-compose.yml", ".env"]) await fs.access(path.join(root, required));
	const vaultPreexisting = await prepareVault();
	const oldImage = process.env.OLD_IMAGE_ID;
	if (!/^sha256:[a-f0-9]{64}$/.test(oldImage || "")) throw new Error("Invalid rollback image ID");
	await saveImage(oldImage, path.join(root, "rollback-image.tar"));
	await run("tar", ["-tf", path.join(root, "rollback-image.tar")]);
	await runDbSidecar(`umask 077; MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mariadb-dump -h db -uroot --single-transaction --routines --events "$MYSQL_DATABASE" > /recovery/${recoveryId}/database.sql && MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mariadb -N -h db -uroot "$MYSQL_DATABASE" -e 'select count(*) from migrations' > /recovery/${recoveryId}/migration-count.txt`);
	const sql = await fs.stat(path.join(root, "database.sql"));
	if (sql.size < 1024) throw new Error("MariaDB dump is empty or truncated");
	if ((await fs.readFile(path.join(root, "migration-count.txt"), "utf8")).trim() !== "41") throw new Error("Expected pre-upgrade migration 41");
	for (const volume of volumes) {
		await fs.access(`/source/${volume}`);
		const archive = path.join(root, `${volume}.tar`);
		await run("tar", ["-C", `/source/${volume}`, "-cf", archive, "."]);
		await run("tar", ["-tf", archive]);
	}
	const files = (await fs.readdir(root)).filter((name) => name !== "manifest.json");
	const hashes = {};
	for (const filename of files) hashes[filename] = await digest(path.join(root, filename));
	const manifest = { format: "nyxguard-major-recovery-v1", recoveryId, from: process.env.CURRENT_VERSION,
		to: process.env.TARGET_VERSION, oldImage, vaultPreexisting, files: hashes, createdAt: new Date().toISOString() };
	await fs.writeFile(path.join(root, "manifest.json"), JSON.stringify(manifest, null, 2), { mode: 0o600 });
	await updateCompose();
	console.log(`Verified major recovery set ${recoveryId}: SQL, rollback image, Compose and ${volumes.length} volumes`);
}

async function clearDirectory(directory) {
	for (const name of await fs.readdir(directory)) await fs.rm(path.join(directory, name), { recursive: true, force: true });
}

async function restore() {
	const manifest = JSON.parse(await fs.readFile(path.join(root, "manifest.json"), "utf8"));
	if (manifest.format !== "nyxguard-major-recovery-v1" || manifest.recoveryId !== recoveryId) throw new Error("Recovery manifest mismatch");
	for (const [filename, expected] of Object.entries(manifest.files)) {
		if (!/^[A-Za-z0-9_.-]+$/.test(filename) || await digest(path.join(root, filename)) !== expected) throw new Error(`Recovery checksum failed: ${filename}`);
	}
	for (const volume of volumes.filter((name) => name !== "nyxguard_db")) {
		const directory = `/source/${volume}`;
		await clearDirectory(directory);
		await run("tar", ["-C", directory, "-xf", path.join(root, `${volume}.tar`)]);
	}
	const db = await docker("GET", "/containers/nyxguard-db/json");
	const database = (db.Config.Env || []).find((item) => item.startsWith("MYSQL_DATABASE="))?.slice(15);
	if (!/^[A-Za-z0-9_]+$/.test(database || "")) throw new Error("Invalid database name");
	await runDbSidecar(`MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mariadb -h db -uroot -e 'DROP DATABASE IF EXISTS ${database}; CREATE DATABASE ${database}' && MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mariadb -h db -uroot "$MYSQL_DATABASE" < /recovery/${recoveryId}/database.sql && MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mariadb -N -h db -uroot "$MYSQL_DATABASE" -e 'select count(*) from migrations' > /recovery/${recoveryId}/restored-migration-count.txt`);
	if ((await fs.readFile(path.join(root, "restored-migration-count.txt"), "utf8")).trim() !== "41") throw new Error("Restored database is not at migration 41");
	for (const filename of ["docker-compose.yml", "docker-compose.vpn.yml", ".env", ".version"]) {
		if (manifest.files[filename]) await fs.copyFile(path.join(root, filename), path.join("/host-install", filename));
	}
	if (manifest.vaultPreexisting) {
		await fs.copyFile(path.join(root, "vault.key"), "/host-vault/vault.key");
		await fs.chmod("/host-vault/vault.key", 0o600);
	}
	console.log(`Recovery set ${recoveryId} restored; start the saved 4.x image only after DB verification`);
}

if (mode === "backup") await backup();
else if (mode === "restore") await restore();
else if (mode === "inspect") {
	try { await fs.access(path.join(root, "manifest.json")); }
	catch (error) {
		if (error.code === "ENOENT") process.exitCode = 2;
		else throw error;
	}
}
else {
	await runDbSidecar(`umask 077; MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mariadb -N -h db -uroot "$MYSQL_DATABASE" -e 'select count(*) from migrations' > /recovery/${recoveryId}/post-migration-count.txt`);
	if ((await fs.readFile(path.join(root, "post-migration-count.txt"), "utf8")).trim() !== "42") throw new Error("Expected migration 42 after 5.0.0 startup");
	const key = await fs.stat("/host-vault/vault.key");
	if (!key.isFile() || key.size !== 32 || (key.mode & 0o077) !== 0) throw new Error("Vault key failed post-start verification");
}
