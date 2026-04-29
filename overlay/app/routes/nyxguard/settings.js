import express from "express";
import db from "../../db.js";
import internalNginx from "../../internal/nginx.js";
import internalNyxGuard from "../../internal/nyxguard.js";
import internalProxyHost from "../../internal/proxy-host.js";
import errs from "../../lib/error.js";
import jwtdecode from "../../lib/express/jwt-decode.js";
import validator from "../../lib/validator/index.js";
import { debug, express as logger } from "../../logger.js";

const router = express.Router({
	caseSensitive: true,
	strict: true,
	mergeParams: true,
});

const ENFORCE_NYXGUARD_PROTECTION = process.env.NYXGUARD_ENFORCE_PROTECTION === "1";

async function requireNyxGuardView(_req, res, next) {
	try {
		await res.locals.access.can("nyxguard:list");
		next();
	} catch (err) {
		next(err);
	}
}

async function regenerateProxyHostConfig(access, hostId) {
	// NyxGuard per-app toggles modify proxy_host.advanced_config which must be rendered into /data/nginx/proxy_host/<id>.conf.
	// internalNyxGuard.nginx.apply() only reloads nginx and writes NyxGuard include files; it does not regenerate host configs.
	try {
		const row = await internalProxyHost.get(access, {
			id: Number.parseInt(String(hostId), 10),
			expand: ["certificate", "owner", "access_list.[clients,items]"],
		});
		await internalNginx.generateConfig("proxy_host", row);
	} catch (err) {
		debug(logger, `nyxguard: failed regenerating proxy host config for ${hostId}: ${err}`);
	}
}

/**
 * /api/nyxguard/settings
 */
