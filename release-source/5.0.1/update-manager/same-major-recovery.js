// Recovery worker for a same-major handover. The Manager and VPN Agent are
// stopped before backup and remain stopped until backup or restore completes.
import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import http from "node:http";
import crypto from "node:crypto";
import { spawn } from "node:child_process";

const id = process.env.RECOVERY_ID;
const mode = process.env.RECOVERY_MODE;
process.umask(0o077);
if (!/^[A-Za-z0-9_-]{12,80}$/.test(id || "") || !["backup", "restore", "cleanup"].includes(mode))
	throw new Error("Invalid recovery request");
const root = path.join("/recovery", id);
const allowed = new Map([
	["data", "nyxguard_data"], ["letsencrypt", "nyxguard_letsencrypt"],
	["vpn", "nyxguard_vpn"], ["vpn_auth", "nyxguard_vpn_auth"],
]);
const volumes = JSON.parse(process.env.RECOVERY_VOLUMES || "[]");
if (!Array.isArray(volumes) || volumes.length < 2 ||
	volumes.some((v) => !allowed.has(v.key) || allowed.get(v.key) !== v.name) ||
	new Set(volumes.map((v) => v.key)).size !== volumes.length ||
	!volumes.some((v) => v.key === "data") || !volumes.some((v) => v.key === "letsencrypt") ||
	(volumes.some((v) => v.key === "vpn") !== volumes.some((v) => v.key === "vpn_auth")))
	throw new Error("Invalid recovery volume set");

function docker(method, endpoint, body) {
	return new Promise((resolve, reject) => {
		const req = http.request({ socketPath: "/var/run/docker.sock", path: `/v1.41${endpoint}`, method,
			headers: body ? { "Content-Type": "application/json" } : undefined }, (res) => {
			let raw = "";
			res.setEncoding("utf8");
			res.on("data", (chunk) => { raw += chunk; if (raw.length > 4_000_000) req.destroy(new Error("Docker response too large")); });
			res.on("end", () => {
				if ((res.statusCode || 500) >= 400) return reject(new Error(`Docker request failed: ${res.statusCode}`));
				try { resolve(raw ? JSON.parse(raw) : {}); } catch { resolve(raw); }
			});
		});
		req.on("error", reject);
		if (body) req.write(JSON.stringify(body));
		req.end();
	});
}

async function run(command, args) {
	await new Promise((resolve, reject) => {
		const child = spawn(command, args, { stdio: "ignore" });
		child.on("error", reject);
		child.on("exit", (code) => code === 0 ? resolve() : reject(new Error(`${command} exited ${code}`)));
	});
}

async function sidecar(script) {
	const db = await docker("GET", "/containers/nyxguard-db/json");
	if (!db.State?.Running) throw new Error("MariaDB is not running");
	const name = `nyx-same-major-db-${id}-${Date.now()}`;
	const created = await docker("POST", `/containers/create?name=${name}`, {
		Image: db.Config.Image, Entrypoint: ["sh", "-lc"], Cmd: [script], Env: db.Config.Env,
		HostConfig: { Binds: ["nyxguard_update_recovery:/recovery:rw"], NetworkMode: db.HostConfig.NetworkMode },
	});
	try {
		await docker("POST", `/containers/${created.Id}/start`);
		for (let i = 0; i < 120; i++) {
			const state = await docker("GET", `/containers/${created.Id}/json`);
			if (!state.State.Running) {
				if (state.State.ExitCode !== 0) throw new Error(`MariaDB recovery command exited ${state.State.ExitCode}`);
				return;
			}
			await new Promise((resolve) => setTimeout(resolve, 1000));
		}
		throw new Error("MariaDB recovery command timed out");
	} finally {
		await docker("DELETE", `/containers/${created.Id}?force=1`).catch(() => undefined);
	}
}

async function bytes(directory) {
	let sum = 0;
	for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
		const file = path.join(directory, entry.name);
		if (entry.isDirectory()) sum += await bytes(file);
		else if (entry.isFile()) sum += (await fs.stat(file)).size;
	}
	return sum;
}

async function hash(file) {
	const h = crypto.createHash("sha256");
	for await (const chunk of fsSync.createReadStream(file)) h.update(chunk);
	return h.digest("hex");
}

