import assert from "node:assert/strict";
import fs from "node:fs/promises";
import http from "node:http";
import net from "node:net";
import { spawn } from "node:child_process";
import { once } from "node:events";
import path from "node:path";
import test from "node:test";

const enabled = process.env.NYX_UPDATER_MOCK_CONTAINER === "1";
const socket = "/var/run/docker.sock";
const stateFile = "/handover-data/update-manager/state.json";
const helper = path.resolve("dev/5.0.0/update-manager/update-handover.js");

async function scenario(fault) {
	const existing = await fs.lstat(socket).catch((error) => error.code === "ENOENT" ? null : Promise.reject(error));
	if (existing) {
		assert.ok(existing.isFile() && existing.size === 0, "test must not see a real Docker socket");
		await fs.rm(socket);
	}
	await fs.rm("/handover-data", { recursive: true, force: true });
	const events = [];
	const oldManager = { Image: `sha256:${"a".repeat(64)}`, State: { Running: true, Health: { Status: "healthy" } }, Config: { Labels: { "com.docker.compose.project.config_files": "/opt/nyxguardmanager/docker-compose.yml" }, Env: ["PUID=1000", "PGID=991"] }, HostConfig: { GroupAdd: ["991"] } };
	const oldVpn = { State: { Running: true, Health: { Status: "healthy" } }, Config: { Healthcheck: { Test: ["CMD", "true"] } } };
	const newManager = { Config: { Image: "nyxmael/nyxguardmanager:5.0.0", Env: [], Labels: {}, Healthcheck: { Test: ["CMD", "true"] } }, HostConfig: { Binds: [], NetworkMode: "bridge" } };
	const newVpn = { Config: { Image: "nyxmael/nyxguardmanager-vpn-agent:5.0.0", Env: [], Labels: {} }, HostConfig: { Binds: [] } };
	let index = 0;
	const containers = { oldmanager: oldManager, oldvpn: oldVpn, newmanager: newManager, newvpn: newVpn };
	const workerMode = new Map();
	const server = http.createServer(async (req, res) => {
		let raw = "";
		for await (const part of req) raw += part;
		const body = raw ? JSON.parse(raw) : null;
		const url = new URL(req.url, "http://docker");
		const endpoint = url.pathname.replace(/^\/v1\.41/, "");
		events.push(`${req.method} ${endpoint}`);
		let response = {};
		let status = 200;
		const match = endpoint.match(/^\/containers\/([^/]+)(?:\/(json|start|stop|rename))?$/);
		if (endpoint === "/volumes/create") response = { Name: body.Name };
		else if (endpoint === "/containers/create") {
			const id = `created${++index}`;
			containers[id] = { Config: body, HostConfig: body.HostConfig || {} };
			const mode = body.Env?.find((entry) => entry.startsWith("RECOVERY_MODE="))?.split("=")[1];
			if (mode) workerMode.set(id, mode);
			response = { Id: id };
			events.push(`created ${mode || body.Image}`);
		} else if (match && req.method === "GET" && match[2] === "json") {
			const id = match[1];
			if (workerMode.has(id)) {
				const mode = workerMode.get(id);
				if (mode === "inspect" && fault === "inspect") status = 503;
				const exitCode = mode === "backup" && fault === "backup" ? 1 :
					mode === "inspect" && fault === "backup" ? 2 :
					mode === "restore" && fault === "restore" ? 1 : 0;
				response = { State: { Running: false, ExitCode: exitCode } };
			} else if (id.startsWith("created")) {
				response = { State: { Running: true, Health: { Status: id === "created3" && fault !== "success" ? "unhealthy" : "healthy" } }, HostConfig: containers[id].HostConfig };
			} else response = containers[id];
		} else if (match && ["POST", "DELETE"].includes(req.method)) {
			if (match[1] === "oldvpn" && match[2] === "start" && fault === "oldrestart") status = 503;
			if (match[2] === "start") events.push(`started ${match[1]}`);
		} else { status = 404; response = { message: endpoint }; }
		res.writeHead(status, { "Content-Type": "application/json" });
		res.end(JSON.stringify(response));
	});
	server.listen(socket);
	await once(server, "listening");
	let output = "";
	let exitCode;
	try {
		const child = spawn(process.execPath, [helper], {
			env: { ...process.env, CURRENT_VERSION: "4.0.18", TARGET_VERSION: "5.0.0",
				OLD_MANAGER_ID: "oldmanager", OLD_VPN_ID: "oldvpn", NEW_MANAGER_ID: "newmanager", NEW_VPN_ID: "newvpn",
				OLD_MANAGER_NAME: "nyxguard-manager", OLD_VPN_NAME: "nyxguard-vpn-agent" },
		});
		child.stdout.on("data", (part) => output += part);
		child.stderr.on("data", (part) => output += part);
		[exitCode] = await once(child, "exit");
	} finally {
		server.close();
		await once(server, "close");
		await fs.rm(socket, { force: true });
	}
	let state;
	try { state = JSON.parse(await fs.readFile(stateFile, "utf8")); } catch { state = {}; }
	return { events, output, exitCode, state, containers };
}

