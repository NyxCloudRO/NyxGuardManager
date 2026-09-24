import express from "express";
import os from "node:os";
import { createHash, X509Certificate } from "node:crypto";
import { execFile } from "node:child_process";
import { lstat, readFile, stat, statfs } from "node:fs/promises";
import { promisify } from "node:util";
import jwtdecode from "../lib/express/jwt-decode.js";
import db from "../db.js";
import userModel from "../models/user.js";
import proxyHostModel from "../models/proxy_host.js";
import certificateModel from "../models/certificate.js";
import auditLog from "../internal/audit-log.js";
import nginx from "../internal/nginx.js";
import { loadVaultKey, SqlStore } from "../internal/nyxcloud-licensing/store.mjs";
import { LicensingClient } from "../internal/nyxcloud-licensing/client.mjs";
import { systemDiagnostics, routingDiagnostics, tlsDiagnostics } from "../internal/nyxcloud-support/diagnostics.mjs";
import { buildSupportBundle } from "../internal/nyxcloud-support/bundle.mjs";
import { recentOpenRestyProblems } from "../internal/nyxcloud-support/recent-problems.mjs";
import { redact } from "../internal/nyxcloud-support/redaction.mjs";
import { probeConfiguredHost } from "../internal/nyxcloud-licensing/probes.mjs";

const router = express.Router({ caseSensitive: true, strict: true, mergeParams: true });
const VERSION = "5.0.0";
const MAX_HOSTS = 20;
const MAX_CONCURRENT_PROBES = 4;
const BUNDLE_TTL_MS = 30 * 60 * 1000;
const RESULT_TTL_MS = 24 * 60 * 60 * 1000;
const execFileAsync = promisify(execFile);
let cachedClient;
let uploadBusy = false;
let diagnosticsBusy = false;
const generatedBundles = new Map();
let latestDiagnostics = null;
let latestTroubleshooting = null;

async function client() {
	if (cachedClient) return cachedClient;
	if (!process.env.NYXCLOUD_AUTHORITY_URL || !process.env.NYXCLOUD_LICENSE_VAULT_KEY_PATH) return null;
	const key = await loadVaultKey(process.env.NYXCLOUD_LICENSE_VAULT_KEY_PATH);
	const store = new SqlStore(db(), key);
	await store.installationId();
	cachedClient = new LicensingClient({ store, authorityOrigin: process.env.NYXCLOUD_AUTHORITY_URL,
		supportOrigin: process.env.NYXCLOUD_SUPPORT_URL });
	return cachedClient;
}

function sendError(res, error) {
	const category = typeof error?.message === "string" ? error.message : "support_unavailable";
	console.error("professional_support_error", /^(Invalid|Missing|Support bundle|Bundle timestamp)/.test(category) ? category : "request_failed");
	const input = /^(claim_code_invalid|activation_proof_missing|email_invalid|recovery_invalid|version_invalid)$/.test(category);
	const denied = /^(support_upload_not_authorized|support_feature_not_authorized|license_revoked_or_reactivation_required)$/.test(category);
	const conflict = category === "upload_conflict" || category === "bundle_not_generated";
	res.status(input ? 400 : denied ? 403 : conflict ? 409 : 503).json({ category: input ? "invalid_request" : denied ? "support_not_authorized" : conflict ? category : "support_unavailable" });
}

async function admin(req, res, next) {
	try {
		const userId = res.locals.access?.token?.getUserId(0);
		if (!Number.isSafeInteger(userId) || userId < 1) return res.sendStatus(403);
		const user = await userModel.query().select("id", "roles", "is_deleted", "is_disabled").where("id", userId).first();
		if (!user || user.is_deleted || user.is_disabled || !Array.isArray(user.roles) || !user.roles.includes("admin")) return res.sendStatus(403);
		next();
	} catch { res.sendStatus(503); }
}

async function audit(res, action) {
	await auditLog.add(res.locals.access, { action, object_type: "professional_support", object_id: 0, meta: {} });
}

