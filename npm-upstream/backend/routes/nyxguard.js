import fs from "node:fs/promises";
import path from "node:path";
import { createReadStream } from "node:fs";
import zlib from "node:zlib";
import readline from "node:readline";

import express from "express";
import db from "../db.js";
import errs from "../lib/error.js";
import internalNyxGuard from "../internal/nyxguard.js";
import internalProxyHost from "../internal/proxy-host.js";
import jwtdecode from "../lib/express/jwt-decode.js";
import validator from "../lib/validator/index.js";
import { debug, express as logger } from "../logger.js";

const router = express.Router({
	caseSensitive: true,
	strict: true,
	mergeParams: true,
});

const DEFAULT_MINUTES = 15;
const MAX_BYTES_PER_FILE = 2 * 1024 * 1024; // enough for many recent requests without scanning large logs
const MAX_BYTES_PER_FILE_24H = 10 * 1024 * 1024;
const MAX_MINUTES = 180 * 24 * 60;
const MAX_TOTAL_SCAN_BYTES = 80 * 1024 * 1024; // safety cap for long windows
const GEOIP_DIR = "/data/geoip";
const GEOIP_COUNTRY_DB = path.join(GEOIP_DIR, "GeoLite2-Country.mmdb");

function monthToIndex(mon) {
	const m = mon.toLowerCase();
	const map = {
		jan: 0,
		feb: 1,
		mar: 2,
		apr: 3,
		may: 4,
		jun: 5,
		jul: 6,
		aug: 7,
		sep: 8,
		oct: 9,
		nov: 10,
		dec: 11,
	};
	return typeof map[m] === "number" ? map[m] : null;
}

// time_local example: "08/Feb/2026:20:12:09 +1000"
function parseTimeLocal(timeLocal) {
	try {
		const [dt, off] = timeLocal.split(" ");
		const [dmy, hms] = dt.split(":").length > 1
			? [dt.split(":").slice(0, 1)[0], dt.split(":").slice(1).join(":")]
			: [null, null];
		if (!dmy || !hms || !off) return null;

		const [dd, mon, yyyy] = dmy.split("/");
		const [hh, mm, ss] = hms.split(":");
		const month = monthToIndex(mon);
		if (month === null) return null;

		const year = Number.parseInt(yyyy, 10);
		const day = Number.parseInt(dd, 10);
		const hour = Number.parseInt(hh, 10);
		const minute = Number.parseInt(mm, 10);
		const second = Number.parseInt(ss, 10);
		if ([year, day, hour, minute, second].some((v) => Number.isNaN(v))) return null;

		const sign = off.startsWith("-") ? -1 : 1;
		const offH = Number.parseInt(off.slice(1, 3), 10);
		const offM = Number.parseInt(off.slice(3, 5), 10);
		if ([offH, offM].some((v) => Number.isNaN(v))) return null;
		const offMinutes = sign * (offH * 60 + offM);

		const utcMs = Date.UTC(year, month, day, hour, minute, second) - offMinutes * 60 * 1000;
		return utcMs;
	} catch {
		return null;
	}
}

const lineRe =
	/^\[(?<time>[^\]]+)\]\s+(?<cache>\S+)\s+(?<upstream_status>\S+)\s+(?<status>\d{3}|-)\s+-\s+(?<method>\S+)\s+(?<scheme>\S+)\s+(?<host>\S+)\s+"(?<uri>[^"]*)"\s+\[Client\s+(?<ip>[^\]]+)\](?:\s+\[Country\s+(?<country>[^\]]+)\])?/;

function parseAccessLine(line) {
	const m = lineRe.exec(line);
	if (!m?.groups) return null;
	const ts = parseTimeLocal(m.groups.time);
	if (!ts) return null;
	const statusRaw = m.groups.status;
	const status = statusRaw === "-" ? null : Number.parseInt(statusRaw, 10);
	return {
		ts,
		status,
		method: m.groups.method,
		scheme: m.groups.scheme,
		host: m.groups.host,
		uri: m.groups.uri,
		ip: m.groups.ip,
		country: m.groups.country && m.groups.country !== "-" ? m.groups.country : null,
	};
}