test("major handover makes a recovery point before startup and starts VPN after Manager", { skip: !enabled }, async () => {
	const result = await scenario("success");
	assert.equal(result.exitCode, 0, result.output);
	const at = (event) => result.events.findIndex((item) => item === event);
	assert.ok(at("created backup") < at("started created2"));
	assert.ok(at("started created2") < at("created verify"));
	assert.ok(at("created verify") < at("started created3"));
	const createdVpn = Object.entries(result.containers).find(([id, container]) =>
		id.startsWith("created") && container.Config?.Image === "nyxmael/nyxguardmanager-vpn-agent:5.0.0")?.[1];
	assert.equal(createdVpn?.HostConfig?.NetworkMode, "container:created2",
		"VPN must join the recreated Manager network namespace");
	assert.equal(result.state.lastSuccessfulUpdate?.to, "5.0.0");
	assert.ok(result.events.includes("DELETE /containers/oldmanager"));
});

test("backup failure resumes 4.x before migration", { skip: !enabled }, async () => {
	const result = await scenario("backup");
	assert.equal(result.exitCode, 1);
	assert.equal(result.state.lastApplyFailure?.migrationBoundary, "pre_migration", JSON.stringify(result));
	assert.equal(result.state.manualRecoveryRequired, false);
	assert.ok(result.events.includes("started oldmanager"));
	assert.equal(result.events.includes("created nyxmael/nyxguardmanager:5.0.0"), false);
});

test("post-start health failure restores before old Manager restart", { skip: !enabled }, async () => {
	const result = await scenario("health");
	assert.equal(result.exitCode, 1);
	assert.equal(result.state.lastApplyFailure?.recoveryStatus, "full_db_and_volume_restore", JSON.stringify(result));
	assert.equal(result.state.manualRecoveryRequired, false);
	assert.ok(result.events.findIndex((item) => item === "created restore") < result.events.findIndex((item) => item === "started oldmanager"));
});

test("failed restore leaves old runtime stopped and asks for manual recovery", { skip: !enabled }, async () => {
	const result = await scenario("restore");
	assert.equal(result.exitCode, 1);
	assert.equal(result.state.manualRecoveryRequired, true);
	assert.equal(result.events.includes("started oldmanager"), false);
});

test("ambiguous recovery inspection fails closed", { skip: !enabled }, async () => {
	const result = await scenario("inspect");
	assert.equal(result.exitCode, 1);
	assert.equal(result.state.manualRecoveryRequired, true);
	assert.equal(result.events.includes("started oldmanager"), false);
});

test("failed old VPN restart records manual recovery", { skip: !enabled }, async () => {
	const result = await scenario("oldrestart");
	assert.equal(result.exitCode, 1);
	assert.equal(result.state.manualRecoveryRequired, true);
	assert.equal(result.state.lastApplyFailure?.recoveryStatus, "manual_recovery_required");
});
