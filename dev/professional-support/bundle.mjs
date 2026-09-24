import { redact } from "./redaction.mjs";
import { STATES } from "./result.mjs";

export const MAX_BUNDLE_BYTES = 1_000_000;
const CHECK = /^[a-z][a-z0-9_]{1,63}$/;
const VERSION = /^\d+\.\d+\.\d+(?:[-+][a-zA-Z0-9.-]{1,64})?$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SUPPORT_ID = /^NYX-\d{8}-[A-Z2-7]{24}$/;
const EVIDENCE = new Set(["free_percent", "usage_percent", "seconds", "count", "host_id", "status_code", "days_remaining", "duration_ms", "port"]);
const FAILURES = Object.freeze({
	refused: "The configured upstream refused the connection.",
	timeout: "The configured upstream did not respond before the timeout.",
	unreachable: "The configured upstream network was unreachable.",
	not_found: "The configured upstream name did not resolve.",
	expired: "The upstream TLS certificate expired.",
	hostname_mismatch: "The upstream TLS certificate name did not match.",
	untrusted: "The upstream TLS certificate chain was not trusted.",
	handshake: "The upstream TLS handshake failed.",
	header_too_large: "The upstream response headers exceeded the safety limit.",
	protocol: "The upstream returned an invalid HTTP response.",
	connection_closed: "The upstream closed the connection before responding.",
	error: "The configured upstream check encountered an error.",
});
const CATEGORIES = new Set(["upstream_connection_refused", "upstream_timeout", "dns_resolution", "tls_handshake", "certificate_renewal", "upstream_response", "upstream_http_error", "openresty_error", "backend_exception", "database_connectivity_error", "migration_error"]);
const LICENSE_STATES = new Set(["ACTIVE", "OFFLINE_GRACE", "REFRESH_REQUIRED", "EXPIRED", "REVOKED", "INVALID", "AUTHORITY_UNAVAILABLE", "NOT_CONFIGURED"]);
const LICENSE_PRODUCTS = new Set(["nyxguard-manager-professional-support", "nyxcloud-premium-support"]);
const ACTIONS = Object.freeze({
	backend_health: "Check backend readiness and recent errors.",
	database_reachability: "Check MariaDB health and connectivity.",
	migrations_current: "Inspect migration status before changing versions.",
	openresty_health: "Inspect the OpenResty configuration and error log.",
	disk_capacity: "Free space and check for failed writes.",
	memory_pressure: "Inspect memory consumers and service stability.",
	cpu_usage: "Inspect sustained CPU load and service responsiveness.",
	dns_resolution: "Check the configured upstream name and resolver.",
	upstream_tcp: "Check upstream availability, port, and network policy.",
	upstream_tls: "Check the upstream certificate, name, and trust chain.",
	upstream_http: "Inspect upstream response handling and logs.",
	certificate_presence: "Restore or reassign the missing certificate.",
	certificate_expiry: "Renew or replace the certificate.",
	san_match: "Issue a certificate covering this host name.",
	chain_valid: "Check intermediates and certificate trust.",
});

