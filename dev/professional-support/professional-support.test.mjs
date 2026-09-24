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

test("diagnostics explain every state without claiming missing observations passed", () => {
	const unobservedHost = { ...host, listenerMatched: undefined, routeMatched: undefined };
	const collections = [systemDiagnostics(), routingDiagnostics(unobservedHost), tlsDiagnostics(host), troubleshoot502(unobservedHost)];
	for (const collection of collections) for (const item of collection) {
		assert.ok(["PASS", "WARNING", "FAIL", "SKIPPED"].includes(item.state), item.check);
		assert.ok(typeof item.reason === "string" && item.reason.length > 10, item.check);
		assert.ok(typeof item.recommendation === "string" && item.recommendation.length > 10, item.check);
		assert.equal(item.summary, item.reason);
	}
	assert.ok(systemDiagnostics().every((item) => item.state === "SKIPPED"));
	assert.ok(routingDiagnostics(unobservedHost).every((item) => item.state === "SKIPPED"));
	assert.equal(tlsDiagnostics(host).find((item) => item.check === "certificate_presence").state, "FAIL");
	assert.equal(systemDiagnostics({ diskFreePercent: 110, memoryFreePercent: -1 })
		.find((item) => item.check === "disk_capacity").state, "SKIPPED");
});

test("system resource, restart, and error states require actual observations", () => {
	const absent = systemDiagnostics({ version: "5.0.0", backendHealthy: true });
	for (const name of ["disk_capacity", "memory_pressure", "restart_indicator", "error_indicator"]) {
		assert.equal(absent.find((item) => item.check === name).state, "SKIPPED");
	}
	assert.equal(absent.some((item) => item.check === "cpu_usage"), false);
	const observed = systemDiagnostics({ cpuUsagePercent: 96, diskFreePercent: 4, memoryFreePercent: 9,
		restartCount: 4, recentErrorCount: 2 });
	for (const name of ["cpu_usage", "disk_capacity"]) assert.equal(observed.find((item) => item.check === name).state, "FAIL");
	for (const name of ["memory_pressure", "restart_indicator", "error_indicator"]) {
		assert.equal(observed.find((item) => item.check === name).state, "WARNING");
	}
});

test("routing and TLS distinguish measured failures, disabled hosts, and missing probes", () => {
	const disabled = routingDiagnostics({ ...host, enabled: false });
	assert.equal(disabled.find((item) => item.check === "listener_match").state, "WARNING");
	assert.match(disabled.find((item) => item.check === "listener_match").reason, /disabled/);
	for (const item of [...disabled, ...tlsDiagnostics(host)]) assert.equal(item.evidence.host_id, host.id, item.check);
	const baseline = routingDiagnostics(host, { routeConflict: false });
	assert.match(baseline.find((item) => item.check === "dns_resolution").reason, /not requested/);
	assert.match(disabled.find((item) => item.check === "dns_resolution").reason, /disabled/);
	const http = routingDiagnostics({ ...host, forward_scheme: "http" }, { dnsResolved: true, tcpReachable: true, httpStatus: 503 });
	assert.equal(http.find((item) => item.check === "upstream_tls").state, "SKIPPED");
	assert.match(http.find((item) => item.check === "upstream_tls").reason, /HTTP/);
	assert.equal(http.find((item) => item.check === "upstream_http").state, "FAIL");
	assert.match(http.find((item) => item.check === "upstream_http").reason, /server error/);
	assert.equal(routingDiagnostics(host, { httpStatus: 401 }).find((item) => item.check === "upstream_http").state, "WARNING");
	const expired = tlsDiagnostics(host, { id: 3, expires_on: new Date(Date.now() - 86400000 * 2).toISOString() });
	assert.equal(expired.find((item) => item.check === "certificate_expiry").state, "FAIL");
	assert.match(expired.find((item) => item.check === "certificate_expiry").reason, /expired/);
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

test("bundle selects approved evidence, excludes seeded secrets, and stays within upload limit", () => {
	const seeded = "seeded_unrecognizable_secret_187";
	const result = { check: "backend_health", state: "PASS", evidence: {
		host_id: 7, password: seeded, arbitrary_text: seeded, authorization: `Bearer ${seeded}`,
	} };
	const { bundle, bytes } = buildSupportBundle({ version: "5.0.0", installationId, system: [result] });
	assert.equal(bundle.format, "nyxguard-support-bundle-v2");
	assert.ok(bytes.length <= MAX_BUNDLE_BYTES);
	assert.ok(!bytes.toString().includes(seeded));
	assert.equal(bundle.diagnostics.system[0].evidence.host_id, 7);
	assert.deepEqual(Object.keys(bundle.diagnostics.system[0].evidence), ["host_id"]);
	assert.throws(() => buildSupportBundle({ version: "5.0.0", installationId,
		system: [{ check: "valid_check", state: "PASS", evidence: { host_id: Number.NaN } }] }), TypeError);
	assert.throws(() => buildSupportBundle({ version: "5.0.0", installationId,
		system: Array(513).fill(result) }), TypeError);
});
