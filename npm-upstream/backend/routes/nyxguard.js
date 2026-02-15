import fs from "node:fs/promises";
import path from "node:path";
import { createReadStream } from "node:fs";
import net from "node:net";
import zlib from "node:zlib";
import readline from "node:readline";

import express from "express";
import db from "../db.js";
import errs from "../lib/error.js";
import internalNyxGuard from "../internal/nyxguard.js";
import internalNginx from "../internal/nginx.js";
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
const MAX_LIVE_TRAFFIC_MINUTES = 30 * 24 * 60;
const MAX_IPS_MINUTES = 90 * 24 * 60;
const MAX_ATTACKS_MINUTES = 180 * 24 * 60;
const MAX_TOTAL_SCAN_BYTES = 80 * 1024 * 1024; // safety cap for long windows
const GEOIP_DIR = "/data/geoip";
const GEOIP_COUNTRY_DB = path.join(GEOIP_DIR, "GeoLite2-Country.mmdb");
const GEOIP_IP2LOCATION_DB = path.join(GEOIP_DIR, "IP2Location-Country.mmdb");
const ENFORCE_NYXGUARD_PROTECTION = process.env.NYXGUARD_ENFORCE_PROTECTION !== "0";
const SUMMARY_CACHE_TTL_MS = Number.parseInt(process.env.NYXGUARD_SUMMARY_CACHE_TTL_MS ?? "", 10) || 2000;
const IPS_CACHE_TTL_MS = Number.parseInt(process.env.NYXGUARD_IPS_CACHE_TTL_MS ?? "", 10) || 2000;
const ROUTE_CACHE_MAX_ENTRIES = 128;
const routeResultCache = new Map(); // key -> { expiresAt: number, value: any }
const routeInflight = new Map(); // key -> Promise<any>

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

function maybeCompactRouteCache() {
	const now = Date.now();
	for (const [key, item] of routeResultCache.entries()) {
		if (!item || item.expiresAt <= now) routeResultCache.delete(key);
	}
	// Prevent unbounded growth from many query combinations.
	if (routeResultCache.size <= ROUTE_CACHE_MAX_ENTRIES) return;
	const entries = [...routeResultCache.entries()].sort((a, b) => a[1].expiresAt - b[1].expiresAt);
	for (const [key] of entries) {
		if (routeResultCache.size <= ROUTE_CACHE_MAX_ENTRIES) break;
		routeResultCache.delete(key);
	}
}

async function withRouteCache(key, ttlMs, producer) {
	const now = Date.now();
	const cached = routeResultCache.get(key);
	if (cached && cached.expiresAt > now) return cached.value;

	const inflight = routeInflight.get(key);
	if (inflight) return inflight;

	const p = (async () => {
		try {
			const value = await producer();
			routeResultCache.set(key, { expiresAt: Date.now() + ttlMs, value });
			maybeCompactRouteCache();
			return value;
		} finally {
			routeInflight.delete(key);
		}
	})();
	routeInflight.set(key, p);
	return p;
}

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
	/^\[(?<time>[^\]]+)\]\s+(?<cache>\S+)\s+(?<upstream_status>\S+)\s+(?<status>\d{3}|-)\s+-\s+(?<method>\S+)\s+(?<scheme>\S+)\s+(?<host>\S+)\s+"(?<uri>[^"]*)"\s+\[Client\s+(?<ip>[^\]]+)\](?:\s+\[Country\s+(?<country>[^\]]+)\])?(?:\s+\[Rx\s+(?<rx>[^\]]+)\])?(?:\s+\[Tx\s+(?<tx>[^\]]+)\])?/;

function parseByteCount(value) {
	const v = String(value ?? "").trim();
	if (!v || v === "-") return 0;
	const n = Number.parseInt(v, 10);
	return Number.isFinite(n) && n >= 0 ? n : 0;
}

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
		rxBytes: parseByteCount(m.groups.rx),
		txBytes: parseByteCount(m.groups.tx),
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

