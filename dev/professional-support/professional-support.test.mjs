import assert from "node:assert/strict";
import { test } from "node:test";
import { buildSupportBundle, MAX_BUNDLE_BYTES } from "./bundle.mjs";
import { configuredTarget, routingDiagnostics, systemDiagnostics, tlsDiagnostics, troubleshoot502 } from "./diagnostics.mjs";
import { redact } from "./redaction.mjs";

const host = { id: 7, forward_scheme: "https", forward_host: "upstream.example", forward_port: 443,
	enabled: true, listenerMatched: true, routeMatched: true, certificate_id: 3 };
const installationId = "6a185775-37b1-4af7-9300-18a0e57e826c";

test("system, routing, TLS and 502 workflow return bounded stable states", () => {
	const system = systemDiagnostics({ backendHealthy: true, databaseReachable: false, diskFreePercent: 9,
		memoryFreePercent: 40, uptimeSeconds: 40, restartCount: 3 });
	assert.equal(system.find((r) => r.check === "database_reachability").state, "FAIL");
	assert.equal(system.find((r) => r.check === "disk_capacity").state, "WARNING");
	const observations = { dnsResolved: true, tcpReachable: false, tlsValid: false, httpStatus: 502 };
	const routing = routingDiagnostics(host, observations);
	assert.equal(routing.find((r) => r.check === "upstream_tcp").state, "FAIL");
	assert.equal(routing.find((r) => r.check === "upstream_http").evidence.status_code, 502);
	assert.deepEqual(troubleshoot502(host, observations).map((r) => r.check),
		["dns_resolution", "listener_match", "route_match", "upstream_tcp", "upstream_tls", "upstream_http"]);
	const tls = tlsDiagnostics(host, { id: 3, expires_on: new Date(Date.now() + 10 * 86400000).toISOString() });
	assert.equal(tls.find((r) => r.check === "certificate_expiry").state, "WARNING");
});

test("configured target rejects URL, credentials, paths and arbitrary ports", () => {
	for (const bad of [
		"http://169.254.169.254/latest/meta-data", "user:password@internal.example", "internal.example/path",
		"internal.example:443", "internal.example?redirect=http://127.0.0.1", "[::1]",
	]) assert.throws(() => configuredTarget({ ...host, forward_host: bad }), TypeError);
	assert.throws(() => configuredTarget({ ...host, forward_port: 0 }), TypeError);
	assert.throws(() => configuredTarget({ ...host, forward_scheme: "file" }), TypeError);
	assert.deepEqual(configuredTarget(host), { host_id: 7, scheme: "https", host: "upstream.example", port: 443 });
	assert.throws(() => tlsDiagnostics(host, { id: 4 }), TypeError);
});

test("central redactor strips seeded secrets and rejects unsafe object types", () => {
	const seeded = {
		password: "seed_password_181", bearerToken: "seed_bearer_182", api_key: "seed_api_183",
		private_key: "seed_private_184", s3_secret: "seed_s3_185",
		safe: "ok", note: "Bearer seed_bearer_186", nested: { db_url: "mysql://user:pass@db", count: 1 },
	};
	const output = JSON.stringify(redact(seeded));
	for (const marker of ["seed_password_181", "seed_bearer_182", "seed_api_183", "seed_private_184", "seed_s3_185", "seed_bearer_186", "mysql://user:pass@db"]) {
		assert.ok(!output.includes(marker), marker);
	}
	assert.throws(() => redact(new Date()), TypeError);
});

test("bundle selects approved evidence, excludes seeded secrets, and stays within 1 MiB", () => {
	const seeded = "seeded_unrecognizable_secret_187";
	const result = { check: "backend_health", state: "PASS", evidence: {
		host_id: 7, password: seeded, arbitrary_text: seeded, authorization: `Bearer ${seeded}`,
	} };
	const { bundle, bytes } = buildSupportBundle({ version: "5.0.0", installationId, system: [result] });
	assert.equal(bundle.format, "nyxguard-support-bundle-v1");
	assert.ok(bytes.length <= MAX_BUNDLE_BYTES);
	assert.ok(!bytes.toString().includes(seeded));
	assert.equal(bundle.diagnostics.system[0].evidence.host_id, 7);
	assert.deepEqual(Object.keys(bundle.diagnostics.system[0].evidence), ["host_id"]);
	assert.throws(() => buildSupportBundle({ version: "5.0.0", installationId,
		system: [{ check: "valid_check", state: "PASS", evidence: { host_id: Number.NaN } }] }), TypeError);
	assert.throws(() => buildSupportBundle({ version: "5.0.0", installationId,
		system: Array(101).fill(result) }), TypeError);
});