async function readRecentLines(filePath, maxBytes) {
	const st = await fs.stat(filePath);
	const size = st.size;
	const start = Math.max(0, size - maxBytes);
	const fh = await fs.open(filePath, "r");
	try {
		const buf = Buffer.alloc(size - start);
		await fh.read(buf, 0, buf.length, start);
		let txt = buf.toString("utf8");
		// If we started in the middle of a line, drop the partial first line.
		if (start > 0) {
			const nl = txt.indexOf("\n");
			if (nl >= 0) txt = txt.slice(nl + 1);
		}
		return txt.split("\n").filter(Boolean);
	} finally {
		await fh.close();
	}
}

async function listProxyHostAccessLogFiles(logDir) {
	const entries = await fs.readdir(logDir, { withFileTypes: true });
	const names = entries
		.filter((e) => e.isFile())
		.map((e) => e.name)
		.filter((n) => /^proxy-host-\d+_access\.log(\.\d+)?(\.gz)?$/.test(n));

	const files = await Promise.all(
		names.map(async (n) => {
			const fp = path.join(logDir, n);
			let st;
			try {
				st = await fs.stat(fp);
			} catch {
				return null;
			}
			return { fp, name: n, size: st.size, mtimeMs: st.mtimeMs };
		}),
	);

	return files
		.filter(Boolean)
		.sort((a, b) => b.mtimeMs - a.mtimeMs)
		.map((f) => f);
}

async function scanLogFile({ fp, size, sinceMs, maxBytes, onEvent }) {
	// For non-gz logs we can tail for short windows. For long windows we may need full scan.
	const isGz = fp.endsWith(".gz");
	const isPlain = !isGz;

	let start = 0;
	if (isPlain && typeof maxBytes === "number" && size > maxBytes) {
		start = Math.max(0, size - maxBytes);
	}

	return new Promise((resolve) => {
		const rs = createReadStream(fp, isPlain ? { start } : undefined);
		rs.on("error", () => resolve({ bytesRead: 0 }));

		const input = isGz ? rs.pipe(zlib.createGunzip()) : rs;
		const rl = readline.createInterface({ input, crlfDelay: Infinity });

		let bytesRead = 0;
		rs.on("data", (chunk) => {
			bytesRead += chunk.length;
		});

		rl.on("line", (line) => {
			const ev = parseAccessLine(line);
			if (!ev) return;
			if (ev.ts < sinceMs) return;
			onEvent(ev);
		});

		rl.on("close", () => resolve({ bytesRead }));
	});
}