async function permitted(res, { upload = false } = {}) {
	const c = await client();
	if (!c) { res.status(503).json({ category: "support_not_configured" }); return null; }
	const status = await c.status();
	if (!status.enabled || upload && status.state !== "ACTIVE") {
		res.status(403).json({ category: "support_not_authorized", state: status.state }); return null;
	}
	return { c, status };
}

const route = (method, path, handler) => router[method](path, async (req, res) => {
	try { await handler(req, res); } catch (err) { sendError(res, err); }
});

router.use(jwtdecode(), admin);
route("get", "/status", async (_req, res) => {
	const c = await client();
	res.set("Cache-Control", "no-store").json(c ? await c.status() : { state: "NOT_CONFIGURED", enabled: false });
});
route("post", "/claim", async (req, res) => {
	const c = await client(); if (!c) return res.status(503).json({ category: "support_not_configured" });
	await audit(res, "nyxcloud.support.claim.requested");
	res.json(await c.claim(req.body?.claim_code, req.body?.product));
});
route("post", "/activate", async (_req, res) => {
	const c = await client(); if (!c) return res.status(503).json({ category: "support_not_configured" });
	await audit(res, "nyxcloud.support.activation.requested");
	res.json(await c.activate());
});
route("post", "/refresh", async (_req, res) => {
	const c = await client(); if (!c) return res.status(503).json({ category: "support_not_configured" });
	await audit(res, "nyxcloud.support.refresh.requested");
	res.json(await c.refresh());
});
route("post", "/recovery/request", async (req, res) => {
	const c = await client(); if (!c) return res.status(503).json({ category: "support_not_configured" });
	await audit(res, "nyxcloud.support.recovery.requested");
	res.json(await c.requestRecovery(req.body?.email, req.body?.product));
});
route("post", "/recovery/confirm", async (req, res) => {
	const c = await client(); if (!c) return res.status(503).json({ category: "support_not_configured" });
	await audit(res, "nyxcloud.support.recovery.confirmed");
	res.json(await c.confirmRecovery(req.body?.recovery_code));
});
route("post", "/deactivate", async (_req, res) => {
	const c = await client(); if (!c) return res.status(503).json({ category: "support_not_configured" });
	await audit(res, "nyxcloud.support.deactivation.requested");
	res.json(await c.deactivate());
});
route("post", "/replace", async (_req, res) => {
	const c = await client(); if (!c) return res.status(503).json({ category: "support_not_configured" });
	await audit(res, "nyxcloud.support.replacement.requested");
	res.json(await c.replace());
});

