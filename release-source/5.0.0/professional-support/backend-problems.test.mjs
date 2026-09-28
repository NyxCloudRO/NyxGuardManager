import assert from "node:assert/strict";
import http from "node:http";
import os from "node:os";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";
import { classifyBackendLog, recentBackendProblems } from "./backend-problems.mjs";

const now = Date.now();
const line = (minutes, message) => `${new Date(now - minutes * 60000).toISOString()} ${message}\n`;
const frame = (value) => {
	const data = Buffer.from(value);
	const header = Buffer.alloc(8);
	header[0] = 1;
	header.writeUInt32BE(data.length, 4);
	return Buffer.concat([header, data]);
};

test("groups bounded backend failures and removes sentinel secrets", () => {
	const raw = Buffer.concat([
		frame(line(5, "Error: worker exception")),
		frame(line(4, "Error: worker exception")),
		frame(line(3, "MariaDB connection failed")),
		frame(line(2, "Authorization: Bearer sentinel_backend_opaque_secret Error: leaked")),
		frame(line(90, "Error: stale")),
	]);
	const problems = classifyBackendLog(raw, { now, windowMinutes: 60 });
	assert.deepEqual(problems.map((p) => [p.category, p.count]), [["backend_exception", 2], ["database_connectivity_error", 1]]);
	assert.equal(JSON.stringify(problems).includes("sentinel_backend_opaque_secret"), false);
	assert.equal(classifyBackendLog(raw, { now, windowMinutes: 15 })?.length, 2);
});

test("Docker log request is fixed to own container and bounded", async () => {
	const dir = await mkdtemp(join(os.tmpdir(), "nyx-backend-log-"));
	const socketPath = join(dir, "docker.sock");
	const paths = [];
	const server = http.createServer((req, res) => { paths.push(req.url); res.end(frame(line(1, "Error: bounded backend failure"))); });
	try {
		await new Promise((resolve) => server.listen(socketPath, resolve));
		const result = await recentBackendProblems({ socketPath, containerId: "c".repeat(12), now, windowMinutes: 15 });
		assert.equal(result.available, true);
		assert.equal(result.problems[0].category, "backend_exception");
		assert.match(paths[0], /^\/containers\/c{12}\/logs\?stdout=1&stderr=1&timestamps=1&since=\d+&tail=200$/);
		assert.deepEqual(await recentBackendProblems({ socketPath, containerId: "../other" }), { available: false, problems: [] });
	} finally {
		await new Promise((resolve) => server.close(resolve));
		await rm(dir, { recursive: true, force: true });
	}
});
