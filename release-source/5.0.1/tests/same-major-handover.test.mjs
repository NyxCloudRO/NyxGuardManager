import assert from "node:assert/strict";
import fs from "node:fs/promises";
import http from "node:http";
import { spawn } from "node:child_process";
import { once } from "node:events";
import path from "node:path";
import test from "node:test";

const enabled = process.env.NYX_UPDATER_MOCK_CONTAINER === "1";
const socket = "/var/run/docker.sock";
const helper = path.resolve("release-source/5.0.1/update-manager/update-handover.js");
const stateFile = "/handover-data/update-manager/state.json";

async function scenario({ vpn = false, fault = "none", extraMount = false, brokenVpn = false, initialState = null, stateOwner = null } = {}) {
	await fs.rm(socket, { force: true });
	await fs.rm("/handover-data", { recursive: true, force: true });
	if (initialState) {
		await fs.mkdir(path.dirname(stateFile), { recursive: true });
		await fs.writeFile(stateFile, JSON.stringify(initialState));
		if (stateOwner) await fs.chown(stateFile, stateOwner.uid, stateOwner.gid);
	}
	const events = [];
	const mounted = (name, destination) => ({ Type: "volume", Name: name, Destination: destination, RW: true });
	const containers = {
		oldmanager: { Id: "oldmanager", State: { Running: true, Health: { Status: "healthy" } },
			Mounts: [mounted("nyxguard_data", "/data"), mounted("nyxguard_letsencrypt", "/etc/letsencrypt"),
				...(extraMount ? [mounted("unexpected_data", "/extra")] : [])],
			HostConfig: {} },
		oldvpn: { State: { Running: true, Health: { Status: "healthy" } },
			Mounts: [mounted("nyxguard_vpn", "/var/lib/nyxguard-vpn"), mounted("nyxguard_vpn_auth", "/run/nyxguard-vpn-auth")],
			HostConfig: { NetworkMode: brokenVpn ? "bridge" : "container:oldmanager" } },
		"nyxguard-db": { State: { Running: true }, Mounts: [mounted("nyxguard_db", "/var/lib/mysql")] },
		newmanager: { State: { Running: false }, HostConfig: {} },
		newvpn: { State: { Running: false }, HostConfig: { NetworkMode: "container:newmanager" } },
	};
	const worker = new Map();
	let n = 0;
	const server = http.createServer(async (req, res) => {
		let raw = "";
		for await (const chunk of req) raw += chunk;
		const body = raw ? JSON.parse(raw) : null;
		const url = new URL(req.url, "http://docker");
		const endpoint = url.pathname.replace(/^\/v1\.41/, "");
		events.push(`${req.method} ${endpoint}`);
		let status = 200;
		let response = {};
		const match = endpoint.match(/^\/containers\/([^/]+)(?:\/(json|start|stop|rename))?$/);
		if (endpoint === "/volumes/create") response = { Name: body.Name };
		else if (endpoint === "/containers/create") {
			const id = `worker${++n}`;
			const mode = body.Env.find((entry) => entry.startsWith("RECOVERY_MODE=")).split("=")[1];
			worker.set(id, mode);
			events.push(`worker ${mode}`);
			const selected = JSON.parse(body.Env.find((entry) => entry.startsWith("RECOVERY_VOLUMES=")).slice(17));
			if (!vpn) assert.deepEqual(selected.map((item) => item.key), ["data", "letsencrypt"]);
			else assert.deepEqual(selected.map((item) => item.key), ["data", "letsencrypt", "vpn", "vpn_auth"]);
			response = { Id: id };
		} else if (match && req.method === "GET" && match[2] === "json") {
			const id = match[1];
			if (worker.has(id)) response = { State: { Running: false, ExitCode:
				(worker.get(id) === "backup" && fault === "backup") ||
				(worker.get(id) === "restore" && fault === "restore") ? 1 : 0 } };
			else response = containers[id] || {};
		} else if (match && req.method === "POST") {
			const id = match[1];
			if (match[2] === "start") {
				events.push(`started ${id}`);
				if (containers[id]) containers[id].State = { Running: true,
					Health: { Status: (id === "newmanager" && fault !== "none" && fault !== "backup") ||
						(id === "oldmanager" && fault === "oldhealth") ? "unhealthy" : "healthy" } };
			} else if (match[2] === "stop" && containers[id]) {
				if (id === "oldmanager" && fault === "managerstop") status = 503;
				else containers[id].State.Running = false;
			}
		} else if (match && req.method === "DELETE") { /* Record deletion; old objects retained for inspection. */ }
		else { status = 404; response = { endpoint }; }
		res.writeHead(status, { "Content-Type": "application/json" });
		res.end(JSON.stringify(response));
	});
	server.listen(socket);
	await once(server, "listening");
	let output = "";
	let exitCode;
	try {
		const child = spawn(process.execPath, [helper], { env: { ...process.env,
			CURRENT_VERSION: "5.0.0", TARGET_VERSION: "5.0.1", OLD_MANAGER_ID: "oldmanager",
			NEW_MANAGER_ID: "newmanager", OLD_MANAGER_NAME: "nyxguard-manager",
			...(vpn ? { OLD_VPN_ID: "oldvpn", NEW_VPN_ID: "newvpn", OLD_VPN_NAME: "nyxguard-vpn-agent" } : {}),
		} });
		child.stdout.on("data", (part) => output += part);
		child.stderr.on("data", (part) => output += part);
		[exitCode] = await once(child, "exit");
	} finally {
		server.close();
		await once(server, "close");
		await fs.rm(socket, { force: true });
	}
	let state = {};
	try { state = JSON.parse(await fs.readFile(stateFile, "utf8")); } catch { /* failure assertions inspect empty state */ }
	const owner = await fs.stat(stateFile).catch(() => null);
	return { events, exitCode, state, output, owner };
}

