import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, rm, writeFile, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { recentOpenRestyProblems } from "./recent-problems.mjs";
import { redact } from "./redaction.mjs";

test("groups bounded current OpenResty errors without returning log contents", async () => {
	const root = await mkdtemp(join(tmpdir(), "nyx-support-logs-"));
	try {
		const secret = "seed_private_very_sensitive_201";
		const current = "2026/09/24 12:00:00 [error] connect() failed (111: Connection refused) while connecting to upstream, host: private.example, Authorization: Basic " + secret;
		await writeFile(join(root, "fallback_error.log"), `${current}\n${current}\n2026/09/23 12:00:00 [error] upstream timed out, token=${secret}\n`);
		await writeFile(join(root, "proxy-host-7_error.log"), `2026/09/24 12:01:00 [error] upstream timed out, password=${secret}\n`);
		await writeFile(join(root, "proxy-host-8_error.log"), `2026/09/24 12:01:00 [error] upstream timed out, password=${secret}\n`);
		await writeFile(join(root, "fallback_error.log.1.gz"), current);
		const groups = await recentOpenRestyProblems({ root, hostIds: [7], windowMinutes: 15, now: new Date("2026-09-24T12:05:00Z") });
		assert.deepEqual(groups.map(({ category, host_id, count }) => [category, host_id, count]),
			[["upstream_timeout", 7, 1], ["upstream_connection_refused", null, 2]]);
		const output = JSON.stringify(groups);
		for (const value of [secret, "private.example", "password", "Authorization", "fallback_error.log"]) assert.ok(!output.includes(value));
	} finally { await rm(root, { recursive: true, force: true }); }
});

test("rejects arbitrary files and ignores symlinked log files", async () => {
	const root = await mkdtemp(join(tmpdir(), "nyx-support-logs-"));
	try {
		await assert.rejects(recentOpenRestyProblems({ root, hostIds: ["../secret"] }), TypeError);
		await assert.rejects(recentOpenRestyProblems({ root, windowMinutes: 999 }), TypeError);
		await writeFile(join(root, "other.log"), "2026/09/24 12:00:00 [error] upstream timed out\n");
		await symlink(join(root, "other.log"), join(root, "fallback_error.log"));
		assert.deepEqual(await recentOpenRestyProblems({ root, now: new Date("2026-09-24T12:05:00Z") }), []);
	} finally { await rm(root, { recursive: true, force: true }); }
});

test("reads only the bounded tail of an oversized current log", async () => {
	const root = await mkdtemp(join(tmpdir(), "nyx-support-logs-"));
	try {
		const old = "2026/09/24 12:00:00 [error] upstream timed out\n";
		const current = "2026/09/24 12:01:00 [error] connect() failed (111: Connection refused) while connecting to upstream\n";
		await writeFile(join(root, "fallback_error.log"), old.repeat(3000) + current);
		const groups = await recentOpenRestyProblems({ root, windowMinutes: 15, now: new Date("2026-09-24T12:05:00Z") });
		assert.equal(groups.find((group) => group.category === "upstream_connection_refused")?.count, 1);
		assert.ok(groups.reduce((total, group) => total + group.count, 0) <= 1000);
	} finally { await rm(root, { recursive: true, force: true }); }
});

test("interprets OpenResty timestamps using the host log offset", async () => {
	const root = await mkdtemp(join(tmpdir(), "nyx-support-logs-"));
	try {
		await writeFile(join(root, "proxy-host-6_error.log"),
			"2026/09/24 16:06:27 [error] connect() failed (111: Connection refused) while connecting to upstream\n");
		const now = new Date("2026-09-24T13:07:00Z");
		const correct = await recentOpenRestyProblems({ root, hostIds: [6], windowMinutes: 15, now, logUtcOffsetMinutes: 180 });
		const wrong = await recentOpenRestyProblems({ root, hostIds: [6], windowMinutes: 15, now, logUtcOffsetMinutes: 120 });
		assert.deepEqual(correct.map(({ host_id, category }) => [host_id, category]), [[6, "upstream_connection_refused"]]);
		assert.deepEqual(wrong, []);
	} finally { await rm(root, { recursive: true, force: true }); }
});

test("redactor covers header text, query secrets and structured secret keys", () => {
	const sentinel = "seed_sensitive_202";
	for (const value of [
		`Authorization: Basic ${sentinel}`, `Cookie: sid=${sentinel}`, `Set-Cookie: sid=${sentinel}`,
		`session_id=${sentinel}`, `https://example.invalid/path?claim_code=${sentinel}`,
		`CF_API_TOKEN=${sentinel}`, `Bearer ${sentinel}`,
	]) assert.equal(redact(value), "[REDACTED]");
	const output = redact({ cloudflare_token: sentinel, claimCode: sentinel, safe: 3 });
	assert.deepEqual({ ...output }, { safe: 3 });
});