const hostId = (value) => Number.isSafeInteger(value) && value > 0;
const bundleHash = (value) => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
const userId = (res) => res.locals.access.token.getUserId(0);
const fixed = (check, state, reason, recommendation, evidence = {}) => ({ check, state, reason, summary: reason, recommendation, evidence });
const countStates = (checks) => checks.reduce((out, item) => {
	out[item.state.toLowerCase()]++;
	return out;
}, { pass: 0, warning: 0, fail: 0, skipped: 0 });
const safeDomain = (value) => typeof value === "string" && value.length <= 253 &&
	/^(?:\*\.)?[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/i.test(value) &&
	!/secret|token|password|credential|api[_-]?key|private[_-]?key|recovery/i.test(value) ? value : null;

async function currentProblems(hostIds, windowMinutes = 60) {
	// OpenResty follows the mounted /etc/localtime. Node's ICU offset can differ
	// from libc on this image, so ask the same system clock used by nginx logs.
	const { stdout } = await execFileAsync("/bin/date", ["+%z"], { timeout: 500, maxBuffer: 32 });
	const offset = /^([+-])(\d{2})(\d{2})\s*$/.exec(stdout);
	if (!offset) throw new Error("log_clock_unavailable");
	const logUtcOffsetMinutes = (offset[1] === "-" ? -1 : 1) * (Number(offset[2]) * 60 + Number(offset[3]));
	return recentOpenRestyProblems({ root: "/data/logs", hostIds, windowMinutes,
		logUtcOffsetMinutes });
}

async function currentErrorLogAvailable(hostIds) {
	const names = ["fallback_error.log", "fallback_http_error.log",
		...hostIds.filter(hostId).slice(0, MAX_HOSTS).map((id) => `proxy-host-${id}_error.log`)];
	for (const name of names) {
		try { if ((await lstat(`/data/logs/${name}`)).isFile()) return true; } catch {}
	}
	return false;
}

async function nginxProcessHealthy() {
	try {
		const raw = (await readFile("/run/nginx/nginx.pid", "utf8")).trim();
		if (!/^\d{1,8}$/.test(raw)) return false;
		const pid = Number(raw);
		if (!hostId(pid)) return false;
		return (await readFile(`/proc/${pid}/comm`, "utf8")).trim() === "nginx";
	} catch { return false; }
}

async function cpuUsagePercent() {
	const totals = () => os.cpus().reduce((value, cpu) => {
		const ticks = Object.values(cpu.times).reduce((sum, tick) => sum + tick, 0);
		value.total += ticks;
		value.idle += cpu.times.idle;
		return value;
	}, { total: 0, idle: 0 });
	const first = totals();
	await new Promise((resolve) => setTimeout(resolve, 100));
	const second = totals();
	const total = second.total - first.total;
	return total > 0 ? Math.max(0, Math.min(100, (1 - (second.idle - first.idle) / total) * 100)) : undefined;
}

async function systemSnapshot(problems = [], logAvailable = false) {
	const snapshot = { version: VERSION, backendHealthy: true, uptimeSeconds: Math.floor(process.uptime()),
		memoryFreePercent: os.freemem() / os.totalmem() * 100 };
	try { snapshot.cpuUsagePercent = await cpuUsagePercent(); } catch {}
	try { await db().raw("SELECT 1").timeout(2000); snapshot.databaseReachable = true; }
	catch { snapshot.databaseReachable = false; }
	try {
		const row = await db()("migrations").where("name", "20260924000000_nyxcloud_professional_support.js").first("id").timeout(2000);
		snapshot.migrationsCurrent = Boolean(row);
	} catch { snapshot.migrationsCurrent = false; }
	const processHealthy = await nginxProcessHealthy();
	try { await nginx.test(); snapshot.configurationValid = true; }
	catch { snapshot.configurationValid = false; }
	snapshot.openrestyHealthy = processHealthy && snapshot.configurationValid;
	try { const disk = await statfs("/data"); snapshot.diskFreePercent = Number(disk.bavail) / Number(disk.blocks) * 100; } catch {}
	if (logAvailable) snapshot.recentErrorCount = problems.reduce((n, item) => n + item.count, 0);
	return snapshot;
}

async function activeHosts() {
	const rows = await proxyHostModel.query().select("id", "domain_names", "forward_scheme", "forward_host", "forward_port",
		"certificate_id", "enabled", "allow_websocket_upgrade", "locations", "meta")
		.where("is_deleted", 0).orderBy("id", "asc").limit(MAX_HOSTS + 1);
	return { rows: rows.slice(0, MAX_HOSTS).map((row) => ({ ...row, forward_port: Number(row.forward_port),
		certificate_id: Number(row.certificate_id), enabled: Boolean(row.enabled),
		allow_websocket_upgrade: Boolean(row.allow_websocket_upgrade) })), truncated: rows.length > MAX_HOSTS };
}

async function certificatesFor(hosts) {
	const ids = [...new Set(hosts.map((host) => host.certificate_id).filter(hostId))];
	if (!ids.length) return new Map();
	const rows = await certificateModel.query().select("id", "provider", "expires_on", "domain_names")
		.where("is_deleted", 0).whereIn("id", ids).limit(MAX_HOSTS);
	return new Map(rows.map((row) => [Number(row.id), { ...row, id: Number(row.id) }]));
}

async function routeObservations(host, nginxValid, duplicates) {
	if (!host.enabled) return { routeConflict: duplicates.has(host.id) };
	let config;
	try {
		const path = `/data/nginx/proxy_host/${host.id}.conf`;
		const info = await stat(path);
		if (!info.isFile() || info.size > 65536) return { listenerMatched: false, routeMatched: false, routeConflict: duplicates.has(host.id) };
		config = await readFile(path, "utf8");
	} catch { return { listenerMatched: false, routeMatched: false, routeConflict: duplicates.has(host.id) }; }
	const domains = Array.isArray(host.domain_names) ? host.domain_names.filter(safeDomain) : [];
	const serverName = config.match(/^\s*server_name\s+([^;]+);/m)?.[1]?.split(/\s+/) ?? [];
	return { listenerMatched: nginxValid && /^\s*listen\s+80\s*;/m.test(config) &&
		(!host.certificate_id || /^\s*listen\s+443\s+ssl\s*;/m.test(config)),
		routeMatched: domains.length > 0 && domains.every((name) => serverName.includes(name)),
		routeConflict: duplicates.has(host.id),
		websocketReady: host.allow_websocket_upgrade ? /proxy_set_header\s+Upgrade\s+\$http_upgrade/.test(config) : undefined };
}

function duplicateHostIds(hosts) {
	const seen = new Map();
	const duplicate = new Set();
	for (const host of hosts.filter((row) => row.enabled)) {
		for (const name of Array.isArray(host.domain_names) ? host.domain_names : []) {
			const domain = safeDomain(name)?.toLowerCase();
			if (!domain) continue;
			if (seen.has(domain)) { duplicate.add(host.id); duplicate.add(seen.get(domain)); }
			else seen.set(domain, host.id);
		}
	}
	return duplicate;
}

async function certificateObservation(host, certificate) {
	if (!certificate) return { certificate: null, observations: {} };
	const root = certificate.provider === "letsencrypt" ? "/etc/letsencrypt/live" : "/data/custom_ssl";
	const path = `${root}/npm-${certificate.id}/fullchain.pem`;
	try {
		const info = await stat(path);
		if (!info.isFile() || info.size > 65536) return { certificate: null, observations: {} };
		const pem = await readFile(path, "utf8");
		const publicCert = new X509Certificate(pem);
		const domains = Array.isArray(host.domain_names) ? host.domain_names.filter(safeDomain) : [];
		return { certificate: { ...certificate, expires_on: new Date(publicCert.validTo).toISOString() },
			observations: { sanMatches: domains.length > 0 ? domains.every((name) => Boolean(publicCert.checkHost(name))) : undefined } };
	} catch { return { certificate: null, observations: {} }; }
}

function enrichProbeChecks(checks, observations) {
	const failures = { dns_resolution: observations.dnsFailure, upstream_tcp: observations.tcpFailure,
		upstream_tls: observations.tlsFailure, upstream_http: observations.httpFailure };
	const reasons = {
		refused: "The configured upstream refused the connection.", timeout: "The configured upstream did not respond before the timeout.",
		unreachable: "The configured upstream network was unreachable.", not_found: "The configured upstream name did not resolve.",
		expired: "The upstream TLS certificate has expired.", hostname_mismatch: "The upstream TLS certificate does not match its configured name.",
		untrusted: "The upstream TLS certificate chain was not trusted.", handshake: "The upstream TLS handshake failed.",
		header_too_large: "The upstream response headers exceeded the safety limit.", protocol: "The upstream returned an invalid HTTP response.",
		connection_closed: "The upstream closed the connection before responding." };
	return checks.map((item) => {
		const failure = failures[item.check];
		if (!failure || !/^[a-z_]+$/.test(failure)) return item;
		const reason = reasons[failure] ?? item.reason;
		return { ...item, reason, summary: reason, evidence: { ...item.evidence, failure } };
	});
}

async function mapLimited(items, limit, worker) {
	let next = 0;
	const output = Array(items.length);
	await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
		for (;;) {
			const index = next++;
			if (index >= items.length) return;
			output[index] = await worker(items[index]);
		}
	}));
	return output;
}