async function buildSummary({ minutes, limit }) {
	const logDir = process.env.NYXGUARD_LOG_DIR || "/data/logs";
	const now = Date.now();
	const sinceMs = now - minutes * 60 * 1000;
	const files = await listProxyHostAccessLogFiles(logDir);
	const maxBytes = minutes > 60 ? MAX_BYTES_PER_FILE_24H : MAX_BYTES_PER_FILE;
	const scanAll = minutes > 24 * 60;

	let total = 0;
	let allowed = 0;
	let blocked = 0;
	const uniqueIps = new Set();
	const perHost = new Map(); // host -> {total, allowed, blocked, ips:Set}
	const recent = [];
	let totalScanBytes = 0;

	const pushRecent = (ev) => {
		recent.push(ev);
		// Keep memory bounded for large windows.
		if (recent.length > Math.max(200, limit * 6)) {
			recent.sort((a, b) => b.ts - a.ts);
			recent.splice(limit);
		}
	};

	for (const f of files) {
		// If file hasn't been touched since before the window, it's very likely out-of-range.
		if (f.mtimeMs < sinceMs && !f.name.endsWith("_access.log")) {
			continue;
		}

		if (totalScanBytes >= MAX_TOTAL_SCAN_BYTES) break;

		try {
			if (!scanAll && f.name.endsWith("_access.log")) {
				// Fast path for short windows: only tail current files.
				const lines = await readRecentLines(f.fp, maxBytes);
				for (const line of lines) {
					const ev = parseAccessLine(line);
					if (!ev) continue;
					if (ev.ts < sinceMs) continue;
					total += 1;
					if (ev.ip) uniqueIps.add(ev.ip);

					const isBlocked = typeof ev.status === "number" ? ev.status >= 400 : false;
					if (isBlocked) blocked += 1;
					else allowed += 1;

					if (!perHost.has(ev.host)) {
						perHost.set(ev.host, { total: 0, allowed: 0, blocked: 0, ips: new Set() });
					}
					const h = perHost.get(ev.host);
					h.total += 1;
					if (isBlocked) h.blocked += 1;
					else h.allowed += 1;
					if (ev.ip) h.ips.add(ev.ip);

					pushRecent(ev);
				}
			} else {
				// Long windows: scan rotated logs too (including .gz).
				const res = await scanLogFile({
					fp: f.fp,
					size: f.size,
					sinceMs,
					maxBytes: f.name.endsWith(".gz") ? undefined : undefined,
					onEvent: (ev) => {
						total += 1;
						if (ev.ip) uniqueIps.add(ev.ip);

						const isBlocked = typeof ev.status === "number" ? ev.status >= 400 : false;
						if (isBlocked) blocked += 1;
						else allowed += 1;

						if (!perHost.has(ev.host)) {
							perHost.set(ev.host, { total: 0, allowed: 0, blocked: 0, ips: new Set() });
						}
						const h = perHost.get(ev.host);
						h.total += 1;
						if (isBlocked) h.blocked += 1;
						else h.allowed += 1;
						if (ev.ip) h.ips.add(ev.ip);

						pushRecent(ev);
					},
				});
				totalScanBytes += res.bytesRead;
			}
		} catch (err) {
			debug(logger, `nyxguard: failed reading ${f.fp}: ${err}`);
		}
	}

	recent.sort((a, b) => b.ts - a.ts);
	const recentTrimmed = recent.slice(0, limit).map((e) => ({
		ts: e.ts,
		iso: new Date(e.ts).toISOString(),
		host: e.host,
		uri: e.uri,
		method: e.method,
		scheme: e.scheme,
		status: e.status,
		ip: e.ip,
		country: e.country ?? null,
	}));

	const hosts = [...perHost.entries()]
		.map(([host, v]) => ({
			host,
			requests: v.total,
			allowed: v.allowed,
			blocked: v.blocked,
			uniqueIps: v.ips.size,
		}))
		.sort((a, b) => b.requests - a.requests)
		.slice(0, 25);

	return {
		windowMinutes: minutes,
		now: new Date(now).toISOString(),
		requests: total,
		allowed,
		blocked,
		uniqueIps: uniqueIps.size,
		hosts,
		recent: recentTrimmed,
		truncated: totalScanBytes >= MAX_TOTAL_SCAN_BYTES,
	};
}

async function buildIps({ minutes, limit }) {
	const logDir = process.env.NYXGUARD_LOG_DIR || "/data/logs";
	const now = Date.now();
	const sinceMs = now - minutes * 60 * 1000;
	const files = await listProxyHostAccessLogFiles(logDir);
	const maxBytes = minutes > 60 ? MAX_BYTES_PER_FILE_24H : MAX_BYTES_PER_FILE;
	const scanAll = minutes > 24 * 60;
	let totalScanBytes = 0;

	const byIp = new Map(); // ip -> {ip, requests, blocked, allowed, lastTs, hosts:Set, country}

	for (const f of files) {
		if (f.mtimeMs < sinceMs && !f.name.endsWith("_access.log")) {
			continue;
		}
		if (totalScanBytes >= MAX_TOTAL_SCAN_BYTES) break;

		try {
			if (!scanAll && f.name.endsWith("_access.log")) {
				const lines = await readRecentLines(f.fp, maxBytes);
				for (const line of lines) {
					const ev = parseAccessLine(line);
					if (!ev || !ev.ip) continue;
					if (ev.ts < sinceMs) continue;
					if (!byIp.has(ev.ip)) {
						byIp.set(ev.ip, {
							ip: ev.ip,
							requests: 0,
							allowed: 0,
							blocked: 0,
							lastTs: 0,
							hosts: new Set(),
							country: null,
						});
					}
					const row = byIp.get(ev.ip);
					row.requests += 1;
					const isBlocked = typeof ev.status === "number" ? ev.status >= 400 : false;
					if (isBlocked) row.blocked += 1;
					else row.allowed += 1;
					row.lastTs = Math.max(row.lastTs, ev.ts);
					row.hosts.add(ev.host);
					if (!row.country && ev.country && ev.country !== "XX") {
						row.country = ev.country;
					}
				}
			} else {
				const res = await scanLogFile({
					fp: f.fp,
					size: f.size,
					sinceMs,
					maxBytes: undefined,
					onEvent: (ev) => {
						if (!ev.ip) return;
						if (!byIp.has(ev.ip)) {
							byIp.set(ev.ip, {
								ip: ev.ip,
								requests: 0,
								allowed: 0,
								blocked: 0,
								lastTs: 0,
								hosts: new Set(),
								country: null,
							});
						}
						const row = byIp.get(ev.ip);
						row.requests += 1;
						const isBlocked = typeof ev.status === "number" ? ev.status >= 400 : false;
						if (isBlocked) row.blocked += 1;
						else row.allowed += 1;
						row.lastTs = Math.max(row.lastTs, ev.ts);
						row.hosts.add(ev.host);
						if (!row.country && ev.country && ev.country !== "XX") {
							row.country = ev.country;
						}
					},
				});
				totalScanBytes += res.bytesRead;
			}
		} catch (err) {
			debug(logger, `nyxguard: failed reading ${f.fp}: ${err}`);
		}
	}

	const items = [...byIp.values()]
		.sort((a, b) => b.requests - a.requests)
		.slice(0, limit)
		.map((r) => ({
			ip: r.ip,
			requests: r.requests,
			allowed: r.allowed,
			blocked: r.blocked,
			lastSeen: new Date(r.lastTs).toISOString(),
			hosts: [...r.hosts].slice(0, 10),
			country: r.country ?? null,
		}));

	return {
		windowMinutes: minutes,
		now: new Date(now).toISOString(),
		items,
		truncated: totalScanBytes >= MAX_TOTAL_SCAN_BYTES,
	};
}

