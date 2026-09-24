import assert from "node:assert/strict";
import { test } from "node:test";
import { buildSupportBundle, MAX_BUNDLE_BYTES } from "./bundle.mjs";
import { redact } from "./redaction.mjs";

const installationId = "6a185775-37b1-4af7-9300-18a0e57e826c";
const base = () => ({ version: "5.0.0", installationId, now: new Date() });

test("V2 baseline works without a previous diagnostic or troubleshooting run", () => {
	const { bundle, bytes } = buildSupportBundle({
		...base(), buildRevision: "a".repeat(40), systemSnapshot: { backendHealthy: true, databaseReachable: true, uptimeSeconds: 120,
			diskFreePercent: 55, password: "seed_system_300" },
		entitlement: { state: "ACTIVE", product: "nyxcloud-premium-support", revision: 8,
			refresh_credential: "seed_entitlement_301" },
	});
	assert.equal(bundle.format, "nyxguard-support-bundle-v2");
	assert.equal(bundle.application.revision, "a".repeat(40));
	assert.equal(bundle.diagnostics.baseline_only, true);
	assert.equal(bundle.diagnostics.captured_at, null);
	assert.deepEqual(bundle.troubleshooting.results, []);
	assert.equal(bundle.system_snapshot.uptime_seconds, 120);
	assert.equal(bundle.entitlement.product, "nyxcloud-premium-support");
	assert.ok(bytes.length < MAX_BUNDLE_BYTES);
	assert.ok(!bytes.toString().includes("seed_"));
});

test("V2 selects proxy, certificate, problem, result and support metadata without raw secrets", () => {
	const seed = "seed_unrecognizable_302";
	const now = new Date();
	const at = new Date(now.getTime() - 30000).toISOString();
	const result = { check: "upstream_tcp", state: "FAIL", reason: seed, recommendation: seed,
		evidence: { host_id: 7, status_code: 502, failure: "refused", raw_log: seed, api_key: seed } };
	const { bundle, bytes } = buildSupportBundle({
		...base(), diagnosticsAt: at, troubleshootingAt: at, diagnosticsStale: true,
		system: [result], routing: [result], troubleshooting: [result],
		proxyHosts: [{ id: 7, enabled: true, forward_scheme: "http", forward_port: 8080,
			forward_host: seed, domain_names: [seed], password: seed, certificate_id: 3 }],
		certificates: [{ id: 3, expires_on: new Date(now.getTime() + 86400000),
			domain_names: [seed], provider: seed, private_key: seed }],
		recentProblems: [{ category: "upstream_connection_refused", state: "FAIL", host_id: 7,
			count: 4, first_seen: at, last_seen: at, excerpt: seed }],
		lastSupportId: "NYX-20260924-" + "A".repeat(24),
	});
	assert.equal(bundle.diagnostics.stale, true);
	assert.equal(bundle.troubleshooting.results[0].check, "upstream_tcp");
	assert.deepEqual({ ...bundle.diagnostics.routing[0].evidence }, { host_id: 7, status_code: 502, failure: "refused" });
	assert.equal(bundle.diagnostics.routing[0].reason, "The configured upstream refused the connection.");
	assert.equal(bundle.proxy_hosts[0].upstream_port, 8080);
	assert.equal(bundle.proxy_hosts[0].domain_count, 1);
	assert.equal(bundle.certificates[0].provider, "other");
	assert.equal(bundle.recent_problems[0].count, 4);
	assert.equal(bundle.support_record.last_support_id, "NYX-20260924-" + "A".repeat(24));
	assert.ok(!bytes.toString().includes(seed));
});

test("V2 rejects unsafe metadata and bounds result counts", () => {
	assert.throws(() => buildSupportBundle({ ...base(), buildRevision: "not-a-commit" }), TypeError);
	assert.throws(() => buildSupportBundle({ ...base(), entitlement: { state: "ACTIVE", product: "other" } }), TypeError);
	assert.throws(() => buildSupportBundle({ ...base(), proxyHosts: [{ id: 1, forward_port: 65536 }] }), TypeError);
	assert.throws(() => buildSupportBundle({ ...base(), recentProblems: [{ category: "raw_log", state: "FAIL", count: 1 }] }), TypeError);
	assert.throws(() => buildSupportBundle({ ...base(), system: Array(513).fill({ check: "backend_health", state: "PASS" }) }), TypeError);
});

test("V2 includes troubleshooting results already passed through central redaction", () => {
	const steps = redact([{ check: "upstream_tcp", state: "FAIL", evidence: { host_id: 6, failure: "refused" } }]);
	const { bundle } = buildSupportBundle({ ...base(), troubleshooting: steps, troubleshootingAt: new Date().toISOString() });
	assert.equal(bundle.troubleshooting.results[0].check, "upstream_tcp");
	assert.equal(bundle.troubleshooting.results[0].evidence.failure, "refused");
});
