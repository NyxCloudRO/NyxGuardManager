import express from "express";
import db from "../db.js";
import jwtdecode from "../lib/express/jwt-decode.js";
import validator from "../lib/validator/index.js";
import { debug, express as logger } from "../logger.js";

const router = express.Router({
	caseSensitive: true,
	strict: true,
	mergeParams: true,
});

async function ensureAdmin(access) {
	await access.can("settings:update", "default-site");
}

async function collectAccessEvents(hours, limit) {
	const after = new Date(Date.now() - hours * 60 * 60 * 1000);
	const rows = await db()("audit_log")
		.select("id", "created_on", "action", "object_id", "meta")
		.whereIn("object_type", ["access-login", "access-check"])
		.andWhere("created_on", ">=", after)
		.orderBy("created_on", "desc")
		.limit(limit);

	return rows.map((row) => {
		const metaRaw = row.meta;
		const meta = typeof metaRaw === "string" ? (() => { try { return JSON.parse(metaRaw); } catch { return {}; } })() : (metaRaw || {});
		const isCheck = row.action === "deny" || meta.ctx === "access-check";
		const status = Number(meta.status || (isCheck ? 403 : 0)) || 0;
		const result = String(meta.result || (isCheck ? "denied" : (status >= 200 && status < 300 ? "success" : "failed"))).toLowerCase();
		const reason = String(meta.reason || "");
		const username = String(meta.username || "");
		const hostLabel = String(meta.host || "");
		const title = isCheck
			? `Access Check Denied${reason ? ` (${reason})` : ""}`
			: `Access Login ${result === "success" ? "Success" : "Failed"}${username ? ` (${username})` : ""}`;
		return {
			id: `${isCheck ? "access-check" : "access-login"}-${row.id}`,
			hostId: Number(meta.host_id || row.object_id || 0) || 0,
			hostLabel: hostLabel || `Access List #${row.object_id}`,
			timestamp: row.created_on ? new Date(row.created_on).toISOString() : new Date().toISOString(),
			status,
			method: isCheck ? "CHECK" : "LOGIN",
			uri: title,
			scheme: String(meta.scheme || "https"),
			externalIp: String(meta.external_ip || meta.client_ip || ""),
			internalIp: String(meta.internal_ip || ""),
			country: String(meta.country || ""),
			userAgent: String(meta.user_agent || ""),
			referrer: String(meta.referrer || ""),
			result,
			reason,
			username,
		};
	});
}

function isMissingTableError(err) {
	const msg = String(err?.message || err || "").toLowerCase();
	return msg.includes("no such table") || msg.includes("doesn't exist") || msg.includes("does not exist");
}

async function safeDelete(fn) {
	try {
		return await fn();
	} catch (err) {
		if (isMissingTableError(err)) return 0;
		throw err;
	}
}

router
	.route("/access-logs")
	.options((_, res) => res.sendStatus(204))
	.all(jwtdecode())
	.get(async (req, res, next) => {
		try {
			await ensureAdmin(res.locals.access);
			const query = await validator(
				{
					additionalProperties: false,
					properties: {
						hours: { type: "integer", minimum: 1, maximum: 24 * 180 },
						limit: { type: "integer", minimum: 1, maximum: 1000 },
					},
				},
				{
					hours: Number.parseInt(String(req.query?.hours ?? String(24 * 180)), 10),
					limit: Number.parseInt(String(req.query?.limit ?? "200"), 10),
				},
			);

			const items = await collectAccessEvents(query.hours || 24 * 180, query.limit || 200);
			res.status(200).send({ items });
		} catch (err) {
			debug(logger, `GET /api/event-center/access-logs: ${err}`);
			next(err);
		}
	});

router
	.route("/clear")
	.options((_, res) => res.sendStatus(204))
	.all(jwtdecode())
	.post(async (req, res, next) => {
		try {
			await ensureAdmin(res.locals.access);
			const body = req.body || {};
			const data = await validator(
				{
					required: ["scope"],
					additionalProperties: false,
					properties: {
						scope: {
							type: "string",
							enum: ["all", "access", "security", "application", "users"],
						},
					},
				},
				{
					scope: body.scope,
				},
			);

			const cleared = {
				auditLogs: 0,
				nyxguardAttackEvents: 0,
				webThreatEvents: 0,
				accessLogs: 0,
			};

			if (data.scope === "users") {
				cleared.auditLogs = await safeDelete(() => db()("audit_log").where("object_type", "user").del());
			} else if (data.scope === "application") {
				cleared.auditLogs = await safeDelete(() => db()("audit_log").whereNot("object_type", "user").del());
			} else if (data.scope === "all") {
				cleared.auditLogs = await safeDelete(() => db()("audit_log").del());
			}

			if (data.scope === "security" || data.scope === "all") {
				cleared.nyxguardAttackEvents = await safeDelete(() => db()("nyxguard_attack_event").del());
				cleared.webThreatEvents = await safeDelete(() => db()("web_threat_events").del());
			}

			if (data.scope === "access" || data.scope === "all") {
				cleared.accessLogs = await safeDelete(() => db()("audit_log").whereIn("object_type", ["access-login", "access-check"]).del());
			}

			res.status(200).send({
				scope: data.scope,
				cleared,
			});
		} catch (err) {
			debug(logger, `POST /api/event-center/clear: ${err}`);
			next(err);
		}
	});

export default router;