/**
 * /api/nyxguard/summary
 */
router
	.route("/summary")
	.options((_, res) => res.sendStatus(204))
	.all(jwtdecode())
	.get(async (req, res, next) => {
		try {
			const data = await validator(
				{
					additionalProperties: false,
					properties: {
						minutes: { type: "integer", minimum: 1, maximum: MAX_MINUTES },
						limit: { type: "integer", minimum: 1, maximum: 1000 },
					},
				},
				{
					minutes: req.query.minutes ? Number.parseInt(String(req.query.minutes), 10) : DEFAULT_MINUTES,
					limit: req.query.limit ? Number.parseInt(String(req.query.limit), 10) : 50,
				},
			);

			const summary = await buildSummary({ minutes: data.minutes, limit: data.limit });
			res.status(200).send(summary);
		} catch (err) {
			debug(logger, `${req.method.toUpperCase()} ${req.path}: ${err}`);
			next(err);
		}
	});

/**
 * /api/nyxguard/settings
 */
router
	.route("/settings")
	.options((_, res) => res.sendStatus(204))
	.all(jwtdecode())
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
			await res.locals.access.can("proxy_hosts:update");

			const body = req.body ?? {};
			const data = await validator(
				{
					additionalProperties: false,
					properties: {
						botDefenseEnabled: { type: "boolean" },
						ddosEnabled: { type: "boolean" },
						logRetentionDays: { type: "integer", enum: [30, 60, 90, 180] },
					},
				},
				{
					botDefenseEnabled: body.botDefenseEnabled ?? body.bot_defense_enabled,
					ddosEnabled: body.ddosEnabled ?? body.ddos_enabled,
					logRetentionDays: body.logRetentionDays ?? body.log_retention_days,
				},
			);

			const nextSettings = await internalNyxGuard.settings.update(db(), data);
			await internalNyxGuard.nginx.apply(db());
			res.status(200).send(nextSettings);
		} catch (err) {
			debug(logger, `PUT /api/nyxguard/settings: ${err}`);
			next(err);
		}
	});

/**
 * /api/nyxguard/ips
 */
router
	.route("/ips")
	.options((_, res) => res.sendStatus(204))
	.all(jwtdecode())
	.get(async (req, res, next) => {
		try {
			const data = await validator(
				{
					additionalProperties: false,
					properties: {
						minutes: { type: "integer", minimum: 1, maximum: MAX_MINUTES },
						limit: { type: "integer", minimum: 1, maximum: 2000 },
					},
				},
				{
					minutes: req.query.minutes ? Number.parseInt(String(req.query.minutes), 10) : 1440,
					limit: req.query.limit ? Number.parseInt(String(req.query.limit), 10) : 200,
				},
			);
			const result = await buildIps(data);
			res.status(200).send(result);
		} catch (err) {
			debug(logger, `GET /api/nyxguard/ips: ${err}`);
			next(err);
		}
	});

