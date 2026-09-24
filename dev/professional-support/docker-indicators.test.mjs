import assert from "node:assert/strict";
import http from "node:http";
import os from "node:os";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";
import { ownDockerIndicators } from "./docker-indicators.mjs";

test("reads only own bounded restart count and never returns inspect secrets", async () => {
	const dir = await mkdtemp(join(os.tmpdir(), "nyx-docker-indicators-"));
	const socketPath = join(dir, "docker.sock");
	const containerId = "a".repeat(12);
	const paths = [];
	const server = http.createServer((req, res) => {
		paths.push(req.url);
		res.setHeader("Content-Type", "application/json");
		res.end(JSON.stringify({ RestartCount: 3, Config: { Env: ["API_TOKEN=sentinel_docker_opaque_secret"] } }));
	});
	try {
		await new Promise((resolve) => server.listen(socketPath, resolve));
		assert.deepEqual(await ownDockerIndicators({ socketPath, containerId }), { restartCount: 3 });
		assert.deepEqual(paths, [`/containers/${containerId}/json`]);
		assert.deepEqual(await ownDockerIndicators({ socketPath, containerId: "../other" }), {});
	} finally {
		await new Promise((resolve) => server.close(resolve));
		await rm(dir, { recursive: true, force: true });
	}
});

test("oversized Docker inspect response remains unavailable", async () => {
	const dir = await mkdtemp(join(os.tmpdir(), "nyx-docker-indicators-"));
	const socketPath = join(dir, "docker.sock");
	const server = http.createServer((_req, res) => res.end(JSON.stringify({ RestartCount: 0, filler: "x".repeat(140000) })));
	try {
		await new Promise((resolve) => server.listen(socketPath, resolve));
		assert.deepEqual(await ownDockerIndicators({ socketPath, containerId: "b".repeat(12) }), {});
	} finally {
		await new Promise((resolve) => server.close(resolve));
		await rm(dir, { recursive: true, force: true });
	}
});