async function diagnosticData({ probe = false, windowMinutes = 60 } = {}) {
	const { rows, truncated } = await activeHosts();
	const ids = rows.map((row) => row.id);
	const problems = await currentProblems(ids, windowMinutes);
	const logAvailable = await currentErrorLogAvailable(ids);
	const snapshot = await systemSnapshot(problems, logAvailable);
	const system = systemDiagnostics(snapshot);
	const certificates = await certificatesFor(rows);
	const duplicates = duplicateHostIds(rows);
	const hostResults = await mapLimited(rows, MAX_CONCURRENT_PROBES, async (host) => {
		const config = await routeObservations(host, snapshot.configurationValid, duplicates);
		let observations = {};
		if (probe && host.enabled) {
			try { observations = await probeConfiguredHost(host); }
			catch { observations = {}; }
		}
		let routing;
		try { routing = enrichProbeChecks(routingDiagnostics({ ...host, ...config }, { ...observations, ...config }), observations); }
		catch { routing = [fixed("host_configuration", "FAIL", "The configured proxy target is invalid.",
			"Review the configured upstream scheme, name, and port.", { host_id: host.id })]; }
		const certData = await certificateObservation(host, certificates.get(host.certificate_id));
		const tls = tlsDiagnostics(host, certData.certificate, certData.observations);
		return { id: host.id, domains: (Array.isArray(host.domain_names) ? host.domain_names : []).map(safeDomain).filter(Boolean).slice(0, 3),
			enabled: host.enabled, routing, tls, checks: [...routing, ...tls] };
	});
	const routing = hostResults.flatMap((host) => host.routing);
	const tls = hostResults.flatMap((host) => host.tls);
	const checks = [...system, ...routing, ...tls];
	const payload = { generated_at: new Date().toISOString(), checks, hosts: hostResults.map(({ id, domains, enabled, checks }) => ({ id, domains, enabled, checks })),
		problems, summary: countStates(checks), truncated, host_count: rows.length };
	return { payload: redact(payload), system, routing, tls, hosts: rows, certificates: [...certificates.values()],
		problems, snapshot };
}