const plain = (value) => value && typeof value === "object" && !Array.isArray(value) &&
	(Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
function numeric(value, min = -1e12, max = 1e12, integer = false) {
	if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max || integer && !Number.isSafeInteger(value))
		throw new TypeError("Invalid support bundle number");
	return value;
}
function optionalNumeric(source, key, out, outputKey, min = -1e12, max = 1e12, integer = false) {
	if (source[key] !== undefined && source[key] !== null) out[outputKey] = numeric(source[key], min, max, integer);
}
function time(value, now, optional = false, allowFuture = false) {
	if (value === undefined || value === null) {
		if (optional) return null;
		throw new TypeError("Missing support bundle timestamp");
	}
	const ms = value instanceof Date ? value.getTime() : typeof value === "string" ? Date.parse(value) : NaN;
	if (!Number.isFinite(ms) || !allowFuture && ms > now.getTime() + 60000) throw new TypeError("Invalid support bundle timestamp");
	return new Date(ms).toISOString();
}
function evidence(source) {
	if (!plain(source)) throw new TypeError("Invalid diagnostic evidence");
	const out = {};
	for (const [key, value] of Object.entries(source)) if (EVIDENCE.has(key)) out[key] = numeric(value);
	if (Object.hasOwn(FAILURES, source.failure)) out.failure = source.failure;
	return out;
}
function results(items) {
	if (!Array.isArray(items) || items.length > 512) throw new TypeError("Invalid diagnostic list");
	return items.map((item) => {
		if (!plain(item) || typeof item.check !== "string" || !CHECK.test(item.check) || !STATES.includes(item.state))
			throw new TypeError("Invalid diagnostic result");
		const skipped = item.state === "SKIPPED";
		const selectedEvidence = evidence(item.evidence ?? {});
		return {
			check: item.check, state: item.state, evidence: selectedEvidence,
			reason: skipped ? "This check had no reliable observation." : item.state === "PASS" ? "The check completed successfully." : FAILURES[selectedEvidence.failure] ?? "The check needs attention.",
			recommendation: skipped ? "Run diagnostics when this source is available." : item.state === "PASS" ? "Continue monitoring this check." : ACTIONS[item.check] ?? "Review the related service and recent errors.",
		};
	});
}
function entitlement(source, now) {
	if (source === undefined) return null;
	if (!plain(source) || !LICENSE_STATES.has(source.state) || source.product !== undefined && !LICENSE_PRODUCTS.has(source.product))
		throw new TypeError("Invalid entitlement metadata");
	const out = { state: source.state };
	if (source.product) out.product = source.product;
	if (source.expires_at !== undefined) out.expires_at = time(source.expires_at, now, false, true);
	optionalNumeric(source, "revision", out, "revision", 0, 1e12, true);
	return out;
}
function systemSnapshot(source) {
	if (source === undefined) return null;
	if (!plain(source)) throw new TypeError("Invalid system snapshot");
	const out = {};
	for (const [key, field] of [["uptimeSeconds", "uptime_seconds"], ["diskFreePercent", "disk_free_percent"],
		["memoryFreePercent", "memory_free_percent"], ["cpuUsagePercent", "cpu_usage_percent"]])
		optionalNumeric(source, key, out, field, 0, key === "uptimeSeconds" ? 1e12 : 100);
	for (const [key, field] of [["restartCount", "restart_count"], ["recentErrorCount", "recent_error_count"]])
		optionalNumeric(source, key, out, field, 0, 1e12, true);
	for (const [key, field] of [["backendHealthy", "backend_healthy"], ["databaseReachable", "database_reachable"],
		["migrationsCurrent", "migrations_current"], ["openrestyHealthy", "openresty_healthy"], ["configurationValid", "configuration_valid"]])
		if (typeof source[key] === "boolean") out[field] = source[key];
	return out;
}
function proxyHosts(items) {
	if (!Array.isArray(items) || items.length > 20) throw new TypeError("Invalid proxy host list");
	return items.map((item) => {
		if (!plain(item)) throw new TypeError("Invalid proxy host summary");
		const out = { host_id: numeric(item.id, 1, 1e12, true) };
		if (typeof item.enabled === "boolean") out.enabled = item.enabled;
		if (["http", "https"].includes(item.forward_scheme)) out.upstream_scheme = item.forward_scheme;
		optionalNumeric(item, "forward_port", out, "upstream_port", 1, 65535, true);
		optionalNumeric(item, "certificate_id", out, "certificate_id", 0, 1e12, true);
		if (Array.isArray(item.domain_names)) out.domain_count = numeric(item.domain_names.length, 0, 100, true);
		if (typeof item.allow_websocket_upgrade === "boolean") out.websocket_enabled = item.allow_websocket_upgrade;
		return out;
	});
}
function certificates(items, now) {
	if (!Array.isArray(items) || items.length > 20) throw new TypeError("Invalid certificate list");
	return items.map((item) => {
		if (!plain(item)) throw new TypeError("Invalid certificate summary");
		const out = { certificate_id: numeric(item.id, 1, 1e12, true) };
		if (item.expires_on !== undefined && item.expires_on !== null) out.expires_at = time(item.expires_on, now, false, true);
		if (Array.isArray(item.domain_names)) out.domain_count = numeric(item.domain_names.length, 0, 100, true);
		if (item.provider !== undefined) out.provider = item.provider === "letsencrypt" ? "letsencrypt" : "other";
		return out;
	});
}
function recentProblems(items, now) {
	if (!Array.isArray(items) || items.length > 40) throw new TypeError("Invalid recent problem list");
	return items.map((item) => {
		if (!plain(item) || !CATEGORIES.has(item.category) || !["WARNING", "FAIL"].includes(item.state))
			throw new TypeError("Invalid recent problem");
		const out = { category: item.category, state: item.state, count: numeric(item.count, 1, 1e12, true) };
		if (item.host_id !== null && item.host_id !== undefined) out.host_id = numeric(item.host_id, 1, 1e12, true);
		out.first_seen = time(item.first_seen, now);
		out.last_seen = time(item.last_seen, now);
		if (out.first_seen > out.last_seen) throw new TypeError("Invalid recent problem interval");
		return out;
	});
}

