import express from "express";
import os from "node:os";
import { statfs } from "node:fs/promises";
import jwtdecode from "../lib/express/jwt-decode.js";
import db from "../db.js";
import userModel from "../models/user.js";
import auditLog from "../internal/audit-log.js";
import nginx from "../internal/nginx.js";
import { loadVaultKey, SqlStore } from "../internal/nyxcloud-licensing/store.mjs";
import { LicensingClient } from "../internal/nyxcloud-licensing/client.mjs";
import { systemDiagnostics, routingDiagnostics, tlsDiagnostics, troubleshoot502 } from "../internal/nyxcloud-support/diagnostics.mjs";
import { buildSupportBundle } from "../internal/nyxcloud-support/bundle.mjs";
import { probeConfiguredHost } from "../internal/nyxcloud-licensing/probes.mjs";

const router = express.Router({ caseSensitive: true, strict: true, mergeParams: true });
const VERSION = "5.0.0";
const MAX_HOSTS = 20;
let cachedClient;
let uploadBusy = false;

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
	const input = /^(claim_code_invalid|activation_proof_missing|email_invalid|recovery_invalid|version_invalid)$/.test(category);
	const denied = /^(support_upload_not_authorized|support_feature_not_authorized|license_revoked_or_reactivation_required)$/.test(category);
	res.status(input ? 400 : denied ? 403 : 503).json({ category: input ? "invalid_request" : denied ? "support_not_authorized" : "support_unavailable" });
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

async function systemSnapshot() {
	const snapshot = { version: VERSION, backendHealthy: true, uptimeSeconds: process.uptime(),
		memoryFreePercent: os.freemem() / os.totalmem() * 100, configurationValid: Boolean(cachedClient) };
	try { await db().raw("SELECT 1"); snapshot.databaseReachable = true; } catch { snapshot.databaseReachable = false; }
	try {
		const row = await db()("migrations").where("name", "20260924000000_nyxcloud_professional_support.js").first("id");
		snapshot.migrationsCurrent = Boolean(row);
	} catch { snapshot.migrationsCurrent = false; }
	try { await nginx.test(); snapshot.openrestyHealthy = true; } catch { snapshot.openrestyHealthy = false; }
	try { const disk = await statfs("/data"); snapshot.diskFreePercent = Number(disk.bavail) / Number(disk.blocks) * 100; } catch {}
	return systemDiagnostics(snapshot);
}

async function hostById(id) {
	if (!Number.isSafeInteger(id) || id < 1) throw new Error("host_id_invalid");
	const row = await db()("proxy_host").select("id", "forward_scheme", "forward_host", "forward_port", "certificate_id", "enabled", "domain_names")
		.where({ id, is_deleted: 0 }).first();
	if (!row) throw new Error("host_unavailable");
	return { ...row, forward_port: Number(row.forward_port), certificate_id: Number(row.certificate_id), enabled: Boolean(row.enabled) };
}
async function certificateFor(host) {
	if (!host.certificate_id) return null;
	return await db()("certificate").select("id", "expires_on", "domain_names", "provider").where({ id: host.certificate_id, is_deleted: 0 }).first();
}
async function diagnosticData() {
	const system = await systemSnapshot();
	const rows = await db()("proxy_host").select("id", "forward_scheme", "forward_host", "forward_port", "certificate_id", "enabled", "domain_names")
		.where({ is_deleted: 0 }).orderBy("id", "asc").limit(MAX_HOSTS);
	const routing = [], tls = [];
	for (const row of rows) {
		const host = { ...row, forward_port: Number(row.forward_port), certificate_id: Number(row.certificate_id), enabled: Boolean(row.enabled) };
		try { routing.push(...routingDiagnostics(host)); } catch {}
		try { tls.push(...tlsDiagnostics(host, await certificateFor(host))); } catch {}
	}
	return { system, routing, tls, troubleshooting: [] };
}
route("get", "/diagnostics", async (_req, res) => {
	if (!await permitted(res)) return;
	const data = await diagnosticData();
	res.set("Cache-Control", "no-store").json({ checks: [...data.system, ...data.routing, ...data.tls] });
});
route("post", "/troubleshoot", async (req, res) => {
	if (!await permitted(res)) return;
	if (req.body?.workflow !== "upstream_502" || !Number.isSafeInteger(req.body?.proxy_host_id)) return res.sendStatus(400);
	const host = await hostById(req.body.proxy_host_id);
	const observations = await probeConfiguredHost(host);
	res.set("Cache-Control", "no-store").json({ steps: troubleshoot502(host, observations) });
});
async function bundleData(c) {
	const state = await c.status();
	const data = await diagnosticData();
	return buildSupportBundle({ version: VERSION, installationId: state.installation_id, ...data });
}
route("get", "/bundle", async (_req, res) => {
	const allowed = await permitted(res); if (!allowed) return;
	const { bytes } = await bundleData(allowed.c);
	res.set({ "Cache-Control": "no-store", "Content-Type": "application/json", "Content-Disposition": 'attachment; filename="nyxguard-support-bundle.json"' });
	res.send(bytes);
});
route("post", "/upload", async (_req, res) => {
	const allowed = await permitted(res, { upload: true }); if (!allowed) return;
	if (uploadBusy) return res.sendStatus(409);
	uploadBusy = true;
	try {
		await audit(res, "nyxcloud.support.upload.requested");
		await allowed.c.refresh();
		const fresh = await allowed.c.status();
		if (fresh.state !== "ACTIVE") return res.status(403).json({ category: "support_not_authorized" });
		const { bytes } = await bundleData(allowed.c);
		res.json(await allowed.c.upload(bytes.toString("utf8"), VERSION));
	} finally { uploadBusy = false; }
});

const timer = setInterval(async () => {
	try { const c = await client(); if (c && (await c.status()).state === "REFRESH_REQUIRED") await c.refresh(); } catch {}
}, 15 * 60 * 1000);
timer.unref();

export default router;
