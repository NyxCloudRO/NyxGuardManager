import fs from "node:fs/promises";
import path from "node:path";
import express from "express";
import db from "../../db.js";
import internalNyxGuard from "../../internal/nyxguard.js";
import errs from "../../lib/error.js";
import jwtdecode from "../../lib/express/jwt-decode.js";
import validator from "../../lib/validator/index.js";
import { debug, express as logger } from "../../logger.js";

const router = express.Router({
	caseSensitive: true,
	strict: true,
	mergeParams: true,
});

const GEOIP_DIR = "/data/geoip";
const GEOIP_COUNTRY_DB = path.join(GEOIP_DIR, "GeoLite2-Country.mmdb");
const GEOIP_IP2LOCATION_DB = path.join(GEOIP_DIR, "IP2Location-Country.mmdb");

async function requireNyxGuardView(_req, res, next) {
	try {
		await res.locals.access.can("nyxguard:list");
		next();
	} catch (err) {
		next(err);
	}
}

/**
 * /api/nyxguard/rules/ip
 */
router
	.route("/rules/ip")
	.options((_, res) => res.sendStatus(204))
	.all(jwtdecode())
	.all(requireNyxGuardView)
	.get(async (_req, res, next) => {
		try {
			const items = await internalNyxGuard.ipRules.list(db());
			res.status(200).send({ items });
		} catch (err) {
			debug(logger, `GET /api/nyxguard/rules/ip: ${err}`);
			next(err);
		}
	})
	.delete(async (_req, res, next) => {
		try {
			await res.locals.access.can("nyxguard:update");
			const deleted = await db()("nyxguard_ip_rule").delete();
			await internalNyxGuard.nginx.apply(db());
			res.status(200).send({ deleted });
		} catch (err) {
			debug(logger, `DELETE /api/nyxguard/rules/ip: ${err}`);
			next(err);
		}
	})
	.post(async (req, res, next) => {
		try {
			await res.locals.access.can("nyxguard:update");

			const body = req.body ?? {};
			const data = await validator(
				{
					required: ["action", "ipCidr"],
					additionalProperties: false,
					properties: {
						enabled: { type: "boolean" },
						action: { type: "string", enum: ["allow", "deny"] },
						ipCidr: { type: "string", minLength: 1, maxLength: 64 },
						note: { type: ["string", "null"], maxLength: 255 },
						expiresInDays: { type: ["number", "null"], enum: [1, 7, 30, 60, 90, 180, null] },
						expiresOn: { type: ["string", "null"], minLength: 1, maxLength: 64 },
					},
				},
				{
					enabled: body.enabled,
					action: body.action,
					ipCidr: body.ipCidr ?? body.ip_cidr,
					note: body.note,
					expiresInDays: typeof body.expiresInDays === "number" ? body.expiresInDays : body.expires_in_days,
					expiresOn: typeof body.expiresOn !== "undefined" ? body.expiresOn : body.expires_on,
				},
			);
			const id = await internalNyxGuard.ipRules.create(db(), data);
			await internalNyxGuard.nginx.apply(db());
			const item = await internalNyxGuard.ipRules.get(db(), id);
			res.status(201).send({ item });
		} catch (err) {
			debug(logger, `POST /api/nyxguard/rules/ip: ${err}`);
			next(err);
		}
	});