router
	.route("/settings")
	.options((_, res) => res.sendStatus(204))
	.all(jwtdecode())
	.all(requireNyxGuardView)
	.get(async (_req, res, next) => {
		try {
			const settings = await internalNyxGuard.settings.get(db());
			res.status(200).send(settings);
		} catch (err) {
			debug(logger, `GET /api/nyxguard/settings: ${err}`);
			next(err);
		}
	})
	.put(async (req, res, next) => {
		try {
			// Mutating global NyxGuard settings requires manage permission.
			await res.locals.access.can("nyxguard:update");

			const body = req.body ?? {};
			const data = await validator(
				{
					additionalProperties: false,
					properties: {
						botDefenseEnabled: { type: "boolean" },
						ddosEnabled: { type: "boolean" },
						sqliEnabled: { type: "boolean" },
						logRetentionDays: { type: "integer", enum: [30, 60, 90, 180] },
						ddosRateRps: { type: "integer", minimum: 1, maximum: 10000 },
						ddosBurst: { type: "integer", minimum: 0, maximum: 100000 },
						ddosConnLimit: { type: "integer", minimum: 1, maximum: 100000 },
						botUaTokens: { type: "string" },
						botPathTokens: { type: "string" },
						sqliThreshold: { type: "integer", minimum: 1, maximum: 1000 },
						sqliMaxBody: { type: "integer", minimum: 0, maximum: 1048576 },
						sqliProbeMinScore: { type: "integer", minimum: 0, maximum: 1000 },
						sqliProbeBanScore: { type: "integer", minimum: 1, maximum: 100000 },
						sqliProbeWindowSec: { type: "integer", minimum: 1, maximum: 600 },
						authfailThreshold: { type: "integer", minimum: 1, maximum: 1000 },
						authfailWindowSec: { type: "integer", minimum: 5, maximum: 3600 },
						authfailBanHours: { type: "integer", minimum: 1, maximum: 8760 },
						authBypassEnabled: { type: "boolean" },
					},
				},
				{
					botDefenseEnabled: body.botDefenseEnabled ?? body.bot_defense_enabled,
					ddosEnabled: body.ddosEnabled ?? body.ddos_enabled,
					sqliEnabled: body.sqliEnabled ?? body.sqli_enabled,
					logRetentionDays: body.logRetentionDays ?? body.log_retention_days,
					ddosRateRps: body.ddosRateRps ?? body.ddos_rate_rps,
					ddosBurst: body.ddosBurst ?? body.ddos_burst,
					ddosConnLimit: body.ddosConnLimit ?? body.ddos_conn_limit,
					botUaTokens: body.botUaTokens ?? body.bot_ua_tokens,
					botPathTokens: body.botPathTokens ?? body.bot_path_tokens,
					sqliThreshold: body.sqliThreshold ?? body.sqli_threshold,
					sqliMaxBody: body.sqliMaxBody ?? body.sqli_max_body,
					sqliProbeMinScore: body.sqliProbeMinScore ?? body.sqli_probe_min_score,
					sqliProbeBanScore: body.sqliProbeBanScore ?? body.sqli_probe_ban_score,
					sqliProbeWindowSec: body.sqliProbeWindowSec ?? body.sqli_probe_window_sec,
					authfailThreshold: body.authfailThreshold ?? body.authfail_threshold,
					authfailWindowSec: body.authfailWindowSec ?? body.authfail_window_sec,
					authfailBanHours: body.authfailBanHours ?? body.authfail_ban_hours,
					authBypassEnabled: body.authBypassEnabled ?? body.auth_bypass_enabled,
				},
			);

			const nextSettings = await internalNyxGuard.settings.update(db(), data);

			// When a global protection is enabled, make it take effect on all currently protected apps
			// (apps with WAF enabled). This keeps GlobalGate consistent with the app list UX.
			//
			// Important: we do NOT disable per-app blocks when a global protection is turned off,
			// so per-app configuration is preserved when toggling globals back on.
			const enableBotForAllProtected = data.botDefenseEnabled === true;
			const enableDdosForAllProtected = data.ddosEnabled === true;
			const enableSqliForAllProtected = data.sqliEnabled === true;
			const authBypassGlobalChanged = typeof data.authBypassEnabled === "boolean";

			// When the global auth bypass toggle changes, sync all protected apps' per-app setting
			// to match. This keeps GlobalGate as a true master switch:
			//   ON  → all apps get auth_bypass_enabled=1 (can be individually disabled afterward)
			//   OFF → all apps get auth_bypass_enabled=0 (can be individually re-enabled afterward)
			if (authBypassGlobalChanged) {
				const newVal = data.authBypassEnabled ? 1 : 0;
				try {
					const bypassRows = await db()("nyxguard_app")
						.where({ waf_enabled: 1 })
						.select("proxy_host_id");
					if (bypassRows.length > 0) {
						const hostIds = bypassRows.map((r) => r.proxy_host_id);
						await db()("nyxguard_app").whereIn("proxy_host_id", hostIds).update({
							auth_bypass_enabled: newVal,
							modified_on: db().fn.now(),
						});
						// Sync meta on each proxy host so the modal reflects the change.
						for (const { proxy_host_id } of bypassRows) {
							try {
								const ph = await db()("proxy_host").where({ id: proxy_host_id, is_deleted: 0 }).first();
								if (ph) {
									const meta = (() => { try { return typeof ph.meta === "string" ? JSON.parse(ph.meta) : (ph.meta ?? {}); } catch { return {}; } })();
									await db()("proxy_host").where({ id: proxy_host_id }).update({
										meta: JSON.stringify({ ...meta, nyxguardAuthBypassEnabled: !!newVal }),
										modified_on: db().fn.now(),
									});
								}
							} catch {
								// ignore per-host meta sync errors
							}
						}
					}
				} catch {
					// ignore; non-fatal
				}
			}

			if (enableBotForAllProtected || enableDdosForAllProtected || enableSqliForAllProtected) {
				const rows = await internalProxyHost.getAll(res.locals.access, null, null);
				for (const r of rows) {
					const currentWaf = internalNyxGuard.waf.isEnabledInAdvancedConfig(r.advanced_config);
					if (!currentWaf) continue;

					let nextAdvanced = r.advanced_config ?? "";
					let changed = false;

					if (
						enableBotForAllProtected &&
						!internalNyxGuard.botDefense.isEnabledInAdvancedConfig(nextAdvanced)
					) {
						nextAdvanced = internalNyxGuard.botDefense.applyAdvancedConfig(nextAdvanced, true);
						changed = true;
					}
					if (enableDdosForAllProtected && !internalNyxGuard.ddos.isEnabledInAdvancedConfig(nextAdvanced)) {
						nextAdvanced = internalNyxGuard.ddos.applyAdvancedConfig(nextAdvanced, true);
						changed = true;
					}
					if (enableSqliForAllProtected && !internalNyxGuard.sqli.isEnabledInAdvancedConfig(nextAdvanced)) {
						nextAdvanced = internalNyxGuard.sqli.applyAdvancedConfig(nextAdvanced, true);
						changed = true;
					}

					if (!changed) continue;

					await internalProxyHost.update(res.locals.access, {
						id: r.id,
						advanced_config: nextAdvanced,
						meta: {
							...(r.meta ?? {}),
							nyxguardWafEnabled: true,
							nyxguardBotDefenseEnabled:
								internalNyxGuard.botDefense.isEnabledInAdvancedConfig(nextAdvanced),
							nyxguardDdosEnabled: internalNyxGuard.ddos.isEnabledInAdvancedConfig(nextAdvanced),
							nyxguardSqliEnabled: internalNyxGuard.sqli.isEnabledInAdvancedConfig(nextAdvanced),
						},
					});
					await regenerateProxyHostConfig(res.locals.access, r.id);
				}
			}

			await internalNyxGuard.nginx.apply(db());
			res.status(200).send(nextSettings);
		} catch (err) {
			debug(logger, `PUT /api/nyxguard/settings: ${err}`);
			next(err);
		}
	});