async function hostById(id) {
	if (!hostId(id)) throw new Error("host_id_invalid");
	const host = await proxyHostModel.query().select("id", "domain_names", "forward_scheme", "forward_host", "forward_port",
		"certificate_id", "enabled", "allow_websocket_upgrade", "locations", "meta")
		.where({ id, is_deleted: 0 }).first();
	if (!host) throw new Error("host_unavailable");
	return { ...host, forward_port: Number(host.forward_port), certificate_id: Number(host.certificate_id),
		enabled: Boolean(host.enabled), allow_websocket_upgrade: Boolean(host.allow_websocket_upgrade) };
}

function purgeBundles() {
	const now = Date.now();
	for (const [key, value] of generatedBundles) if (now - value.at > BUNDLE_TTL_MS) generatedBundles.delete(key);
	while (generatedBundles.size > 8) generatedBundles.delete(generatedBundles.keys().next().value);
}
function generatedBundle(res, sha256) {
	purgeBundles();
	const item = generatedBundles.get(sha256);
	if (!item || item.userId !== userId(res)) throw new Error("bundle_not_generated");
	return item;
}

route("get", "/problems", async (req, res) => {
	if (!await permitted(res)) return;
	const windowMinutes = Number(req.query.window ?? 60);
	if (![15, 60, 1440].includes(windowMinutes)) return res.sendStatus(400);
	const { rows } = await activeHosts();
	const problems = await currentProblems(rows.map((row) => row.id), windowMinutes);
	const sourceAvailable = await currentErrorLogAvailable(rows.map((row) => row.id));
	res.set("Cache-Control", "no-store").json(redact({ problems, source_available: sourceAvailable,
		window_minutes: windowMinutes, generated_at: new Date().toISOString() }));
});
route("get", "/diagnostics", async (_req, res) => {
	const allowed = await permitted(res); if (!allowed) return;
	if (diagnosticsBusy) return res.sendStatus(429);
	diagnosticsBusy = true;
	try {
		await audit(res, "nyxcloud.support.diagnostics.run");
		const data = await diagnosticData({ probe: true });
		latestDiagnostics = { system: data.system, routing: data.routing, tls: data.tls,
			at: data.payload.generated_at, userId: userId(res), installationId: allowed.status.installation_id };
		res.set("Cache-Control", "no-store").json(data.payload);
	} finally { diagnosticsBusy = false; }
});
route("post", "/troubleshoot", async (req, res) => {
	const allowed = await permitted(res); if (!allowed) return;
	if (!Number.isSafeInteger(req.body?.proxy_host_id) ||
		!["upstream_502", "upstream_timeout", "dns_resolution", "tls_certificate", "configuration_error"].includes(req.body?.workflow))
		return res.sendStatus(400);
	const host = await hostById(req.body.proxy_host_id);
	if (!host.enabled) return res.status(409).json({ category: "host_disabled" });
	await audit(res, "nyxcloud.support.troubleshooting.run");
	let configValid = false;
	try { await nginx.test(); configValid = true; } catch {}
	const { rows } = await activeHosts();
	const config = await routeObservations(host, configValid, duplicateHostIds(rows));
	let observations = {};
	try { observations = await probeConfiguredHost(host); } catch {}
	let routing;
	try { routing = enrichProbeChecks(routingDiagnostics({ ...host, ...config }, { ...observations, ...config }), observations); }
	catch { routing = [fixed("host_configuration", "FAIL", "The configured proxy target is invalid.",
		"Review the configured upstream scheme, name, and port.", { host_id: host.id })]; }
	const cert = await certificateModel.query().select("id", "provider", "expires_on", "domain_names")
		.where({ id: host.certificate_id, is_deleted: 0 }).first();
	const certData = await certificateObservation(host, cert);
	const tls = tlsDiagnostics(host, certData.certificate, certData.observations);
	const problems = (await currentProblems([host.id], 60)).filter((item) => item.host_id === host.id);
	let hostLogAvailable = false;
	try { hostLogAvailable = (await lstat(`/data/logs/proxy-host-${host.id}_error.log`)).isFile(); } catch {}
	const errorStep = fixed("recent_errors", !hostLogAvailable ? "SKIPPED" : problems.length ? "WARNING" : "PASS",
		!hostLogAvailable ? "The current proxy error log was unavailable." : problems.length ? "Recent OpenResty errors affected this proxy host." : "No classified errors were found in the current proxy error log.",
		!hostLogAvailable ? "Check OpenResty logging for this proxy host." : problems.length ? "Inspect recent problems and the configured upstream." : "Continue monitoring this proxy host.",
		{ host_id: host.id, count: problems.reduce((n, item) => n + item.count, 0) });
	const configStep = fixed("configuration_valid", config.listenerMatched === true && config.routeMatched === true ? "PASS" : "FAIL",
		config.listenerMatched === true && config.routeMatched === true ? "Generated routing configuration was found." : "Generated routing configuration was missing or mismatched.",
		"Review the proxy host configuration and reload status.", { host_id: host.id });
	const order = req.body.workflow === "tls_certificate" ? ["configuration_valid", "certificate_presence", "certificate_expiry", "san_match", "chain_valid", "upstream_tls", "recent_errors"]
		: req.body.workflow === "dns_resolution" ? ["configuration_valid", "dns_resolution", "upstream_tcp", "recent_errors"]
			: ["configuration_valid", "dns_resolution", "listener_match", "route_match", "upstream_tcp", "upstream_tls", "upstream_http", "redirect_safe", "recent_errors"];
	const all = [...routing, ...tls, configStep, errorStep];
	const steps = order.map((name) => all.find((item) => item.check === name)).filter(Boolean);
	const payload = redact({ steps, host_id: host.id, generated_at: new Date().toISOString(), workflow: req.body.workflow, problems });
	latestTroubleshooting = { at: payload.generated_at, steps: payload.steps,
		userId: userId(res), installationId: allowed.status.installation_id };
	res.set("Cache-Control", "no-store").json(payload);
});