router
	.route("/rules/ip/:rule_id")
	.options((_, res) => res.sendStatus(204))
	.all(jwtdecode())
	.all(requireNyxGuardView)
	.put(async (req, res, next) => {
		try {
			await res.locals.access.can("nyxguard:update");

			const body = req.body ?? {};
			const data = await validator(
				{
					required: ["rule_id"],
					additionalProperties: false,
					properties: {
						rule_id: { $ref: "common#/properties/id" },
						enabled: { type: "boolean" },
						action: { type: "string", enum: ["allow", "deny"] },
						ipCidr: { type: "string", minLength: 1, maxLength: 64 },
						note: { type: ["string", "null"], maxLength: 255 },
						expiresInDays: { type: ["number", "null"], enum: [1, 7, 30, 60, 90, 180, null] },
						expiresOn: { type: ["string", "null"], minLength: 1, maxLength: 64 },
					},
				},
				{
					rule_id: req.params.rule_id,
					enabled: body.enabled,
					action: body.action,
					ipCidr: body.ipCidr ?? body.ip_cidr,
					note: typeof body.note === "undefined" ? undefined : body.note,
					expiresInDays:
						typeof body.expiresInDays === "number"
							? body.expiresInDays
							: typeof body.expires_in_days === "number"
								? body.expires_in_days
								: typeof body.expiresInDays === "undefined" &&
										typeof body.expires_in_days === "undefined"
									? undefined
									: null,
					expiresOn:
						typeof body.expiresOn === "undefined"
							? typeof body.expires_on === "undefined"
								? undefined
								: body.expires_on
							: body.expiresOn,
				},
			);
			await internalNyxGuard.ipRules.update(db(), Number.parseInt(data.rule_id, 10), data);
			await internalNyxGuard.nginx.apply(db());
			res.sendStatus(204);
		} catch (err) {
			debug(logger, `PUT /api/nyxguard/rules/ip/:rule_id: ${err}`);
			next(err);
		}
	})
	.delete(async (req, res, next) => {
		try {
			await res.locals.access.can("nyxguard:update");

			const data = await validator(
				{
					required: ["rule_id"],
					additionalProperties: false,
					properties: {
						rule_id: { $ref: "common#/properties/id" },
					},
				},
				{ rule_id: req.params.rule_id },
			);
			await internalNyxGuard.ipRules.remove(db(), Number.parseInt(data.rule_id, 10));
			await internalNyxGuard.nginx.apply(db());
			res.sendStatus(204);
		} catch (err) {
			debug(logger, `DELETE /api/nyxguard/rules/ip/:rule_id: ${err}`);
			next(err);
		}
	});

/**
 * /api/nyxguard/rules/country
 */
router
	.route("/rules/country")
	.options((_, res) => res.sendStatus(204))
	.all(jwtdecode())
	.all(requireNyxGuardView)
	.get(async (_req, res, next) => {
		try {
			const items = await internalNyxGuard.countryRules.list(db());
			res.status(200).send({ items });
		} catch (err) {
			debug(logger, `GET /api/nyxguard/rules/country: ${err}`);
			next(err);
		}
	})
	.delete(async (_req, res, next) => {
		try {
			await res.locals.access.can("nyxguard:update");
			const deleted = await db()("nyxguard_country_rule").delete();
			await internalNyxGuard.nginx.apply(db());
			res.status(200).send({ deleted });
		} catch (err) {
			debug(logger, `DELETE /api/nyxguard/rules/country: ${err}`);
			next(err);
		}
	})
	.post(async (req, res, next) => {
		try {
			await res.locals.access.can("nyxguard:update");

			const body = req.body ?? {};
			const data = await validator(
				{
					required: ["action", "countryCode"],
					additionalProperties: false,
					properties: {
						enabled: { type: "boolean" },
						action: { type: "string", enum: ["allow", "deny"] },
						countryCode: { type: "string", minLength: 2, maxLength: 2 },
						note: { type: ["string", "null"], maxLength: 255 },
						expiresInDays: { type: ["number", "null"], enum: [1, 7, 30, 60, 90, 180, null] },
						expiresOn: { type: ["string", "null"], minLength: 1, maxLength: 64 },
					},
				},
				{
					enabled: body.enabled,
					action: body.action,
					countryCode: body.countryCode ?? body.country_code,
					note: body.note,
					expiresInDays: typeof body.expiresInDays === "number" ? body.expiresInDays : body.expires_in_days,
					expiresOn: typeof body.expiresOn !== "undefined" ? body.expiresOn : body.expires_on,
				},
			);
			const id = await internalNyxGuard.countryRules.create(db(), data);
			await internalNyxGuard.nginx.apply(db());
			const item = await internalNyxGuard.countryRules.get(db(), id);
			res.status(201).send({ item });
		} catch (err) {
			debug(logger, `POST /api/nyxguard/rules/country: ${err}`);
			next(err);
		}
	});