/**
 * Bulk toggle WAF on all apps visible to the caller.
 *
 * PUT /api/nyxguard/apps/waf { enabled: boolean }
 */
router
	.route("/apps/waf")
	.options((_, res) => res.sendStatus(204))
	.all(jwtdecode())
	.all(requireNyxGuardView)
	.put(async (req, res, next) => {
		try {
			await res.locals.access.can("nyxguard:update");

			const body = req.body ?? {};
			const data = await validator(
				{
					required: ["enabled"],
					additionalProperties: false,
					properties: {
						enabled: { type: "boolean" },
					},
				},
				{
					enabled: body.enabled,
				},
			);
			const enabled = ENFORCE_NYXGUARD_PROTECTION ? true : data.enabled;

			await internalNyxGuard.nginx.ensureFiles();

			const rows = await internalProxyHost.getAll(res.locals.access, null, null);

			let updated = 0;
			for (const r of rows) {
				const currentWaf = internalNyxGuard.waf.isEnabledInAdvancedConfig(r.advanced_config);
				if (currentWaf === enabled) continue;

				// When WAF is disabled, also force-disable Bot/DDoS/SQLi at the app level.
				let nextAdvanced = internalNyxGuard.waf.applyAdvancedConfig(r.advanced_config, enabled);
				if (!enabled) {
					nextAdvanced = internalNyxGuard.botDefense.applyAdvancedConfig(nextAdvanced, false);
					nextAdvanced = internalNyxGuard.ddos.applyAdvancedConfig(nextAdvanced, false);
					nextAdvanced = internalNyxGuard.sqli.applyAdvancedConfig(nextAdvanced, false);
				}

				await internalProxyHost.update(res.locals.access, {
					id: r.id,
					advanced_config: nextAdvanced,
					meta: {
						...(r.meta ?? {}),
						nyxguardWafEnabled: !!enabled,
						nyxguardBotDefenseEnabled: enabled
							? internalNyxGuard.botDefense.isEnabledInAdvancedConfig(nextAdvanced)
							: false,
						nyxguardDdosEnabled: enabled
							? internalNyxGuard.ddos.isEnabledInAdvancedConfig(nextAdvanced)
							: false,
						nyxguardSqliEnabled: enabled
							? internalNyxGuard.sqli.isEnabledInAdvancedConfig(nextAdvanced)
							: false,
					},
				});
				await regenerateProxyHostConfig(res.locals.access, r.id);

				// Best-effort persistence. Advanced config is still the source of truth for nginx.
				try {
					await db()("nyxguard_app")
						.insert({
							proxy_host_id: r.id,
							waf_enabled: enabled ? 1 : 0,
							created_on: db().fn.now(),
							modified_on: db().fn.now(),
						})
						.onConflict("proxy_host_id")
						.merge({
							waf_enabled: enabled ? 1 : 0,
							modified_on: db().fn.now(),
						});
				} catch {
					// ignore
				}

				updated += 1;
			}

			await internalNyxGuard.nginx.apply(db());
			res.status(200).send({ updated, enforced: ENFORCE_NYXGUARD_PROTECTION, enabled });
		} catch (err) {
			debug(logger, `PUT /api/nyxguard/apps/waf: ${err}`);
			next(err);
		}
	});