test("root handover preserves the Manager's state file ownership", { skip: !enabled }, async () => {
	const result = await scenario({ initialState: { stage: "downloaded" }, stateOwner: { uid: 1000, gid: 1000 } });
	assert.equal(result.exitCode, 0, result.output);
	assert.equal(result.owner.uid, 1000);
	assert.equal(result.owner.gid, 1000);
	assert.equal(result.owner.mode & 0o777, 0o600);
});

test("Manager-only recovery precedes activation and does not create VPN state", { skip: !enabled }, async () => {
	const result = await scenario();
	assert.equal(result.exitCode, 0, result.output);
	assert.ok(result.events.indexOf("worker backup") < result.events.indexOf("started newmanager"));
	assert.ok(!result.events.includes("started newvpn"));
	assert.equal(result.state.lastSuccessfulUpdate?.to, "5.0.1");
});

test("VPN recovery precedes activation and checks VPN health", { skip: !enabled }, async () => {
	const result = await scenario({ vpn: true });
	assert.equal(result.exitCode, 0, result.output);
	assert.ok(result.events.indexOf("started newmanager") < result.events.indexOf("started newvpn"));
	assert.ok(result.events.includes("worker cleanup"));
});

test("backup failure prevents replacement startup and permits retry", { skip: !enabled }, async () => {
	const result = await scenario({ fault: "backup" });
	assert.equal(result.exitCode, 1);
	assert.ok(!result.events.includes("started newmanager"));
	assert.ok(result.events.includes("started oldmanager"));
	assert.equal(result.state.pendingVersion, null);
	assert.equal(result.state.restartPending, false);
	assert.equal(result.state.manualRecoveryRequired, false);
});

for (const vpn of [false, true]) test(`post-start health failure restores before old runtime: ${vpn ? "VPN" : "Manager-only"}`, { skip: !enabled }, async () => {
	const result = await scenario({ vpn, fault: "health" });
	assert.equal(result.exitCode, 1);
	assert.ok(result.events.indexOf("worker restore") < result.events.indexOf("started oldmanager"));
	assert.equal(result.state.lastApplyFailure?.recoveryStatus, "sql_and_volume_restore");
	assert.equal(result.state.pendingVersion, null);
	assert.equal(result.state.restartPending, false);
	assert.equal(result.state.manualRecoveryRequired, false);
	assert.equal(result.events.includes("started oldvpn"), vpn);
});

test("restore failure preserves recovery material and leaves old runtime stopped", { skip: !enabled }, async () => {
	const result = await scenario({ vpn: true, fault: "restore" });
	assert.equal(result.exitCode, 1);
	assert.ok(result.events.includes("worker restore"));
	assert.ok(!result.events.includes("worker cleanup"));
	assert.ok(!result.events.includes("started oldmanager"));
	assert.equal(result.state.manualRecoveryRequired, true);
	assert.equal(result.state.pendingVersion, null);
	assert.equal(result.state.restartPending, false);
});

test("unprotected writable mount fails before stopping the old Manager", { skip: !enabled }, async () => {
	const result = await scenario({ extraMount: true });
	assert.equal(result.exitCode, 1);
	assert.ok(!result.events.includes("worker backup"));
	assert.ok(!result.events.includes("POST /containers/oldmanager/stop"));
	assert.equal(result.state.restartPending, false);
});

test("invalid VPN namespace fails before backup", { skip: !enabled }, async () => {
	const result = await scenario({ vpn: true, brokenVpn: true });
	assert.equal(result.exitCode, 1);
	assert.ok(!result.events.includes("worker backup"));
	assert.ok(!result.events.includes("POST /containers/oldmanager/stop"));
	assert.equal(result.state.restartPending, false);
});

test("Manager stop failure restarts the already-stopped VPN Agent", { skip: !enabled }, async () => {
	const result = await scenario({ vpn: true, fault: "managerstop" });
	assert.equal(result.exitCode, 1);
	assert.ok(!result.events.includes("worker backup"));
	assert.ok(result.events.includes("started oldvpn"));
	assert.equal(result.state.manualRecoveryRequired, false);
});

test("unhealthy old runtime is stopped and requires manual recovery", { skip: !enabled }, async () => {
	const result = await scenario({ vpn: true, fault: "oldhealth" });
	assert.equal(result.exitCode, 1);
	assert.ok(result.events.includes("worker restore"));
	assert.equal(result.state.manualRecoveryRequired, true);
	assert.equal(result.state.lastApplyFailure?.recoveryStatus, "manual_recovery_required");
	assert.equal(result.state.restartPending, false);
});

test("successful retry clears stale failure state", { skip: !enabled }, async () => {
	const result = await scenario({ initialState: { stage: "failed", restartPending: false,
		pendingVersion: null, lastApplyFailure: { error: "earlier failure" }, manualRecoveryRequired: false } });
	assert.equal(result.exitCode, 0, result.output);
	assert.equal(result.state.stage, "success");
	assert.equal(result.state.lastApplyFailure, undefined);
	assert.equal(result.state.pendingVersion, null);
	assert.equal(result.state.restartPending, false);
	assert.equal(result.state.lastSuccessfulUpdate?.to, "5.0.1");
});