router
	.route("/rules/country/:rule_id")
	.options((_, res) => res.sendStatus(204))
	.all(jwtdecode())
	.all(requireNyxGuardView)
	.put(async (req, res, next) => {
		try {
			await res.locals.access.can("nyxguard:update");

			const body = req.body ?? {};
			const data = await validator(
				{
					required: ["rule_id"],
					additionalProperties: false,
					properties: {
						rule_id: { $ref: "common#/properties/id" },
						enabled: { type: "boolean" },
						action: { type: "string", enum: ["allow", "deny"] },
						countryCode: { type: "string", minLength: 2, maxLength: 2 },
						note: { type: ["string", "null"], maxLength: 255 },
						expiresInDays: { type: ["number", "null"], enum: [1, 7, 30, 60, 90, 180, null] },
						expiresOn: { type: ["string", "null"], minLength: 1, maxLength: 64 },
					},
				},
				{
					rule_id: req.params.rule_id,
					enabled: body.enabled,
					action: body.action,
					countryCode: body.countryCode ?? body.country_code,
					note: typeof body.note === "undefined" ? undefined : body.note,
					expiresInDays:
						typeof body.expiresInDays === "number"
							? body.expiresInDays
							: typeof body.expires_in_days === "number"
								? body.expires_in_days
								: typeof body.expiresInDays === "undefined" &&
										typeof body.expires_in_days === "undefined"
									? undefined
									: null,
					expiresOn:
						typeof body.expiresOn === "undefined"
							? typeof body.expires_on === "undefined"
								? undefined
								: body.expires_on
							: body.expiresOn,
				},
			);
			await internalNyxGuard.countryRules.update(db(), Number.parseInt(data.rule_id, 10), data);
			await internalNyxGuard.nginx.apply(db());
			res.sendStatus(204);
		} catch (err) {
			debug(logger, `PUT /api/nyxguard/rules/country/:rule_id: ${err}`);
			next(err);
		}
	})
	.delete(async (req, res, next) => {
		try {
			await res.locals.access.can("nyxguard:update");

			const data = await validator(
				{
					required: ["rule_id"],
					additionalProperties: false,
					properties: {
						rule_id: { $ref: "common#/properties/id" },
					},
				},
				{ rule_id: req.params.rule_id },
			);
			await internalNyxGuard.countryRules.remove(db(), Number.parseInt(data.rule_id, 10));
			await internalNyxGuard.nginx.apply(db());
			res.sendStatus(204);
		} catch (err) {
			debug(logger, `DELETE /api/nyxguard/rules/country/:rule_id: ${err}`);
			next(err);
		}
	});

/**
 * GeoIP (upload local GeoLite2 Country DB)
 *
 * GET /api/nyxguard/geoip
 * POST /api/nyxguard/geoip
 */