/**
 * Bulk toggle Bot Defense on all *protected* apps visible to the caller.
 * (Apps must have WAF enabled to apply.)
 *
 * PUT /api/nyxguard/apps/bot { enabled: boolean }
 */
router
	.route("/apps/bot")
	.options((_, res) => res.sendStatus(204))
	.all(jwtdecode())
	.all(requireNyxGuardView)
	.put(async (req, res, next) => {
		try {
			await res.locals.access.can("nyxguard:update");

			const body = req.body ?? {};
			const data = await validator(
				{
					required: ["enabled"],
					additionalProperties: false,
					properties: {
						enabled: { type: "boolean" },
					},
				},
				{
					enabled: body.enabled,
				},
			);
			const enabled = ENFORCE_NYXGUARD_PROTECTION ? true : data.enabled;

			await internalNyxGuard.nginx.ensureFiles();

			// Global toggle controls content of the include file; per-app include enables it per app.
			await internalNyxGuard.settings.update(db(), { botDefenseEnabled: enabled });

			const rows = await internalProxyHost.getAll(res.locals.access, null, null);

			let updated = 0;
			let skipped = 0;

			for (const r of rows) {
				const currentWaf = internalNyxGuard.waf.isEnabledInAdvancedConfig(r.advanced_config);
				const currentBot = internalNyxGuard.botDefense.isEnabledInAdvancedConfig(r.advanced_config);

				if (enabled && !currentWaf) {
					skipped += 1;
					continue;
				}

				const targetBot = enabled ? !!currentWaf : false;
				if (currentBot === targetBot) continue;

				let nextAdvanced = internalNyxGuard.botDefense.applyAdvancedConfig(r.advanced_config, targetBot);
				// Never keep Bot Defense enabled without WAF.
				if (!currentWaf) {
					nextAdvanced = internalNyxGuard.botDefense.applyAdvancedConfig(nextAdvanced, false);
				}

				await internalProxyHost.update(res.locals.access, {
					id: r.id,
					advanced_config: nextAdvanced,
					meta: {
						...(r.meta ?? {}),
						nyxguardWafEnabled: !!currentWaf,
						nyxguardBotDefenseEnabled: internalNyxGuard.botDefense.isEnabledInAdvancedConfig(nextAdvanced),
						nyxguardDdosEnabled: internalNyxGuard.ddos.isEnabledInAdvancedConfig(nextAdvanced),
						nyxguardSqliEnabled: internalNyxGuard.sqli.isEnabledInAdvancedConfig(nextAdvanced),
					},
				});
				await regenerateProxyHostConfig(res.locals.access, r.id);

				updated += 1;
			}

			await internalNyxGuard.nginx.apply(db());
			res.status(200).send({ updated, skipped, enforced: ENFORCE_NYXGUARD_PROTECTION, enabled });
		} catch (err) {
			debug(logger, `PUT /api/nyxguard/apps/bot: ${err}`);
			next(err);
		}
	});

/**
 * Bulk toggle DDoS Shield on all *protected* apps visible to the caller.
 * (Apps must have WAF enabled to apply.)
 *
 * PUT /api/nyxguard/apps/ddos { enabled: boolean }
 */