async function bundleData(entitlement, requester) {
	const baseline = await diagnosticData({ probe: false });
	const usable = (entry) => entry && entry.userId === requester &&
		entry.installationId === entitlement.installation_id &&
		Number.isFinite(Date.parse(entry.at)) && Date.now() - Date.parse(entry.at) <= RESULT_TTL_MS;
	const diagnostics = usable(latestDiagnostics) ? latestDiagnostics : null;
	const troubleshooting = usable(latestTroubleshooting) ? latestTroubleshooting : null;
	const results = diagnostics ?? baseline;
	return buildSupportBundle({ version: VERSION, installationId: entitlement.installation_id, entitlement,
		systemSnapshot: baseline.snapshot, proxyHosts: baseline.hosts, certificates: baseline.certificates,
		recentProblems: baseline.problems, system: results.system, routing: results.routing, tls: results.tls,
		diagnosticsAt: diagnostics?.at, diagnosticsStale: Boolean(diagnostics && Date.now() - Date.parse(diagnostics.at) >= 15 * 60 * 1000),
		troubleshooting: troubleshooting?.steps ?? [], troubleshootingAt: troubleshooting?.at,
		troubleshootingStale: Boolean(troubleshooting && Date.now() - Date.parse(troubleshooting.at) >= 15 * 60 * 1000) });
}
route("get", "/bundle", async (_req, res) => {
	const allowed = await permitted(res); if (!allowed) return;
	await audit(res, "nyxcloud.support.bundle.generated");
	const { bytes } = await bundleData(allowed.status, userId(res));
	const sha256 = createHash("sha256").update(bytes).digest("hex");
	purgeBundles();
	generatedBundles.set(sha256, { bytes, userId: userId(res), at: Date.now(), installationId: allowed.status.installation_id });
	purgeBundles();
	res.set({ "Cache-Control": "no-store", "Content-Type": "application/json", "X-NyxGuard-Bundle-SHA256": sha256 });
	res.send(bytes);
});
route("get", "/bundle/:sha256/download", async (req, res) => {
	const allowed = await permitted(res); if (!allowed) return;
	if (!bundleHash(req.params.sha256)) return res.sendStatus(400);
	const item = generatedBundle(res, req.params.sha256);
	if (item.installationId !== allowed.status.installation_id) return res.sendStatus(403);
	await audit(res, "nyxcloud.support.bundle.downloaded");
	res.set({ "Cache-Control": "no-store", "Content-Type": "application/json", "Content-Disposition": 'attachment; filename="nyxguard-support-bundle.json"',
		"X-NyxGuard-Bundle-SHA256": req.params.sha256 });
	res.send(item.bytes);
});
route("post", "/upload", async (req, res) => {
	const allowed = await permitted(res, { upload: true }); if (!allowed) return;
	if (!bundleHash(req.body?.sha256)) return res.sendStatus(400);
	const item = generatedBundle(res, req.body.sha256);
	if (item.installationId !== allowed.status.installation_id) return res.sendStatus(403);
	if (item.receipt) return res.json(item.receipt);
	if (uploadBusy) return res.sendStatus(409);
	uploadBusy = true;
	try {
		await audit(res, "nyxcloud.support.upload.requested");
		await allowed.c.refresh();
		const fresh = await allowed.c.status();
		if (fresh.state !== "ACTIVE") return res.status(403).json({ category: "support_not_authorized" });
		item.receipt = await allowed.c.upload(item.bytes.toString("utf8"), VERSION, req.body.sha256);
		res.json(item.receipt);
	} finally { uploadBusy = false; }
});

const timer = setInterval(async () => {
	try { const c = await client(); if (c && (await c.status()).state === "REFRESH_REQUIRED") await c.refresh(); } catch {}
}, 15 * 60 * 1000);
timer.unref();

export default router;