/**
 * /api/nyxguard/apps
 */
router
	.route("/apps")
	.options((_, res) => res.sendStatus(204))
	.all(jwtdecode())
	.get(async (_req, res, next) => {
		try {
			const rows = await internalProxyHost.getAll(res.locals.access, null, null);
			const items = rows.map((r) => ({
				id: r.id,
				enabled: !!r.enabled,
				domains: r.domain_names ?? [],
				forwardHost: r.forward_host ?? null,
				forwardPort: r.forward_port ?? null,
				wafEnabled: internalNyxGuard.waf.isEnabledInAdvancedConfig(r.advanced_config),
				botDefenseEnabled: internalNyxGuard.botDefense.isEnabledInAdvancedConfig(r.advanced_config),
				ddosEnabled: internalNyxGuard.ddos.isEnabledInAdvancedConfig(r.advanced_config),
			}));
			res.status(200).send({ items });
		} catch (err) {
			debug(logger, `GET /api/nyxguard/apps: ${err}`);
			next(err);
		}
	});

/**
 * /api/nyxguard/apps/summary
 */
router
	.route("/apps/summary")
	.options((_, res) => res.sendStatus(204))
	.all(jwtdecode())
	.get(async (_req, res, next) => {
		try {
			const accessData = await res.locals.access.can("proxy_hosts:list");
			const userId = res.locals.access.token.getUserId(1);

			const rows = await db()("proxy_host")
				.select("id", "advanced_config")
				.where("is_deleted", 0)
				.modify((qb) => {
					if (accessData.permission_visibility !== "all") {
						qb.andWhere("owner_user_id", userId);
					}
				});

			let protectedCount = 0;
			for (const r of rows) {
				if (internalNyxGuard.waf.isEnabledInAdvancedConfig(r.advanced_config)) {
					protectedCount += 1;
				}
			}

			res.status(200).send({
				totalApps: rows.length,
				protectedCount,
			});
		} catch (err) {
			debug(logger, `GET /api/nyxguard/apps/summary: ${err}`);
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
	.put(async (req, res, next) => {
		try {
			await res.locals.access.can("proxy_hosts:update");

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

			await internalNyxGuard.nginx.ensureFiles();

			const rows = await internalProxyHost.getAll(res.locals.access, null, null);

			let updated = 0;
			for (const r of rows) {
				const currentWaf = internalNyxGuard.waf.isEnabledInAdvancedConfig(r.advanced_config);
				if (currentWaf === data.enabled) continue;

				// When WAF is disabled, also force-disable Bot/DDoS at the app level.
				let nextAdvanced = internalNyxGuard.waf.applyAdvancedConfig(r.advanced_config, data.enabled);
				if (!data.enabled) {
					nextAdvanced = internalNyxGuard.botDefense.applyAdvancedConfig(nextAdvanced, false);
					nextAdvanced = internalNyxGuard.ddos.applyAdvancedConfig(nextAdvanced, false);
				}

				await internalProxyHost.update(res.locals.access, {
					id: r.id,
					advanced_config: nextAdvanced,
					meta: {
						...(r.meta ?? {}),
						nyxguardWafEnabled: !!data.enabled,
						nyxguardBotDefenseEnabled: data.enabled
							? internalNyxGuard.botDefense.isEnabledInAdvancedConfig(nextAdvanced)
							: false,
						nyxguardDdosEnabled: data.enabled ? internalNyxGuard.ddos.isEnabledInAdvancedConfig(nextAdvanced) : false,
					},
				});

				// Best-effort persistence. Advanced config is still the source of truth for nginx.
				try {
					await db()("nyxguard_app")
						.insert({
							proxy_host_id: r.id,
							waf_enabled: data.enabled ? 1 : 0,
							created_on: db().fn.now(),
							modified_on: db().fn.now(),
						})
						.onConflict("proxy_host_id")
						.merge({
							waf_enabled: data.enabled ? 1 : 0,
							modified_on: db().fn.now(),
						});
				} catch {
					// ignore
				}

				updated += 1;
			}

			await internalNyxGuard.nginx.apply(db());
			res.status(200).send({ updated });
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
	.put(async (req, res, next) => {
		try {
			await res.locals.access.can("proxy_hosts:update");

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

			await internalNyxGuard.nginx.ensureFiles();

			// Global toggle controls content of the include file; per-app include enables it per app.
			await internalNyxGuard.settings.update(db(), { botDefenseEnabled: data.enabled });

			const rows = await internalProxyHost.getAll(res.locals.access, null, null);

			let updated = 0;
			let skipped = 0;

			for (const r of rows) {
				const currentWaf = internalNyxGuard.waf.isEnabledInAdvancedConfig(r.advanced_config);
				const currentBot = internalNyxGuard.botDefense.isEnabledInAdvancedConfig(r.advanced_config);

				if (data.enabled && !currentWaf) {
					skipped += 1;
					continue;
				}

				const targetBot = data.enabled ? !!currentWaf : false;
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
					},
				});

				updated += 1;
			}

			await internalNyxGuard.nginx.apply(db());
			res.status(200).send({ updated, skipped });
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
	.put(async (req, res, next) => {
		try {
			await res.locals.access.can("proxy_hosts:update");

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

			await internalNyxGuard.nginx.ensureFiles();

			await internalNyxGuard.settings.update(db(), { ddosEnabled: data.enabled });

			const rows = await internalProxyHost.getAll(res.locals.access, null, null);

			let updated = 0;
			let skipped = 0;

			for (const r of rows) {
				const currentWaf = internalNyxGuard.waf.isEnabledInAdvancedConfig(r.advanced_config);
				const currentDdos = internalNyxGuard.ddos.isEnabledInAdvancedConfig(r.advanced_config);

				if (data.enabled && !currentWaf) {
					skipped += 1;
					continue;
				}

				const targetDdos = data.enabled ? !!currentWaf : false;
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
					},
				});

				updated += 1;
			}

			await internalNyxGuard.nginx.apply(db());
			res.status(200).send({ updated, skipped });
		} catch (err) {
			debug(logger, `PUT /api/nyxguard/apps/ddos: ${err}`);
			next(err);
		}
	});

router
	.route("/apps/:host_id")
	.options((_, res) => res.sendStatus(204))
	.all(jwtdecode())
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
					},
				},
				{
					host_id: req.params.host_id,
					wafEnabled: body.wafEnabled ?? body.waf_enabled,
					botDefenseEnabled: body.botDefenseEnabled ?? body.bot_defense_enabled,
					ddosEnabled: body.ddosEnabled ?? body.ddos_enabled,
				},
			);

			if (typeof data.wafEnabled !== "boolean") throw new errs.ValidationError("wafEnabled must be a boolean");

			await internalNyxGuard.nginx.ensureFiles();

			const row = await internalProxyHost.get(res.locals.access, { id: Number.parseInt(data.host_id, 10) });
			const currentWaf = internalNyxGuard.waf.isEnabledInAdvancedConfig(row.advanced_config);
			const currentBot = internalNyxGuard.botDefense.isEnabledInAdvancedConfig(row.advanced_config);
			const currentDdos = internalNyxGuard.ddos.isEnabledInAdvancedConfig(row.advanced_config);

			// Treat missing fields as "keep current value" so UI updates don't accidentally
			// reset other per-app toggles.
			const nextWaf = data.wafEnabled;
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

			const bot = !!nextWaf && !!nextBotInput;
			const ddos = !!nextWaf && !!nextDdosInput;

			let nextAdvanced = internalNyxGuard.waf.applyAdvancedConfig(row.advanced_config, nextWaf);
			nextAdvanced = internalNyxGuard.botDefense.applyAdvancedConfig(nextAdvanced, bot);
			nextAdvanced = internalNyxGuard.ddos.applyAdvancedConfig(nextAdvanced, ddos);

			// Best-effort persistence. Advanced config is still the source of truth for nginx.
			try {
				await db()("nyxguard_app")
					.insert({
						proxy_host_id: row.id,
						waf_enabled: data.wafEnabled ? 1 : 0,
						created_on: db().fn.now(),
						modified_on: db().fn.now(),
					})
					.onConflict("proxy_host_id")
					.merge({
						waf_enabled: data.wafEnabled ? 1 : 0,
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
				},
			});

			await internalNyxGuard.nginx.apply(db());

			res.status(200).send({
				id: saved.id,
				wafEnabled: internalNyxGuard.waf.isEnabledInAdvancedConfig(saved.advanced_config),
				botDefenseEnabled: internalNyxGuard.botDefense.isEnabledInAdvancedConfig(saved.advanced_config),
				ddosEnabled: internalNyxGuard.ddos.isEnabledInAdvancedConfig(saved.advanced_config),
			});
		} catch (err) {
			debug(logger, `PUT /api/nyxguard/apps/:host_id: ${err}`);
			next(err);
		}
	});