router
	.route("/apps/ddos")
	.options((_, res) => res.sendStatus(204))
	.all(jwtdecode())
	.all(requireNyxGuardView)
	.put(async (req, res, next) => {
		try {
			await res.locals.access.can("nyxguard:update");

			const body = req.body ?? {};
			const data = await validator(
				{
					required: ["enabled"],
					additionalProperties: false,
					properties: {
						enabled: { type: "boolean" },
					},
				},
				{
					enabled: body.enabled,
				},
			);
			const enabled = ENFORCE_NYXGUARD_PROTECTION ? true : data.enabled;

			await internalNyxGuard.nginx.ensureFiles();

			await internalNyxGuard.settings.update(db(), { ddosEnabled: enabled });

			const rows = await internalProxyHost.getAll(res.locals.access, null, null);

			let updated = 0;
			let skipped = 0;

			for (const r of rows) {
				const currentWaf = internalNyxGuard.waf.isEnabledInAdvancedConfig(r.advanced_config);
				const currentDdos = internalNyxGuard.ddos.isEnabledInAdvancedConfig(r.advanced_config);

				if (enabled && !currentWaf) {
					skipped += 1;
					continue;
				}

				const targetDdos = enabled ? !!currentWaf : false;
				if (currentDdos === targetDdos) continue;

				let nextAdvanced = internalNyxGuard.ddos.applyAdvancedConfig(r.advanced_config, targetDdos);
				// Never keep DDoS Shield enabled without WAF.
				if (!currentWaf) {
					nextAdvanced = internalNyxGuard.ddos.applyAdvancedConfig(nextAdvanced, false);
				}

				await internalProxyHost.update(res.locals.access, {
					id: r.id,
					advanced_config: nextAdvanced,
					meta: {
						...(r.meta ?? {}),
						nyxguardWafEnabled: !!currentWaf,
						nyxguardBotDefenseEnabled: internalNyxGuard.botDefense.isEnabledInAdvancedConfig(nextAdvanced),
						nyxguardDdosEnabled: internalNyxGuard.ddos.isEnabledInAdvancedConfig(nextAdvanced),
						nyxguardSqliEnabled: internalNyxGuard.sqli.isEnabledInAdvancedConfig(nextAdvanced),
					},
				});
				await regenerateProxyHostConfig(res.locals.access, r.id);

				updated += 1;
			}

			await internalNyxGuard.nginx.apply(db());
			res.status(200).send({ updated, skipped, enforced: ENFORCE_NYXGUARD_PROTECTION, enabled });
		} catch (err) {
			debug(logger, `PUT /api/nyxguard/apps/ddos: ${err}`);
			next(err);
		}
	});

/**
 * Bulk toggle SQL Injection Shield on all *protected* apps visible to the caller.
 * (Apps must have WAF enabled to apply.)
 *
 * PUT /api/nyxguard/apps/sqli { enabled: boolean }
 */