async function backup() {
	const estimate = await bytes("/source/db") +
		(await Promise.all(volumes.map((v) => bytes(`/source/${v.key}`)))).reduce((a, b) => a + b, 0);
	const available = (await fs.statfs("/recovery")).bavail * (await fs.statfs("/recovery")).bsize;
	const required = Math.ceil(estimate * 2.5) + 256 * 1024 * 1024;
	if (available < required) throw new Error(`Insufficient recovery space: need ${required} bytes, have ${available} bytes`);
	await fs.mkdir(root, { mode: 0o700 });
	await fs.chmod(root, 0o700);
	try {
		// Aria tables are nontransactional: lock all tables for the whole dump.
		await sidecar(`umask 077; MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mariadb-dump -h db -uroot --lock-all-tables --routines --events "$MYSQL_DATABASE" > /recovery/${id}/database.sql && MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mariadb -N -h db -uroot "$MYSQL_DATABASE" -e 'select count(*) from migrations' > /recovery/${id}/migration-count.txt`);
		if ((await fs.stat(path.join(root, "database.sql"))).size < 1024) throw new Error("SQL dump is empty");
		const migrationCount = (await fs.readFile(path.join(root, "migration-count.txt"), "utf8")).trim();
		if (!/^\d+$/.test(migrationCount)) throw new Error("Invalid migration count");
		for (const volume of volumes) {
			const archive = path.join(root, `${volume.key}.tar`);
			await run("tar", ["-C", `/source/${volume.key}`, "-cf", archive, "."]);
			await run("tar", ["-tf", archive]);
		}
		const vault = await fs.stat("/host-vault/vault.key");
		if (!vault.isFile() || vault.size !== 32 || (vault.mode & 0o077) !== 0) throw new Error("Invalid licensing vault key");
		await fs.copyFile("/host-vault/vault.key", path.join(root, "vault.key"));
		await fs.chmod(path.join(root, "vault.key"), 0o600);
		const files = ["database.sql", "migration-count.txt", "vault.key", ...volumes.map((v) => `${v.key}.tar`)];
		const hashes = Object.fromEntries(await Promise.all(files.map(async (file) => [file, await hash(path.join(root, file))])));
		const manifest = { format: "nyxguard-same-major-v1", id, migrationCount, volumes, hashes };
		await fs.writeFile(path.join(root, "manifest.json"), JSON.stringify(manifest), { mode: 0o600, flag: "wx" });
	} catch (error) {
		// Partial material is never treated as a valid recovery point.
		await fs.rm(path.join(root, "manifest.json"), { force: true });
		throw error;
	}
}

async function restore() {
	const manifest = JSON.parse(await fs.readFile(path.join(root, "manifest.json"), "utf8"));
	if (manifest.format !== "nyxguard-same-major-v1" || manifest.id !== id ||
		JSON.stringify(manifest.volumes) !== JSON.stringify(volumes)) throw new Error("Recovery manifest mismatch");
	for (const [file, expected] of Object.entries(manifest.hashes)) {
		if (!/^[a-z0-9_.-]+$/.test(file) || await hash(path.join(root, file)) !== expected)
			throw new Error(`Recovery checksum failed: ${file}`);
	}
	for (const volume of volumes) {
		const directory = `/source/${volume.key}`;
		for (const item of await fs.readdir(directory)) await fs.rm(path.join(directory, item), { recursive: true, force: true });
		await run("tar", ["-C", directory, "-xf", path.join(root, `${volume.key}.tar`)]);
	}
	const db = await docker("GET", "/containers/nyxguard-db/json");
	const database = (db.Config.Env || []).find((entry) => entry.startsWith("MYSQL_DATABASE="))?.slice(15);
	if (!/^[A-Za-z0-9_]+$/.test(database || "")) throw new Error("Invalid database name");
	await sidecar(`MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mariadb -h db -uroot -e 'DROP DATABASE IF EXISTS ${database}; CREATE DATABASE ${database}' && MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mariadb -h db -uroot "$MYSQL_DATABASE" < /recovery/${id}/database.sql && MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mariadb -N -h db -uroot "$MYSQL_DATABASE" -e 'select count(*) from migrations' > /recovery/${id}/restored-migration-count.txt`);
	if ((await fs.readFile(path.join(root, "restored-migration-count.txt"), "utf8")).trim() !== manifest.migrationCount)
		throw new Error("Restored migration count mismatch");
	await fs.copyFile(path.join(root, "vault.key"), "/host-vault/vault.key");
	await fs.chmod("/host-vault/vault.key", 0o600);
}

if (mode === "backup") await backup();
else if (mode === "restore") await restore();
else {
	// Only invoked after replacement health and topology verification pass.
	await fs.rm(root, { recursive: true, force: true });
}