/**
 * /api/nyxguard/rules/ip
 */
router
	.route("/rules/ip")
	.options((_, res) => res.sendStatus(204))
	.all(jwtdecode())
	.get(async (_req, res, next) => {
		try {
			const items = await internalNyxGuard.ipRules.list(db());
			res.status(200).send({ items });
		} catch (err) {
			debug(logger, `GET /api/nyxguard/rules/ip: ${err}`);
			next(err);
		}
	})
	.post(async (req, res, next) => {
		try {
			await res.locals.access.can("proxy_hosts:update");

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
	.put(async (req, res, next) => {
		try {
			await res.locals.access.can("proxy_hosts:update");

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
								: typeof body.expiresInDays === "undefined" && typeof body.expires_in_days === "undefined"
									? undefined
									: null,
					expiresOn: typeof body.expiresOn === "undefined" ? (typeof body.expires_on === "undefined" ? undefined : body.expires_on) : body.expiresOn,
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
			await res.locals.access.can("proxy_hosts:update");

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
	.get(async (_req, res, next) => {
		try {
			const items = await internalNyxGuard.countryRules.list(db());
			res.status(200).send({ items });
		} catch (err) {
			debug(logger, `GET /api/nyxguard/rules/country: ${err}`);
			next(err);
		}
	})
	.post(async (req, res, next) => {
		try {
			await res.locals.access.can("proxy_hosts:update");

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
	.put(async (req, res, next) => {
		try {
			await res.locals.access.can("proxy_hosts:update");

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
								: typeof body.expiresInDays === "undefined" && typeof body.expires_in_days === "undefined"
									? undefined
									: null,
					expiresOn: typeof body.expiresOn === "undefined" ? (typeof body.expires_on === "undefined" ? undefined : body.expires_on) : body.expiresOn,
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
			await res.locals.access.can("proxy_hosts:update");

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
	.get(async (_req, res, next) => {
		try {
			let st = null;
			try {
				st = await fs.stat(GEOIP_COUNTRY_DB);
			} catch {
				st = null;
			}
			let confSt = null;
			try {
				confSt = await fs.stat(path.join(GEOIP_DIR, "GeoIP.conf"));
			} catch {
				confSt = null;
			}
			res.status(200).send({
				installed: !!st,
				path: GEOIP_COUNTRY_DB,
				size: st?.size ?? null,
				modifiedOn: st ? new Date(st.mtimeMs).toISOString() : null,
				updateConfigured: !!confSt,
			});
		} catch (err) {
			debug(logger, `GET /api/nyxguard/geoip: ${err}`);
			next(err);
		}
	})
	.post(async (req, res, next) => {
		try {
			await res.locals.access.can("proxy_hosts:update");

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
			// Keep it simple: we only support the GeoLite2 Country DB here.
			// (ASN/City DBs have different structures and won't populate $geoip2_country_code.)
			if (!name.toLowerCase().includes("country")) {
				res.status(400).send({ error: "Please upload the GeoLite2-Country.mmdb database (not ASN/City)." });
				return;
			}

			await fs.mkdir(GEOIP_DIR, { recursive: true });
			const tmp = path.join(GEOIP_DIR, `.upload.${process.pid}.tmp`);
			await fs.writeFile(tmp, f.data);
			await fs.rename(tmp, GEOIP_COUNTRY_DB);

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
	.post(async (req, res, next) => {
		try {
			await res.locals.access.can("proxy_hosts:update");

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
				`# GeoIP.conf for NyxGuard Manager (MaxMind GeoLite2)\n` +
				`AccountID ${data.accountId}\n` +
				`LicenseKey ${data.licenseKey}\n` +
				`EditionIDs GeoLite2-Country\n`;
			await fs.writeFile(confPath, conf, { encoding: "utf8", mode: 0o600 });

			res.status(200).send({ ok: true });
		} catch (err) {
			debug(logger, `POST /api/nyxguard/geoip/config: ${err}`);
			next(err);
		}
	})
	.delete(async (_req, res, next) => {
		try {
			await res.locals.access.can("proxy_hosts:update");

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