router
	.route("/apps/sqli")
	.options((_, res) => res.sendStatus(204))
	.all(jwtdecode())
	.all(requireNyxGuardView)
	.put(async (req, res, next) => {
		try {
			await res.locals.access.can("nyxguard:update");

			const body = req.body ?? {};
			const data = await validator(
				{
					required: ["enabled"],
					additionalProperties: false,
					properties: {
						enabled: { type: "boolean" },
					},
				},
				{
					enabled: body.enabled,
				},
			);
			const enabled = ENFORCE_NYXGUARD_PROTECTION ? true : data.enabled;

			await internalNyxGuard.nginx.ensureFiles();

			await internalNyxGuard.settings.update(db(), { sqliEnabled: enabled });

			const rows = await internalProxyHost.getAll(res.locals.access, null, null);

			let updated = 0;
			let skipped = 0;

			for (const r of rows) {
				const currentWaf = internalNyxGuard.waf.isEnabledInAdvancedConfig(r.advanced_config);
				const currentSqli = internalNyxGuard.sqli.isEnabledInAdvancedConfig(r.advanced_config);

				if (enabled && !currentWaf) {
					skipped += 1;
					continue;
				}

				const targetSqli = enabled ? !!currentWaf : false;
				if (currentSqli === targetSqli) continue;

				let nextAdvanced = internalNyxGuard.sqli.applyAdvancedConfig(r.advanced_config, targetSqli);
				// Never keep SQL Injection Shield enabled without WAF.
				if (!currentWaf) {
					nextAdvanced = internalNyxGuard.sqli.applyAdvancedConfig(nextAdvanced, false);
				}

				await internalProxyHost.update(res.locals.access, {
					id: r.id,
					advanced_config: nextAdvanced,
					meta: {
						...(r.meta ?? {}),
						nyxguardWafEnabled: !!currentWaf,
						nyxguardBotDefenseEnabled: internalNyxGuard.botDefense.isEnabledInAdvancedConfig(nextAdvanced),
						nyxguardDdosEnabled: internalNyxGuard.ddos.isEnabledInAdvancedConfig(nextAdvanced),
						nyxguardSqliEnabled: internalNyxGuard.sqli.isEnabledInAdvancedConfig(nextAdvanced),
					},
				});
				await regenerateProxyHostConfig(res.locals.access, r.id);

				updated += 1;
			}

			await internalNyxGuard.nginx.apply(db());
			res.status(200).send({ updated, skipped, enforced: ENFORCE_NYXGUARD_PROTECTION, enabled });
		} catch (err) {
			debug(logger, `PUT /api/nyxguard/apps/sqli: ${err}`);
			next(err);
		}
	});