async function clearNyxGuardAccessLogs(logDir) {
	let filesCleared = 0;
	const clearFile = async (fp) => {
		try {
			if (fp.endsWith(".gz") || /\.\d+$/.test(fp)) {
				await fs.unlink(fp);
			} else {
				await fs.truncate(fp, 0);
			}
			filesCleared += 1;
		} catch {
			// ignore per-file failures
		}
	};

	const entries = await fs.readdir(logDir, { withFileTypes: true });
	for (const entry of entries) {
		const fp = path.join(logDir, entry.name);
		if (entry.isFile()) {
			const isAccessLog =
				/(?:_access\.log(?:\.\d+)?(?:\.gz)?$)|(?:fallback_http_access\.log(?:\.\d+)?(?:\.gz)?$)/.test(entry.name);
			if (isAccessLog) {
				await clearFile(fp);
			}
			continue;
		}
		if (entry.isDirectory()) {
			try {
				const nested = await fs.readdir(fp, { withFileTypes: true });
				for (const n of nested) {
					if (!n.isFile()) continue;
					if (!/^access\.log(?:\.\d+)?(?:\.gz)?$/.test(n.name)) continue;
					await clearFile(path.join(fp, n.name));
				}
			} catch {
				// ignore unreadable nested dirs
			}
		}
	}
	return filesCleared;
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

async function buildSummary({ minutes, limit, offset = 0 }) {
	const logDir = process.env.NYXGUARD_LOG_DIR || "/data/logs";
	const now = Date.now();
	const sinceMs = now - minutes * 60 * 1000;
	const files = await listProxyHostAccessLogFiles(logDir);
	const maxBytes = minutes > 60 ? MAX_BYTES_PER_FILE_24H : MAX_BYTES_PER_FILE;
	const scanAll = minutes > 24 * 60;

	let total = 0;
	let allowed = 0;
	let blocked = 0;
	let rxBytes = 0;
	let txBytes = 0;
	const uniqueIps = new Set();
	const perHost = new Map(); // host -> {total, allowed, blocked, rxBytes, txBytes, ips:Set}
	const recent = [];
	let totalScanBytes = 0;

	const recentKeepLimit = Math.min(5000, Math.max(200, (offset + limit) * 3));
	const pushRecent = (ev) => {
		recent.push(ev);
		// Keep memory bounded for large windows.
		if (recent.length > recentKeepLimit) {
			recent.sort((a, b) => b.ts - a.ts);
			recent.splice(recentKeepLimit);
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
					rxBytes += ev.rxBytes || 0;
					txBytes += ev.txBytes || 0;

					const isBlocked = typeof ev.status === "number" ? ev.status >= 400 : false;
					if (isBlocked) blocked += 1;
					else allowed += 1;

					if (!perHost.has(ev.host)) {
						perHost.set(ev.host, { total: 0, allowed: 0, blocked: 0, rxBytes: 0, txBytes: 0, ips: new Set() });
					}
					const h = perHost.get(ev.host);
					h.total += 1;
					if (isBlocked) h.blocked += 1;
					else h.allowed += 1;
					h.rxBytes += ev.rxBytes || 0;
					h.txBytes += ev.txBytes || 0;
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
						rxBytes += ev.rxBytes || 0;
						txBytes += ev.txBytes || 0;

						const isBlocked = typeof ev.status === "number" ? ev.status >= 400 : false;
						if (isBlocked) blocked += 1;
						else allowed += 1;

						if (!perHost.has(ev.host)) {
							perHost.set(ev.host, { total: 0, allowed: 0, blocked: 0, rxBytes: 0, txBytes: 0, ips: new Set() });
						}
						const h = perHost.get(ev.host);
						h.total += 1;
						if (isBlocked) h.blocked += 1;
						else h.allowed += 1;
						h.rxBytes += ev.rxBytes || 0;
						h.txBytes += ev.txBytes || 0;
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
	const recentTrimmed = recent.slice(offset, offset + limit).map((e) => ({
		ts: e.ts,
		iso: new Date(e.ts).toISOString(),
		host: e.host,
		uri: e.uri,
		method: e.method,
		scheme: e.scheme,
		status: e.status,
		ip: e.ip,
		country: e.country ?? null,
		rxBytes: e.rxBytes || 0,
		txBytes: e.txBytes || 0,
	}));

	const hosts = [...perHost.entries()]
		.map(([host, v]) => ({
			host,
			requests: v.total,
			allowed: v.allowed,
			blocked: v.blocked,
			uniqueIps: v.ips.size,
			rxBytes: v.rxBytes || 0,
			txBytes: v.txBytes || 0,
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
		rxBytes,
		txBytes,
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
						minutes: { type: "integer", minimum: 1, maximum: MAX_LIVE_TRAFFIC_MINUTES },
						limit: { type: "integer", minimum: 1, maximum: 1000 },
						offset: { type: "integer", minimum: 0, maximum: 100000 },
					},
				},
				{
					minutes: req.query.minutes ? Number.parseInt(String(req.query.minutes), 10) : DEFAULT_MINUTES,
					limit: req.query.limit ? Number.parseInt(String(req.query.limit), 10) : 50,
					offset: req.query.offset ? Number.parseInt(String(req.query.offset), 10) : 0,
				},
			);
			const cacheKey = `summary:${data.minutes}:${data.limit}:${data.offset}`;
			const summary = await withRouteCache(cacheKey, SUMMARY_CACHE_TTL_MS, () =>
				buildSummary({ minutes: data.minutes, limit: data.limit, offset: data.offset }),
			);
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

			if (enableBotForAllProtected || enableDdosForAllProtected || enableSqliForAllProtected) {
				const rows = await internalProxyHost.getAll(res.locals.access, null, null);
				for (const r of rows) {
					const currentWaf = internalNyxGuard.waf.isEnabledInAdvancedConfig(r.advanced_config);
					if (!currentWaf) continue;

					let nextAdvanced = r.advanced_config ?? "";
					let changed = false;

					if (enableBotForAllProtected && !internalNyxGuard.botDefense.isEnabledInAdvancedConfig(nextAdvanced)) {
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
							nyxguardBotDefenseEnabled: internalNyxGuard.botDefense.isEnabledInAdvancedConfig(nextAdvanced),
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
						minutes: { type: "integer", minimum: 1, maximum: MAX_IPS_MINUTES },
						limit: { type: "integer", minimum: 1, maximum: 2000 },
					},
				},
				{
					minutes: req.query.minutes ? Number.parseInt(String(req.query.minutes), 10) : 1440,
					limit: req.query.limit ? Number.parseInt(String(req.query.limit), 10) : 200,
				},
			);
			const cacheKey = `ips:${data.minutes}:${data.limit}`;
			const result = await withRouteCache(cacheKey, IPS_CACHE_TTL_MS, () => buildIps(data));
			res.status(200).send(result);
		} catch (err) {
			debug(logger, `GET /api/nyxguard/ips: ${err}`);
			next(err);
		}
		});

	/**
	 * /api/nyxguard/attacks/summary
	 */
	router
		.route("/attacks/summary")
		.options((_, res) => res.sendStatus(204))
		.all(jwtdecode())
		.get(async (req, res, next) => {
			try {
				const data = await validator(
					{
						additionalProperties: false,
						properties: {
							minutes: { type: "integer", minimum: 1, maximum: MAX_ATTACKS_MINUTES },
						},
					},
					{
						minutes: req.query.minutes ? Number.parseInt(String(req.query.minutes), 10) : 1440,
					},
				);

				const since = new Date(Date.now() - data.minutes * 60 * 1000);
				const rows = await db()("nyxguard_attack_event")
					.select("attack_type")
					.count({ count: "*" })
					.where("created_on", ">=", since)
					.groupBy("attack_type");

				const byType = { sqli: 0, ddos: 0, bot: 0 };
				let total = 0;
				for (const r of rows) {
					const t = r.attack_type;
					const c = Number.parseInt(String(r.count ?? "0"), 10) || 0;
					if (t === "sqli" || t === "ddos" || t === "bot") byType[t] = c;
					total += c;
				}

				const last = await db()("nyxguard_attack_event")
					.select("attack_type", "ip", "created_on")
					.where("created_on", ">=", since)
					.orderBy("created_on", "desc")
					.first();

				res.status(200).send({
					minutes: data.minutes,
					total,
					byType,
					last: last
						? {
								type: last.attack_type,
								ip: last.ip,
								createdOn: last.created_on,
							}
						: null,
				});
			} catch (err) {
				debug(logger, `GET /api/nyxguard/attacks/summary: ${err}`);
				next(err);
			}
		});

	/**
	 * /api/nyxguard/attacks
	 */
	router
		.route("/attacks")
		.options((_, res) => res.sendStatus(204))
		.all(jwtdecode())
		.get(async (req, res, next) => {
			try {
				const data = await validator(
					{
						additionalProperties: false,
						properties: {
							days: { type: "integer", enum: [1, 7, 30] },
							limit: { type: "integer", minimum: 1, maximum: 500 },
							type: { type: "string", enum: ["sqli", "ddos", "bot"] },
						},
					},
					{
						days: req.query.days ? Number.parseInt(String(req.query.days), 10) : 1,
						limit: req.query.limit ? Number.parseInt(String(req.query.limit), 10) : 200,
						type: req.query.type ? String(req.query.type) : undefined,
					},
				);

				const since = new Date(Date.now() - data.days * 24 * 60 * 60 * 1000);
				const q = db()("nyxguard_attack_event")
					.select("ip", "attack_type")
					.count({ count: "*" })
					.max({ lastSeen: "created_on" })
					.where("created_on", ">=", since)
					.groupBy("ip", "attack_type")
					.orderBy("lastSeen", "desc")
					.limit(data.limit);

				if (data.type) q.andWhere("attack_type", data.type);

				const rows = await q;
				const ips = [...new Set(rows.map((r) => r.ip).filter(Boolean))];

				// Attach deny rule state (used as "ban" status for the UI).
				const denyRows = ips.length
					? await db()("nyxguard_ip_rule")
							.select("id", "ip_cidr", "enabled", "expires_on", "modified_on", "note")
							.whereIn("ip_cidr", ips)
							.andWhere("action", "deny")
							.orderBy("id", "desc")
					: [];

				const banByIp = new Map();
				for (const r of denyRows) {
					if (!banByIp.has(r.ip_cidr)) {
						banByIp.set(r.ip_cidr, r);
					}
				}

				const items = rows.map((r) => {
					const ban = banByIp.get(r.ip) ?? null;
					return {
						ip: r.ip,
						type: r.attack_type,
						count: Number.parseInt(String(r.count ?? "0"), 10) || 0,
						lastSeen: r.lastSeen,
						ban: ban
							? {
									ruleId: ban.id,
									enabled: !!ban.enabled,
									expiresOn: ban.expires_on ? new Date(ban.expires_on).toISOString() : null,
									modifiedOn: ban.modified_on,
									note: ban.note ?? null,
								}
							: null,
					};
				});

				res.status(200).send({ days: data.days, items });
			} catch (err) {
				debug(logger, `GET /api/nyxguard/attacks: ${err}`);
				next(err);
			}
		});

	/**
	 * /api/nyxguard/attacks/ban
	 *
	 * Adjust ban duration for an IP (24h, 30d, permanent).
	 */
	router
		.route("/attacks/ban")
		.options((_, res) => res.sendStatus(204))
		.all(jwtdecode())
		.put(async (req, res, next) => {
			try {
				await res.locals.access.can("proxy_hosts:update");

				const body = req.body ?? {};
				const data = await validator(
					{
						required: ["ip", "duration"],
						additionalProperties: false,
						properties: {
							ip: { type: "string" },
							duration: { type: "string", enum: ["24h", "30d", "permanent"] },
						},
					},
					{
						ip: body.ip,
						duration: body.duration,
					},
				);

				if (!net.isIP(data.ip)) throw new errs.ValidationError("ip must be a valid IPv4/IPv6 address");

				const now = Date.now();
				const expiresOn =
					data.duration === "permanent"
						? null
						: data.duration === "30d"
							? new Date(now + 30 * 24 * 60 * 60 * 1000)
							: new Date(now + 24 * 60 * 60 * 1000);

				const existing = await db()("nyxguard_ip_rule")
					.where({ ip_cidr: data.ip, action: "deny" })
					.orderBy("id", "desc")
					.first();

				if (!existing) {
					await db()("nyxguard_ip_rule").insert({
						enabled: 1,
						action: "deny",
						ip_cidr: data.ip,
						note: "Manual ban (Attacks)",
						expires_on: expiresOn,
						created_on: db().fn.now(),
						modified_on: db().fn.now(),
					});
				} else {
					await db()("nyxguard_ip_rule")
						.where({ id: existing.id })
						.update({
							enabled: 1,
							expires_on: expiresOn,
							modified_on: db().fn.now(),
						});
				}

				await internalNyxGuard.nginx.apply(db());
				res.status(200).send({ ip: data.ip, duration: data.duration, expiresOn: expiresOn ? expiresOn.toISOString() : null });
			} catch (err) {
				debug(logger, `PUT /api/nyxguard/attacks/ban: ${err}`);
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
			// Per-app auth bypass is stored in nyxguard_app. Default to true when absent.
			const ids = rows.map((r) => r.id);
			const authBypassById = new Map();
			if (ids.length) {
				try {
					const appRows = await db()("nyxguard_app")
						.select("proxy_host_id", "auth_bypass_enabled")
						.whereIn("proxy_host_id", ids);
					for (const r of appRows) {
						authBypassById.set(r.proxy_host_id, !!r.auth_bypass_enabled);
					}
				} catch {
					// ignore: schema may not be migrated yet
				}
			}
			const items = rows.map((r) => ({
				id: r.id,
				enabled: !!r.enabled,
				domains: r.domain_names ?? [],
				forwardHost: r.forward_host ?? null,
				forwardPort: r.forward_port ?? null,
					wafEnabled: internalNyxGuard.waf.isEnabledInAdvancedConfig(r.advanced_config),
					botDefenseEnabled: internalNyxGuard.botDefense.isEnabledInAdvancedConfig(r.advanced_config),
					ddosEnabled: internalNyxGuard.ddos.isEnabledInAdvancedConfig(r.advanced_config),
					sqliEnabled: internalNyxGuard.sqli.isEnabledInAdvancedConfig(r.advanced_config),
					authBypassEnabled: authBypassById.has(r.id) ? authBypassById.get(r.id) : true,
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

	/**
	 * /api/nyxguard/logs/clear
	 */
	router
		.route("/logs/clear")
		.options((_, res) => res.sendStatus(204))
		.all(jwtdecode())
		.post(async (req, res, next) => {
			try {
				await res.locals.access.can("proxy_hosts:update");
				const body = req.body ?? {};
				const data = await validator(
					{
						required: ["target"],
						additionalProperties: false,
						properties: {
							target: { type: "string", enum: ["traffic", "ips", "attacks"] },
							minutes: { type: "integer", minimum: 1, maximum: MAX_IPS_MINUTES },
							days: { type: "integer", enum: [1, 7, 30, 60, 90] },
						},
					},
					{
						target: body.target,
						minutes: body.minutes,
						days: body.days,
					},
				);

				let deletedRows = 0;
				let clearedFiles = 0;
				if (data.target === "attacks") {
					const days = typeof data.days === "number" ? data.days : 1;
					const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
					deletedRows = await db()("nyxguard_attack_event").where("created_on", ">=", since).del();
				} else {
					const logDir = process.env.NYXGUARD_LOG_DIR || "/data/logs";
					clearedFiles = await clearNyxGuardAccessLogs(logDir);
				}

				routeResultCache.clear();
				res.status(200).send({
					target: data.target,
					deletedRows,
					clearedFiles,
				});
			} catch (err) {
				debug(logger, `POST /api/nyxguard/logs/clear: ${err}`);
				next(err);
			}
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
							nyxguardDdosEnabled: enabled ? internalNyxGuard.ddos.isEnabledInAdvancedConfig(nextAdvanced) : false,
							nyxguardSqliEnabled: enabled ? internalNyxGuard.sqli.isEnabledInAdvancedConfig(nextAdvanced) : false,
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
			res.status(200).send({ updated, enforced: ENFORCE_NYXGUARD_PROTECTION, enabled: true });
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
			res.status(200).send({ updated, skipped, enforced: ENFORCE_NYXGUARD_PROTECTION, enabled: true });
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
			res.status(200).send({ updated, skipped, enforced: ENFORCE_NYXGUARD_PROTECTION, enabled: true });
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
				res.status(200).send({ updated, skipped, enforced: ENFORCE_NYXGUARD_PROTECTION, enabled: true });
			} catch (err) {
				debug(logger, `PUT /api/nyxguard/apps/sqli: ${err}`);
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

				const bot = ENFORCE_NYXGUARD_PROTECTION ? true : !!nextWaf && !!nextBotInput;
				const ddos = ENFORCE_NYXGUARD_PROTECTION ? true : !!nextWaf && !!nextDdosInput;
				const sqli = ENFORCE_NYXGUARD_PROTECTION ? true : !!nextWaf && !!nextSqliInput;

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
						auth_bypass_enabled: typeof data.authBypassEnabled === "boolean" ? (data.authBypassEnabled ? 1 : 0) : 1,
						created_on: db().fn.now(),
						modified_on: db().fn.now(),
					})
					.onConflict("proxy_host_id")
					.merge({
						waf_enabled: nextWaf ? 1 : 0,
						...(typeof data.authBypassEnabled === "boolean"
							? { auth_bypass_enabled: data.authBypassEnabled ? 1 : 0 }
							: {}),
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
					},
				});
			await regenerateProxyHostConfig(res.locals.access, saved.id);

			await internalNyxGuard.nginx.apply(db());

				let authBypassEnabled = true;
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
	.delete(async (_req, res, next) => {
		try {
			await res.locals.access.can("proxy_hosts:update");
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
	.delete(async (_req, res, next) => {
		try {
			await res.locals.access.can("proxy_hosts:update");
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
