import express from "express";

import db from "../db.js";
import errs from "../lib/error.js";
import jwtdecode from "../lib/express/jwt-decode.js";
import validator from "../lib/validator/index.js";
import { debug, express as logger } from "../logger.js";

import internalWebThreatControls from "../internal/web-threat-controls.js";

const router = express.Router({
	caseSensitive: true,
	strict: true,
	mergeParams: true,
});

function asInt(v, fallback = null) {
	const n = Number.parseInt(String(v ?? ""), 10);
	return Number.isFinite(n) ? n : fallback;
}

function sinceMs(hours) {
	const h = Number.parseInt(String(hours ?? ""), 10);
	const use = Number.isFinite(h) && h > 0 ? Math.min(720, h) : 24;
	return Date.now() - use * 60 * 60 * 1000;
}

/**
 * GET /api/web-threat/effective?appId=
 */
router.get("/effective", jwtdecode(), async (req, res, next) => {
	try {
		const access = await req.access.can("settings", "view");
		const appId = asInt(req.query.appId, null);
		const result = await internalWebThreatControls.getEffectivePolicyForApp(db(), appId);
		res.status(200).send({
			...result,
			capabilities: {
				outbound_enforcement_available: false,
			},
		});
	} catch (err) {
		next(err);
	}
});

/**
 * POST /api/web-threat/policy-sets/:id/versions
 */
router.post("/policy-sets/:id/versions", jwtdecode(), async (req, res, next) => {
	try {
		await req.access.can("settings", "manage");
		const id = asInt(req.params.id, null);
		if (!id) throw new errs.ParamError("policy_set_id");

		const body = req.body ?? {};
		const policy = body.policy ?? body.policy_json ?? body.policyJson;
		const createdBy = req.user?.email ?? req.user?.name ?? "user";
		const created = await internalWebThreatControls.createPolicyVersion(db(), id, policy, createdBy, { activate: body.activate !== false });
		res.status(201).send(created);
	} catch (err) {
		next(err);
	}
});

/**
 * POST /api/web-threat/policy-sets/:id/activate { version: number }
 */
router.post("/policy-sets/:id/activate", jwtdecode(), async (req, res, next) => {
	try {
		await req.access.can("settings", "manage");
		const id = asInt(req.params.id, null);
		const version = asInt(req.body?.version, null);
		if (!id) throw new errs.ParamError("policy_set_id");
		if (!version) throw new errs.ParamError("version");
		const out = await internalWebThreatControls.activatePolicyVersion(db(), id, version);
		res.status(200).send(out);
	} catch (err) {
		next(err);
	}
});

/**
 * POST /api/web-threat/policy-sets/:id/rollback
 */
router.post("/policy-sets/:id/rollback", jwtdecode(), async (req, res, next) => {
	try {
		await req.access.can("settings", "manage");
		const id = asInt(req.params.id, null);
		if (!id) throw new errs.ParamError("policy_set_id");
		const out = await internalWebThreatControls.rollbackPolicySet(db(), id);
		res.status(200).send(out);
	} catch (err) {
		next(err);
	}
});

/**
 * GET /api/web-threat/analytics/overview?appId=&hours=
 */
router.get("/analytics/overview", jwtdecode(), async (req, res, next) => {
	try {
		await req.access.can("settings", "view");
		const appId = asInt(req.query.appId, null);
		const cutoff = new Date(sinceMs(req.query.hours));

		const knex = db();
		const q = knex("web_threat_events")
			.select("category")
			.count({ count: "*" })
			.where("ts", ">=", cutoff)
			.groupBy("category");
		if (appId) q.andWhere("app_id", appId);

		const byCategoryRaw = await q;
		const byCategory = { inbound: 0, browser: 0, outbound: 0 };
		for (const r of byCategoryRaw ?? []) {
			const k = String(r.category ?? "");
			const c = Number.parseInt(String(r.count ?? "0"), 10) || 0;
			if (k in byCategory) byCategory[k] = c;
		}

		const topRulesQ = knex("web_threat_events")
			.select("rule_id")
			.count({ count: "*" })
			.where("ts", ">=", cutoff)
			.groupBy("rule_id")
			.orderBy("count", "desc")
			.limit(12);
		if (appId) topRulesQ.andWhere("app_id", appId);
		const topRulesRaw = await topRulesQ;
		const topRules = (topRulesRaw ?? []).map((r) => ({ ruleId: r.rule_id, count: Number.parseInt(String(r.count ?? "0"), 10) || 0 }));

		res.status(200).send({
			hours: Number.parseInt(String(req.query.hours ?? "24"), 10) || 24,
			byCategory,
			topRules,
		});
	} catch (err) {
		next(err);
	}
});

/**
 * GET /api/web-threat/events?appId=&hours=&limit=
 */
router.get("/events", jwtdecode(), async (req, res, next) => {
	try {
		await req.access.can("settings", "view");
		const appId = asInt(req.query.appId, null);
		const cutoff = new Date(sinceMs(req.query.hours));
		const limit = Math.min(500, Math.max(50, asInt(req.query.limit, 200) ?? 200));

		const knex = db();
		const q = knex("web_threat_events")
			.select(["id", "ts", "app_id as appId", "route_id as routeId", "category", "rule_id as ruleId", "action", "reason", "src_ip as srcIp", "request_id as requestId", "meta"])
			.where("ts", ">=", cutoff)
			.orderBy("ts", "desc")
			.limit(limit);
		if (appId) q.andWhere("app_id", appId);

		const rows = await q;
		res.status(200).send({ items: rows ?? [] });
	} catch (err) {
		next(err);
	}
});

/**
 * POST /api/web-threat/csp-report
 *
 * Called by nginx internal location /__nyxguard/csp-report.
 */
router.post("/csp-report", async (req, res, next) => {
	try {
		// Intentionally no auth; nginx internal route should be the only caller.
		const host = String(req.headers.host ?? "").split(":")[0].trim().toLowerCase();
		const report = req.body ?? {};
		const srcIp = String(req.headers["x-forwarded-for"] ?? req.socket?.remoteAddress ?? "").split(",")[0].trim().slice(0, 45) || null;

		let appId = null;
		if (host) {
			try {
				const row = await db()("proxy_host").select(["id", "domain_names"]).where("is_deleted", 0);
				for (const r of row ?? []) {
					let domains = [];
					if (Array.isArray(r.domain_names)) domains = r.domain_names;
					else if (typeof r.domain_names === "string") {
						try {
							const parsed = JSON.parse(r.domain_names);
							if (Array.isArray(parsed)) domains = parsed;
						} catch {
							// ignore
						}
					}
					if (domains.map((d) => String(d).toLowerCase().trim()).includes(host)) {
						appId = r.id;
						break;
					}
				}
			} catch {
				appId = null;
			}
		}

		await db()("web_threat_events").insert({
			ts: db().fn.now(3),
			app_id: appId,
			route_id: null,
			category: "browser",
			rule_id: "browser.csp.report",
			action: "log",
			reason: "CSP report received",
			src_ip: srcIp,
			request_id: null,
			meta: JSON.stringify({ host, report }),
		});

		res.status(204).send("");
	} catch (err) {
		debug(logger, `web-threat csp-report failed: ${err}`);
		// never fail the browser; treat as accepted
		res.status(204).send("");
		next?.(err);
	}
});

export default router;

