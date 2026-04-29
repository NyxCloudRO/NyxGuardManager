import bodyParser from "body-parser";
import express from "express";
import db from "../../db.js";
import internalNyxGuard from "../../internal/nyxguard.js";
import internalWafRules from "../../internal/waf-rules.js";
import errs from "../../lib/error.js";
import jwtdecode from "../../lib/express/jwt-decode.js";

const router = express.Router({
	caseSensitive: true,
	strict: true,
	mergeParams: true,
});

// Tight body-size limit for WAF rule endpoints.
// A valid rule body is at most ~1.5 KB (pattern ≤1024 chars + fields).
// This prevents memory exhaustion from oversized payloads before any
// field-level validation runs.
const wafBodyParser = bodyParser.json({ limit: "8kb" });

async function requireNyxGuardView(_req, res, next) {
	try {
		await res.locals.access.can("nyxguard:list");
		next();
	} catch (err) {
		next(err);
	}
}

// ── WAF Custom Rules ─────────────────────────────────────────────────────────

router
	.route("/waf-rules")
	.options((_, res) => res.sendStatus(204))
	.all(jwtdecode())
	.all(requireNyxGuardView)
	.get(async (req, res, next) => {
		try {
			await res.locals.access.can("nyxguard:list");
			const knex = db();
			const rules = await internalWafRules.list(knex, { proxyHostId: null });
			res.json(rules);
		} catch (err) {
			next(err);
		}
	})
	.post(wafBodyParser, async (req, res, next) => {
		try {
			await res.locals.access.can("nyxguard:update");
			const knex = db();
			const rule = await internalWafRules.create(knex, req.body);
			// Regenerate nginx config with updated rules
			await internalNyxGuard.nginx.apply(knex);
			res.status(201).json(rule);
		} catch (err) {
			next(err);
		}
	});

router
	.route("/waf-rules/:id")
	.options((_, res) => res.sendStatus(204))
	.all(jwtdecode())
	.all(requireNyxGuardView)
	.put(wafBodyParser, async (req, res, next) => {
		try {
			await res.locals.access.can("nyxguard:update");
			const knex = db();
			const id = Number.parseInt(String(req.params.id), 10);
			if (!Number.isFinite(id) || id <= 0) {
				next(new errs.ItemNotFoundError());
				return;
			}
			const rule = await internalWafRules.update(knex, id, req.body);
			await internalNyxGuard.nginx.apply(knex);
			res.json(rule);
		} catch (err) {
			next(err);
		}
	})
	.delete(async (req, res, next) => {
		try {
			await res.locals.access.can("nyxguard:update");
			const knex = db();
			const id = Number.parseInt(String(req.params.id), 10);
			if (!Number.isFinite(id) || id <= 0) {
				next(new errs.ItemNotFoundError());
				return;
			}
			await internalWafRules.remove(knex, id);
			await internalNyxGuard.nginx.apply(knex);
			res.json({ ok: true });
		} catch (err) {
			next(err);
		}
	});

export default router;