router
	.route("/geoip")
	.options((_, res) => res.sendStatus(204))
	.all(jwtdecode())
	.all(requireNyxGuardView)
	.get(async (_req, res, next) => {
		try {
			let st = null;
			try {
				st = await fs.stat(GEOIP_COUNTRY_DB);
			} catch {
				st = null;
			}
			let ip2St = null;
			try {
				ip2St = await fs.stat(GEOIP_IP2LOCATION_DB);
			} catch {
				ip2St = null;
			}
			let confSt = null;
			try {
				confSt = await fs.stat(path.join(GEOIP_DIR, "GeoIP.conf"));
			} catch {
				confSt = null;
			}
			res.status(200).send({
				// Backwards-compatible fields (represent MaxMind GeoLite2 Country).
				installed: !!st,
				path: GEOIP_COUNTRY_DB,
				size: st?.size ?? null,
				modifiedOn: st ? new Date(st.mtimeMs).toISOString() : null,

				// New: multi-provider status.
				providers: {
					maxmind: {
						installed: !!st,
						path: GEOIP_COUNTRY_DB,
						size: st?.size ?? null,
						modifiedOn: st ? new Date(st.mtimeMs).toISOString() : null,
					},
					ip2location: {
						installed: !!ip2St,
						path: GEOIP_IP2LOCATION_DB,
						size: ip2St?.size ?? null,
						modifiedOn: ip2St ? new Date(ip2St.mtimeMs).toISOString() : null,
					},
				},
				updateConfigured: !!confSt,
			});
		} catch (err) {
			debug(logger, `GET /api/nyxguard/geoip: ${err}`);
			next(err);
		}
	})
	.post(async (req, res, next) => {
		try {
			await res.locals.access.can("nyxguard:update");

			if (!res.locals.access?.token?.getUserId?.()) {
				throw new errs.PermissionError("Login required");
			}
			if (!req.files) {
				res.status(400).send({ error: "No files were uploaded" });
				return;
			}

			const file = req.files.mmdb ?? req.files.file ?? Object.values(req.files)[0];
			if (!file) {
				res.status(400).send({ error: "Missing mmdb file (field name: mmdb)" });
				return;
			}

			// express-fileupload can return arrays; handle both.
			const f = Array.isArray(file) ? file[0] : file;
			const name = String(f.name ?? "");
			if (!name.toLowerCase().endsWith(".mmdb")) {
				res.status(400).send({ error: "File must be a .mmdb database" });
				return;
			}

			const providerRaw = String(req.query.provider ?? req.query.source ?? "maxmind").toLowerCase();
			const provider = providerRaw === "ip2location" || providerRaw === "ip2" ? "ip2location" : "maxmind";

			if (provider === "maxmind") {
				// Keep it simple: we only support the GeoLite2 Country DB here.
				// (ASN/City DBs have different structures and won't populate $geoip2_country_code.)
				if (!name.toLowerCase().includes("country")) {
					res.status(400).send({ error: "Please upload the GeoLite2-Country.mmdb database (not ASN/City)." });
					return;
				}
			}

			await fs.mkdir(GEOIP_DIR, { recursive: true });
			const tmp = path.join(GEOIP_DIR, `.upload.${process.pid}.tmp`);
			await fs.writeFile(tmp, f.data);
			await fs.rename(tmp, provider === "ip2location" ? GEOIP_IP2LOCATION_DB : GEOIP_COUNTRY_DB);

			await internalNyxGuard.nginx.apply(db());
			res.status(200).send({ ok: true });
		} catch (err) {
			debug(logger, `POST /api/nyxguard/geoip: ${err}`);
			next(err);
		}
	});

/**
 * GeoIP auto-update config
 *
 * POST /api/nyxguard/geoip/config
 * DELETE /api/nyxguard/geoip/config
 */
router
	.route("/geoip/config")
	.options((_, res) => res.sendStatus(204))
	.all(jwtdecode())
	.all(requireNyxGuardView)
	.post(async (req, res, next) => {
		try {
			await res.locals.access.can("nyxguard:update");

			if (!res.locals.access?.token?.getUserId?.()) {
				throw new errs.PermissionError("Login required");
			}

			const body = req.body ?? {};
			const data = await validator(
				{
					required: ["accountId", "licenseKey"],
					additionalProperties: false,
					properties: {
						accountId: { type: "string", minLength: 1, maxLength: 32 },
						licenseKey: { type: "string", minLength: 1, maxLength: 128 },
					},
				},
				{
					accountId: String(body.accountId ?? body.account_id ?? ""),
					licenseKey: String(body.licenseKey ?? body.license_key ?? ""),
				},
			);

			await fs.mkdir(GEOIP_DIR, { recursive: true });
			const confPath = path.join(GEOIP_DIR, "GeoIP.conf");
			const conf =
				"# GeoIP.conf for NyxGuard Manager (MaxMind GeoLite2)\n" +
				`AccountID ${data.accountId}\n` +
				`LicenseKey ${data.licenseKey}\n` +
				"EditionIDs GeoLite2-Country\n";
			await fs.writeFile(confPath, conf, { encoding: "utf8", mode: 0o600 });

			res.status(200).send({ ok: true });
		} catch (err) {
			debug(logger, `POST /api/nyxguard/geoip/config: ${err}`);
			next(err);
		}
	})
	.delete(async (_req, res, next) => {
		try {
			await res.locals.access.can("nyxguard:update");

			if (!res.locals.access?.token?.getUserId?.()) {
				throw new errs.PermissionError("Login required");
			}
			const confPath = path.join(GEOIP_DIR, "GeoIP.conf");
			try {
				await fs.unlink(confPath);
			} catch {
				// ignore
			}
			res.sendStatus(204);
		} catch (err) {
			debug(logger, `DELETE /api/nyxguard/geoip/config: ${err}`);
			next(err);
		}
	});

export default router;