export function buildSupportBundle({ version, buildRevision, installationId, system = [], routing = [], tls = [], troubleshooting = [],
	entitlement: license, systemSnapshot: snapshot, proxyHosts: hosts = [], certificates: certs = [], recentProblems: problems = [],
	diagnosticsAt, diagnosticsStale = false, troubleshootingAt, troubleshootingStale = false, lastSupportId, now = new Date() }) {
	if (typeof version !== "string" || !VERSION.test(version) || typeof installationId !== "string" || !UUID.test(installationId))
		throw new TypeError("Invalid bundle identity");
	if (buildRevision !== undefined && (typeof buildRevision !== "string" || !/^[a-f0-9]{40}$/.test(buildRevision)))
		throw new TypeError("Invalid build revision");
	const generatedAt = time(now, new Date(), false, true);
	if (Math.abs(Date.now() - now.getTime()) > 5 * 60 * 1000) throw new TypeError("Bundle timestamp is not recent");
	if (lastSupportId !== undefined && (typeof lastSupportId !== "string" || !SUPPORT_ID.test(lastSupportId))) throw new TypeError("Invalid support ID");
	const bundle = {
		format: "nyxguard-support-bundle-v2", generated_at: generatedAt,
		support_record: { format: "nyxguard-support-record-v2", ...(lastSupportId ? { last_support_id: lastSupportId } : {}) },
		application: { version, ...(buildRevision ? { revision: buildRevision } : {}) }, installation: { id: installationId },
		entitlement: entitlement(license, now), system_snapshot: systemSnapshot(snapshot),
		proxy_hosts: proxyHosts(hosts), certificates: certificates(certs, now), recent_problems: recentProblems(problems, now),
		diagnostics: { captured_at: time(diagnosticsAt, now, true), stale: Boolean(diagnosticsStale),
			baseline_only: diagnosticsAt === undefined, system: results(system), routing: results(routing), tls: results(tls) },
		troubleshooting: { captured_at: time(troubleshootingAt, now, true), stale: Boolean(troubleshootingStale),
			results: results(troubleshooting) },
	};
	const safeBundle = redact(bundle);
	const bytes = Buffer.from(JSON.stringify(safeBundle), "utf8");
	if (bytes.length > MAX_BUNDLE_BYTES) throw new RangeError("Support bundle exceeds upload limit");
	return { bundle: safeBundle, bytes };
}