router
	.route("/apps/:host_id")
	.options((_, res) => res.sendStatus(204))
	.all(jwtdecode())
	.all(requireNyxGuardView)
	.put(async (req, res, next) => {
		try {
			const body = req.body ?? {};
			const data = await validator(
				{
					required: ["host_id"],
					additionalProperties: false,
					properties: {
						host_id: { $ref: "common#/properties/id" },
						wafEnabled: { type: "boolean" },
						botDefenseEnabled: { type: "boolean" },
						ddosEnabled: { type: "boolean" },
						sqliEnabled: { type: "boolean" },
						authBypassEnabled: { type: "boolean" },
					},
				},
				{
					host_id: req.params.host_id,
					wafEnabled: body.wafEnabled ?? body.waf_enabled,
					botDefenseEnabled: body.botDefenseEnabled ?? body.bot_defense_enabled,
					ddosEnabled: body.ddosEnabled ?? body.ddos_enabled,
					sqliEnabled: body.sqliEnabled ?? body.sqli_enabled,
					authBypassEnabled: body.authBypassEnabled ?? body.auth_bypass_enabled,
				},
			);

			if (typeof data.wafEnabled !== "boolean") throw new errs.ValidationError("wafEnabled must be a boolean");

			await internalNyxGuard.nginx.ensureFiles();

			const row = await internalProxyHost.get(res.locals.access, { id: Number.parseInt(data.host_id, 10) });
			const currentWaf = internalNyxGuard.waf.isEnabledInAdvancedConfig(row.advanced_config);
			const currentBot = internalNyxGuard.botDefense.isEnabledInAdvancedConfig(row.advanced_config);
			const currentDdos = internalNyxGuard.ddos.isEnabledInAdvancedConfig(row.advanced_config);
			const currentSqli = internalNyxGuard.sqli.isEnabledInAdvancedConfig(row.advanced_config);

			// Treat missing fields as "keep current value" so UI updates don't accidentally
			// reset other per-app toggles.
			const nextWaf = ENFORCE_NYXGUARD_PROTECTION ? true : data.wafEnabled;
			// When enabling WAF for the first time on an app, default Bot/DDoS to the global settings
			// if the caller didn't explicitly pass values.
			const globalSettings = await internalNyxGuard.settings.get(db());
			const nextBotInput =
				typeof data.botDefenseEnabled === "boolean"
					? data.botDefenseEnabled
					: !currentWaf && nextWaf
						? globalSettings.botDefenseEnabled
						: currentBot;
			const nextDdosInput =
				typeof data.ddosEnabled === "boolean"
					? data.ddosEnabled
					: !currentWaf && nextWaf
						? globalSettings.ddosEnabled
						: currentDdos;
			const nextSqliInput =
				typeof data.sqliEnabled === "boolean"
					? data.sqliEnabled
					: !currentWaf && nextWaf
						? globalSettings.sqliEnabled
						: currentSqli;
			let currentAuthBypass = !!globalSettings.authBypassEnabled;
			try {
				const existing = await db()("nyxguard_app")
					.select("auth_bypass_enabled")
					.where({ proxy_host_id: row.id })
					.first();
				if (existing && existing.auth_bypass_enabled != null) {
					currentAuthBypass = !!existing.auth_bypass_enabled;
				}
			} catch {
				// ignore; default true
			}
			const nextAuthBypassInput =
				typeof data.authBypassEnabled === "boolean" ? data.authBypassEnabled : currentAuthBypass;

			const bot = ENFORCE_NYXGUARD_PROTECTION ? true : !!nextWaf && !!nextBotInput;
			const ddos = ENFORCE_NYXGUARD_PROTECTION ? true : !!nextWaf && !!nextDdosInput;
			const sqli = ENFORCE_NYXGUARD_PROTECTION ? true : !!nextWaf && !!nextSqliInput;
			const authBypass = !!nextWaf && !!nextAuthBypassInput;

			let nextAdvanced = internalNyxGuard.waf.applyAdvancedConfig(row.advanced_config, nextWaf);
			nextAdvanced = internalNyxGuard.botDefense.applyAdvancedConfig(nextAdvanced, bot);
			nextAdvanced = internalNyxGuard.ddos.applyAdvancedConfig(nextAdvanced, ddos);
			nextAdvanced = internalNyxGuard.sqli.applyAdvancedConfig(nextAdvanced, sqli);

			// Best-effort persistence. Advanced config is still the source of truth for nginx.
			try {
				await db()("nyxguard_app")
					.insert({
						proxy_host_id: row.id,
						waf_enabled: nextWaf ? 1 : 0,
						auth_bypass_enabled: authBypass ? 1 : 0,
						created_on: db().fn.now(),
						modified_on: db().fn.now(),
					})
					.onConflict("proxy_host_id")
					.merge({
						waf_enabled: nextWaf ? 1 : 0,
						auth_bypass_enabled: authBypass ? 1 : 0,
						modified_on: db().fn.now(),
					});
			} catch {
				// ignore
			}

			const saved = await internalProxyHost.update(res.locals.access, {
				id: row.id,
				advanced_config: nextAdvanced,
				meta: {
					...(row.meta ?? {}),
					nyxguardWafEnabled: !!nextWaf,
					nyxguardBotDefenseEnabled: bot,
					nyxguardDdosEnabled: ddos,
					nyxguardSqliEnabled: sqli,
					nyxguardAuthBypassEnabled: authBypass,
				},
			});
			await regenerateProxyHostConfig(res.locals.access, saved.id);

			await internalNyxGuard.nginx.apply(db());

			let authBypassEnabled = !!globalSettings.authBypassEnabled;
			try {
				const r = await db()("nyxguard_app")
					.select("auth_bypass_enabled")
					.where({ proxy_host_id: saved.id })
					.first();
				if (r && r.auth_bypass_enabled != null) authBypassEnabled = !!r.auth_bypass_enabled;
			} catch {
				// ignore
			}

			res.status(200).send({
				id: saved.id,
				wafEnabled: internalNyxGuard.waf.isEnabledInAdvancedConfig(saved.advanced_config),
				botDefenseEnabled: internalNyxGuard.botDefense.isEnabledInAdvancedConfig(saved.advanced_config),
				ddosEnabled: internalNyxGuard.ddos.isEnabledInAdvancedConfig(saved.advanced_config),
				sqliEnabled: internalNyxGuard.sqli.isEnabledInAdvancedConfig(saved.advanced_config),
				authBypassEnabled,
			});
		} catch (err) {
			debug(logger, `PUT /api/nyxguard/apps/:host_id: ${err}`);
			next(err);
		}
	});

export default router;
