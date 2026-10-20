import {accessSummary} from '../../internal/traffic-summary.mjs';
import {scanHistoricalLog as scanAccessLog,clearHistoricalLogCache} from "../../internal/historical-log-cache.mjs";
import {keepRecent,newestFirst} from "../../internal/traffic-selection.mjs";
import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import readline from "node:readline";
import zlib from "node:zlib";
import express from "express";
import db from "../../db.js";
import { buildThreatActivityPage } from "../../internal/threat-activity-page.js";
import internalNyxGuard from "../../internal/nyxguard.js";
import { sanitizeCidr } from "../../internal/nyxguard/helpers.js";
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

const DEFAULT_MINUTES = 15;
const MAX_BYTES_PER_FILE = 2 * 1024 * 1024; // enough for many recent requests without scanning large logs
const MAX_BYTES_PER_FILE_24H = 10 * 1024 * 1024;
const MAX_BYTES_PER_FILE_LONG_RECENT = 4 * 1024 * 1024;
const MAX_LIVE_TRAFFIC_MINUTES = 180 * 24 * 60;
const MAX_IPS_MINUTES = 180 * 24 * 60;
const MAX_ATTACKS_MINUTES = 180 * 24 * 60;
const MAX_TOTAL_SCAN_BYTES = 80 * 1024 * 1024; // safety cap for long windows
const MAX_IPS_TOTAL_SCAN_BYTES =
	Number.parseInt(process.env.NYXGUARD_IPS_MAX_SCAN_BYTES ?? "", 10) || 512 * 1024 * 1024;
const SUMMARY_CACHE_TTL_MS = Number.parseInt(process.env.NYXGUARD_SUMMARY_CACHE_TTL_MS ?? "", 10) || 2000;
const IPS_CACHE_TTL_MS = Number.parseInt(process.env.NYXGUARD_IPS_CACHE_TTL_MS ?? "", 10) || 2000;
const LONG_WINDOW_MINUTES = 7 * 24 * 60;
const LONG_SUMMARY_CACHE_TTL_MS =
	Number.parseInt(process.env.NYXGUARD_LONG_SUMMARY_CACHE_TTL_MS ?? "", 10) || 60000;
const ATTACKS_SUMMARY_CACHE_TTL_MS =
	Number.parseInt(process.env.NYXGUARD_ATTACKS_SUMMARY_CACHE_TTL_MS ?? "", 10) || 15000;
const ROUTE_CACHE_MAX_ENTRIES = 128;
const routeResultCache = new Map(); // key -> { expiresAt: number, value: any }
const routeInflight = new Map(); // key -> Promise<any>

function whereRuleIsCurrentlyActive(qb) {
	qb.where("enabled", 1).andWhere((inner) => {
		inner.whereNull("expires_on").orWhere("expires_on", ">", db().fn.now());
	});
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

function clearAttackRouteCache() {
	for (const key of routeResultCache.keys()) {
		if (key.startsWith("attacks:") || key.startsWith("rate-status:")) {
			routeResultCache.delete(key);
		}
	}
}

function attackBanExpiresOn(duration) {
	const now = Date.now();
	if (duration === "permanent") return null;
	if (duration === "7d") return new Date(now + 7 * 24 * 60 * 60 * 1000);
	if (duration === "30d") return new Date(now + 30 * 24 * 60 * 60 * 1000);
	return new Date(now + 24 * 60 * 60 * 1000);
}

function attackTypeFromAutoBanNote(note) {
	const m = String(note ?? "").match(/^Auto-ban:\s*([a-z0-9_-]+)/i);
	if (!m) return null;
	const t = m[1].toLowerCase();
	if (t === "sqli" || t === "ddos" || t === "bot" || t === "authfail") return t;
	return null;
}

function isAutoBanNote(note) {
	return /^Auto-ban:/i.test(String(note ?? "").trim());
}

function isAttackDerivedBanNote(note) {
	const s = String(note ?? "").trim();
	return /^Auto-ban:/i.test(s) || /^Manual ban \(Attacks\)$/i.test(s);
}

function isVisibleAttackType(type) {
	return type === "sqli" || type === "ddos" || type === "bot" || type === "authfail";
}

function whereAttackDerivedRule(qb) {
	qb.where("note", "like", "Auto-ban:%").orWhere("note", "Manual ban (Attacks)");
}

async function latestAttackTypeByIp(knex, ips) {
	const normalizedIps = [...new Set(ips.filter(Boolean))];
	if (!normalizedIps.length) return new Map();
	const rows = await knex("nyxguard_attack_event")
		.select("ip", "attack_type")
		.max({ lastSeen: "created_on" })
		.whereIn("ip", normalizedIps)
		.whereIn("attack_type", ["sqli", "ddos", "bot", "authfail"])
		.groupBy("ip", "attack_type")
		.orderBy("lastSeen", "desc");
	const byIp = new Map();
	for (const row of rows) {
		if (byIp.has(row.ip) || !isVisibleAttackType(row.attack_type)) continue;
		byIp.set(row.ip, row.attack_type);
	}
	return byIp;
}

function attackTypeForBanRule(row, latestTypeByIp = new Map()) {
	const type = attackTypeFromAutoBanNote(row.note) ?? latestTypeByIp.get(row.ip_cidr);
	if (isVisibleAttackType(type)) return type;
	return isAttackDerivedBanNote(row.note) ? "bot" : null;
}

function ruleBanStatus(row) {
	const expiresMs = row.expires_on ? Date.parse(String(row.expires_on)) : null;
	if (row.enabled && (expiresMs === null || (Number.isFinite(expiresMs) && expiresMs > Date.now()))) return "active";
	if (expiresMs !== null && Number.isFinite(expiresMs) && expiresMs <= Date.now()) return "expired";
	if (!row.enabled) return "disabled";
	return "inactive";
}

function banPayload(row, { displayRecorded = false } = {}) {
	const status = ruleBanStatus(row);
	return {
		ruleId: row.id,
		// Existing frontend builds only render the ban text when this field is true.
		// Recorded attack-derived ban rows should still show their recorded duration
		// in Threat Activity, even after expiry/disable, so expose explicit status too.
		enabled: displayRecorded ? true : status === "active",
		currentlyActive: status === "active",
		status,
		expiresOn: row.expires_on ? new Date(row.expires_on).toISOString() : null,
		modifiedOn: row.modified_on,
		note: row.note ?? null,
	};
}

async function requireAttackBanPermission(access) {
	try {
		await access.can("nyxguard:update");
		return;
	} catch (nyxGuardErr) {
		try {
			await access.can("settings:manage");
			return;
		} catch {
			throw nyxGuardErr;
		}
	}
}

async function requireNyxGuardView(_req, res, next) {
	try {
		await res.locals.access.can("nyxguard:list");
		next();
	} catch (err) {
		next(err);
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

function cacheTtlForWindow(minutes, baseTtlMs) {
	if (minutes > LONG_WINDOW_MINUTES) return LONG_SUMMARY_CACHE_TTL_MS;
	if (minutes >= 7 * 24 * 60) return Math.max(baseTtlMs, 15000);
	return baseTtlMs;
}

function hostNameFromProxyRow(row) {
	try {
		const meta = JSON.parse(row?.meta || "{}");
		if (meta.nyxguard_app_name) return String(meta.nyxguard_app_name);
	} catch {
		// ignore bad metadata
	}
	try {
		const domains = JSON.parse(row?.domain_names || "[]");
		if (Array.isArray(domains) && domains[0]) return String(domains[0]);
	} catch {
		// ignore bad domain JSON
	}
	return `host-${row?.id ?? "unknown"}`;
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
		const [dmy, hms] =
			dt.split(":").length > 1 ? [dt.split(":").slice(0, 1)[0], dt.split(":").slice(1).join(":")] : [null, null];
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
	if (!v || v === "-") return null;
	const n = /^\d+$/.test(v) ? Number(v) : NaN;
	return Number.isSafeInteger(n) && n >= 0 ? n : null;
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
	clearHistoricalLogCache();
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
				/(?:_access\.log(?:\.\d+)?(?:\.gz)?$)|(?:fallback_http_access\.log(?:\.\d+)?(?:\.gz)?$)/.test(
					entry.name,
				);
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

function scanLogFile(options) { return scanAccessLog(options,parseAccessLine); }

async function buildSummary({minutes,limit,offset=0,asOf}) {
 const files=await listProxyHostAccessLogFiles(process.env.NYXGUARD_LOG_DIR||'/data/logs');
 return accessSummary({minutes,limit,offset,now:asOf??Date.now()},{files,scan:scanLogFile});
}

async function buildIps({ minutes, limit }) {
	const logDir = process.env.NYXGUARD_LOG_DIR || "/data/logs";
	const now = Date.now();
	const sinceMs = now - minutes * 60 * 1000;
	const files = await listProxyHostAccessLogFiles(logDir);
	const maxBytes = minutes > 60 ? MAX_BYTES_PER_FILE_24H : MAX_BYTES_PER_FILE;
	const scanAll = true;
	const maxTotalScanBytes = minutes > LONG_WINDOW_MINUTES ? MAX_IPS_TOTAL_SCAN_BYTES : MAX_TOTAL_SCAN_BYTES;
	let totalScanBytes = 0;

	const byIp = new Map(); // ip -> {ip, requests, blocked, allowed, lastTs, hosts:Set, country}

	for (const f of files) {
		if (f.mtimeMs < sinceMs && !f.name.endsWith("_access.log")) {
			continue;
		}
		

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
			if(err.code!=="ENOENT")throw err;
			debug(logger, `nyxguard: log rotated during scan`);
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
		total: byIp.size,
		limited: byIp.size > limit,
		truncated: false,
		source: "access_logs",
	};
}

async function buildLongIpsFromAttackEvents({ minutes, limit }) {
	const now = Date.now();
	const since = new Date(now - minutes * 60 * 1000);
	const rows = await db()("nyxguard_attack_event")
		.where("created_on", ">=", since)
		.select("ip")
		.count({ requests: "*" })
		.sum({ blocked: db().raw("CASE WHEN status >= 400 THEN 1 ELSE 0 END") })
		.max({ lastSeen: "created_on" })
		.select(db().raw("GROUP_CONCAT(DISTINCT host ORDER BY host SEPARATOR ',') as hosts"))
		.groupBy("ip")
		.orderBy("requests", "desc")
		.limit(limit);

	const items = rows.map((row) => {
		const requests = Number(row.requests ?? 0);
		const blocked = Number(row.blocked ?? 0);
		return {
			ip: row.ip,
			requests,
			allowed: Math.max(0, requests - blocked),
			blocked,
			lastSeen: row.lastSeen ? new Date(row.lastSeen).toISOString() : null,
			hosts: String(row.hosts || "")
				.split(",")
				.filter(Boolean)
				.slice(0, 10),
			country: null,
		};
	});

	return {
		windowMinutes: minutes,
		now: new Date(now).toISOString(),
		items,
		truncated: false,
		source: "attack_event",
	};
}

/**
 * /api/nyxguard/summary
 */
router
	.route("/summary")
	.options((_, res) => res.sendStatus(204))
	.all(jwtdecode())
	.all(requireNyxGuardView)
	.get(async (req, res, next) => {
		try {
			const data = await validator(
				{
					additionalProperties: false,
					properties: {
                        asOf:{type:"integer",minimum:0,maximum:8640000000000000},
						minutes: { type: "integer", minimum: 1, maximum: MAX_LIVE_TRAFFIC_MINUTES },
						limit: { type: "integer", minimum: 1, maximum: 1000 },
						offset: { type: "integer", minimum: 0, maximum: 100000 },
					},
				},
				{
					...(req.query.asOf!==undefined?{asOf:Number(req.query.asOf)}:{}),
                    minutes: req.query.minutes ? Number.parseInt(String(req.query.minutes), 10) : DEFAULT_MINUTES,
					limit: req.query.limit ? Number.parseInt(String(req.query.limit), 10) : 50,
					offset: req.query.offset ? Number.parseInt(String(req.query.offset), 10) : 0,
				},
			);
			if(data.asOf!==undefined&&(data.asOf>Date.now()||data.asOf<Date.now()-300000))throw new errs.ValidationError('Traffic reference time must be within the last five minutes');
            const cacheKey = `summary:${data.minutes}:${data.limit}:${data.offset}:${data.asOf??'live'}`;
			const summary = await withRouteCache(cacheKey, cacheTtlForWindow(data.minutes, SUMMARY_CACHE_TTL_MS), () =>
				buildSummary({ minutes: data.minutes, limit: data.limit, offset: data.offset,asOf:data.asOf }),
			);
			res.status(200).send(summary);
		} catch (err) {
			debug(logger, `${req.method.toUpperCase()} ${req.path}: ${err}`);
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
	.all(requireNyxGuardView)
	.get(async (req, res, next) => {
		try {
			const data = await validator(
				{
					additionalProperties: false,
					properties: {
						minutes: { type: "integer", minimum: 1, maximum: MAX_IPS_MINUTES },
						limit: { type: "integer", minimum: 1, maximum: 50000 },
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
	.all(requireNyxGuardView)
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

			const cacheKey = `attacks-summary:${data.minutes}`;
			const result = await withRouteCache(cacheKey, cacheTtlForWindow(data.minutes, ATTACKS_SUMMARY_CACHE_TTL_MS), async () => {
				const since = new Date(Date.now() - data.minutes * 60 * 1000);
				const knex = db();
				const rows = await knex("nyxguard_attack_event")
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

					const attackBanRows = await knex("nyxguard_ip_rule")
						.select("ip_cidr", "note", "created_on", "modified_on", "expires_on")
						.andWhere("action", "deny")
						.andWhere(whereRuleIsCurrentlyActive)
						.andWhere(whereAttackDerivedRule);
				const attackTypeByIp = await latestAttackTypeByIp(
					knex,
					attackBanRows.filter((row) => !isAutoBanNote(row.note)).map((row) => row.ip_cidr),
				);
				const attackBanKeys = new Set();
				for (const row of attackBanRows) {
					const t = attackTypeForBanRule(row, attackTypeByIp);
					if (!(t === "sqli" || t === "ddos" || t === "bot")) continue;
					attackBanKeys.add(`${row.ip_cidr}|${t}`);
				}
				const eventKeys = rows.length
					? new Set(
							(
								await knex("nyxguard_attack_event")
									.select("ip", "attack_type")
									.where("created_on", ">=", since)
									.groupBy("ip", "attack_type")
							).map((r) => `${r.ip}|${r.attack_type}`),
						)
					: new Set();
				for (const key of attackBanKeys) {
					if (eventKeys.has(key)) continue;
					const t = key.split("|")[1];
					byType[t] = (byType[t] || 0) + 1;
					total += 1;
				}

				let last = await knex("nyxguard_attack_event")
					.select("attack_type", "ip", "created_on")
					.where("created_on", ">=", since)
					.orderBy("created_on", "desc")
					.first();
				if (!last && attackBanRows.length) {
					const latestRule = attackBanRows
						.map((row) => {
							const type = attackTypeForBanRule(row, attackTypeByIp);
							const ts = row.modified_on ?? row.created_on ?? row.expires_on;
							return type ? { attack_type: type, ip: row.ip_cidr, created_on: ts } : null;
						})
						.filter(Boolean)
						.sort((a, b) => Date.parse(String(b.created_on ?? "")) - Date.parse(String(a.created_on ?? "")))[0];
					last = latestRule ?? null;
				}

				return {
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
				};
			});

			res.status(200).send(result);
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
	.all(requireNyxGuardView)
	.get(async (req, res, next) => {
		try {
			const data = await validator(
				{
					additionalProperties: false,
					properties: {
						days: { type: "integer", enum: [0, 1, 7, 30, 180, 365] },
						limit: { type: "integer", minimum: 1, maximum: 500 },
						offset: { type: "integer", minimum: 0, maximum: 1000000 },
						type: { type: "string", enum: ["sqli", "ddos", "bot"] },
						search: { type: "string", maxLength: 255 },
						min_count: { type: "integer", minimum: 0, maximum: 2147483647 },
						sort: { type: "string", enum: ["ip", "type", "count", "lastSeen"] },
						order: { type: "string", enum: ["asc", "desc"] },
					},
				},
				{
					days: req.query.days ? Number.parseInt(String(req.query.days), 10) : 1,
					limit: req.query.limit ? Number.parseInt(String(req.query.limit), 10) : 200,
					offset: req.query.offset ? Number.parseInt(String(req.query.offset), 10) : 0,
					type: req.query.type ? String(req.query.type) : undefined,
					search: req.query.search ? String(req.query.search).trim() : "",
					min_count: req.query.min_count ? Number.parseInt(String(req.query.min_count), 10) : 0,
					sort: req.query.sort ? String(req.query.sort) : "count",
					order: req.query.order ? String(req.query.order) : "desc",
				},
			);

			const cacheKey = [
				"attacks",
				data.days,
				data.limit,
				data.offset,
				data.type ?? "all",
				data.search,
				data.min_count,
				data.sort,
				data.order,
			].join(":");
			const result = await withRouteCache(cacheKey, cacheTtlForWindow(data.days * 24 * 60, ATTACKS_SUMMARY_CACHE_TTL_MS), async () => {
				const knex = db();
				const since = data.days === 0 ? new Date(0) : new Date(Date.now() - data.days * 24 * 60 * 60 * 1000);

				// Preserve the established operator-view semantics: current attack-derived
				// bans remain visible even when their source event has left the selected window.
				const attackBanRows = await knex("nyxguard_ip_rule")
					.select("id", "ip_cidr", "enabled", "expires_on", "created_on", "modified_on", "note")
					.andWhere("action", "deny")
					.andWhere(whereRuleIsCurrentlyActive)
					.andWhere(whereAttackDerivedRule)
					.orderBy("id", "desc");
				const activeAttackTypeByIp = await latestAttackTypeByIp(
					knex,
					attackBanRows.filter((row) => !isAutoBanNote(row.note)).map((row) => row.ip_cidr),
				);
				const activeBans = attackBanRows
					.map((row) => ({
						ip: row.ip_cidr,
						type: attackTypeForBanRule(row, activeAttackTypeByIp),
						lastSeen: row.modified_on ?? row.created_on,
					}))
					.filter((row) => row.ip && row.type && row.lastSeen);

				const page = await buildThreatActivityPage(knex, {
					since,
					limit: data.limit,
					offset: data.offset,
					type: data.type,
					search: data.search,
					minCount: data.min_count,
					sort: data.sort,
					order: data.order,
					activeBans,
				});

				const pageIps = [...new Set(page.items.map((item) => item.ip).filter(Boolean))];
				const denyRows = pageIps.length
					? await knex("nyxguard_ip_rule")
							.select("id", "ip_cidr", "enabled", "expires_on", "created_on", "modified_on", "note")
							.whereIn("ip_cidr", pageIps)
							.andWhere("action", "deny")
							.andWhere(whereRuleIsCurrentlyActive)
							.orderBy("id", "desc")
					: [];
				const banByIp = new Map();
				for (const row of denyRows) {
					if (!banByIp.has(row.ip_cidr)) banByIp.set(row.ip_cidr, row);
				}
				const attackBanByKey = new Map();
				for (const row of attackBanRows) {
					const rowType = attackTypeForBanRule(row, activeAttackTypeByIp);
					const key = `${row.ip_cidr}|${rowType}`;
					if (rowType && !attackBanByKey.has(key)) attackBanByKey.set(key, row);
				}

				const items = page.items.map((item) => {
					const attackRule = attackBanByKey.get(`${item.ip}|${item.type}`);
					const generalRule = banByIp.get(item.ip);
					return {
						ip: item.ip,
						type: item.type,
						count: item.count,
						lastSeen: item.lastSeen,
						ban: attackRule
							? banPayload(attackRule, { displayRecorded: true })
							: generalRule
								? banPayload(generalRule)
								: null,
						...(item.banOnly ? { source: "active_attack_ban" } : {}),
					};
				});

				return { days: data.days, items, total: page.total, limit: data.limit, offset: data.offset };
			});

			res.status(200).send(result);
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
	.all(requireNyxGuardView)
	.all(async (req, res, next) => {
		if (req.method !== "PUT" && req.method !== "POST") {
			res.set("Allow", "OPTIONS, PUT, POST");
			res.sendStatus(405);
			return;
		}
		try {
			await requireAttackBanPermission(res.locals.access);

			const body = req.body ?? {};
			const data = await validator(
				{
					required: ["ip", "duration"],
					additionalProperties: false,
					properties: {
						ip: { type: "string" },
						duration: { type: "string", enum: ["24h", "7d", "30d", "permanent"] },
					},
				},
				{
					ip: body.ip,
					duration: body.duration,
				},
			);

			const normalizedIp = sanitizeCidr(data.ip);
			if (!normalizedIp || normalizedIp.includes("/") || !net.isIP(normalizedIp)) {
				throw new errs.ValidationError("ip must be a valid IPv4/IPv6 address");
			}

			const expiresOn = attackBanExpiresOn(data.duration);
			let ruleId = null;

			await db().transaction(async (trx) => {
				const activeRows = await trx("nyxguard_ip_rule")
					.where({ ip_cidr: normalizedIp, action: "deny" })
					.andWhere((qb) => {
						qb.where("enabled", 1).andWhere((inner) => {
							inner.whereNull("expires_on").orWhere("expires_on", ">", trx.fn.now());
						});
					})
					.orderBy("id", "desc");

				const existing =
					activeRows[0] ??
					(await trx("nyxguard_ip_rule").where({ ip_cidr: normalizedIp, action: "deny" }).orderBy("id", "desc").first());

				if (!existing) {
					const [id] = await trx("nyxguard_ip_rule").insert({
						enabled: 1,
						action: "deny",
						ip_cidr: normalizedIp,
						note: "Manual ban (Attacks)",
						rule_origin: "manual",
						expires_on: expiresOn,
						created_on: trx.fn.now(),
						modified_on: trx.fn.now(),
					});
					ruleId = id;
				} else {
					ruleId = existing.id;
					await trx("nyxguard_ip_rule").where({ id: existing.id }).update({
						enabled: 1,
						note: "Manual ban (Attacks)",
						rule_origin: "manual",
						expires_on: expiresOn,
						modified_on: trx.fn.now(),
					});
					const duplicateActiveIds = activeRows.map((row) => row.id).filter((id) => id !== existing.id);
					if (duplicateActiveIds.length) {
						await trx("nyxguard_ip_rule").whereIn("id", duplicateActiveIds).update({
							enabled: 0,
							modified_on: trx.fn.now(),
						});
					}
				}
			});

			await internalNyxGuard.nginx.apply(db());
			clearAttackRouteCache();
			logger.info(
				`NyxGuard attack ban adjusted: ip=${normalizedIp} duration=${data.duration} rule=${ruleId ?? "unknown"}`,
			);
			res.status(200).send({
				ip: normalizedIp,
				duration: data.duration,
				expiresOn: expiresOn ? expiresOn.toISOString() : null,
				ruleId,
			});
		} catch (err) {
			debug(logger, `${req.method} /api/nyxguard/attacks/ban: ${err}`);
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
	.all(requireNyxGuardView)
	.get(async (_req, res, next) => {
		try {
			const rows = await internalProxyHost.getAll(res.locals.access, null, null, {securityView:true});
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
			const items = rows.map((r) => {
				const rawAppName = r?.meta?.nyxguardAppName ?? r?.meta?.nyxguard_app_name;
				const appName = typeof rawAppName === "string" ? rawAppName.trim() : "";
				return {
					id: r.id,
					enabled: !!r.enabled,
					configurationApplied: !!r.enabled && r.meta?.nginx_online === true,
					applicationState: !r.enabled ? "disabled" : r.meta?.nginx_online === true ? "applied" : r.meta?.nginx_online === false ? "apply_failed" : "unknown",
					domains: r.domain_names ?? [],
					appName: appName || null,
					forwardHost: r.forward_host ?? null,
					forwardPort: r.forward_port ?? null,
					wafEnabled: internalNyxGuard.waf.isEnabledInAdvancedConfig(r.advanced_config),
					botDefenseEnabled: internalNyxGuard.botDefense.isEnabledInAdvancedConfig(r.advanced_config),
					ddosEnabled: internalNyxGuard.ddos.isEnabledInAdvancedConfig(r.advanced_config),
					sqliEnabled: internalNyxGuard.sqli.isEnabledInAdvancedConfig(r.advanced_config),
					authBypassEnabled: authBypassById.has(r.id) ? authBypassById.get(r.id) : true,
				};
			});
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
	.all(requireNyxGuardView)
	.get(async (_req, res, next) => {
		try {
			const accessData = await res.locals.access.can("nyxguard:list");
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
			const protectedIds = [];
			for (const r of rows) {
				if (internalNyxGuard.waf.isEnabledInAdvancedConfig(r.advanced_config)) {
					protectedCount += 1;
					protectedIds.push(r.id);
				}
			}

			let authBypassProtectedCount = protectedIds.length;
			if (protectedIds.length) {
				try {
					const appRows = await db()("nyxguard_app")
						.select("proxy_host_id", "auth_bypass_enabled")
						.whereIn("proxy_host_id", protectedIds);
					const byId = new Map(appRows.map((r) => [r.proxy_host_id, !!r.auth_bypass_enabled]));
					authBypassProtectedCount = 0;
					for (const id of protectedIds) {
						const enabled = byId.has(id) ? byId.get(id) : true;
						if (enabled) authBypassProtectedCount += 1;
					}
				} catch {
					// ignore: schema may not be migrated yet
				}
			}

			res.status(200).send({
				totalApps: rows.length,
				protectedCount,
				authBypassProtectedCount,
			});
		} catch (err) {
			debug(logger, `GET /api/nyxguard/apps/summary: ${err}`);
			next(err);
		}
	});

/**
 * /api/nyxguard/logs/clear
 */
router
	.route("/logs/clear")
	.options((_, res) => res.sendStatus(204))
	.all(jwtdecode())
	.all(requireNyxGuardView)
	.post(async (req, res, next) => {
		try {
			await res.locals.access.can("nyxguard:update");
			const body = req.body ?? {};
			const data = await validator(
				{
					required: ["target"],
					additionalProperties: false,
					properties: {
						target: { type: "string", enum: ["traffic", "ips", "attacks"] },
						minutes: { type: "integer", minimum: 1, maximum: MAX_IPS_MINUTES },
						days: { type: "integer", enum: [0, 1, 7, 30, 60, 90] },
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
				let clearedBanRules = 0;
				if (data.target === "attacks") {
					deletedRows = await db()("nyxguard_attack_event").del();
					clearedBanRules = await db()("nyxguard_ip_rule")
						.where({ action: "deny", enabled: 1 })
						.andWhere(whereAttackDerivedRule)
						.update({
							enabled: 0,
							modified_on: db().fn.now(),
						});
					if (clearedBanRules > 0) {
						await internalNyxGuard.nginx.apply(db());
					}
				} else {
					const logDir = process.env.NYXGUARD_LOG_DIR || "/data/logs";
					clearedFiles = await clearNyxGuardAccessLogs(logDir);
				}

			routeResultCache.clear();
			res.status(200).send({
					target: data.target,
					deletedRows,
					clearedFiles,
					clearedBanRules,
				});
		} catch (err) {
			debug(logger, `POST /api/nyxguard/logs/clear: ${err}`);
			next(err);
		}
	});

/**
 * /api/nyxguard/rate-status
 *
 * Returns top attacking IPs from the last 5 minutes with attack counts by type,
 * ban status, and the configured thresholds — used by the Rate Limiting Dashboard.
 */
router
	.route("/rate-status")
	.options((_, res) => res.sendStatus(204))
	.all(jwtdecode())
	.all(requireNyxGuardView)
	.get(async (_req, res, next) => {
		try {
			await res.locals.access.can("nyxguard:list");

			const windowMs = 5 * 60 * 1000;
			const since = new Date(Date.now() - windowMs);
			const limit = 20;

			// Fetch attack events from the last 5 minutes, grouped by IP + type.
			const rows = await db()("nyxguard_attack_event")
				.select("ip", "attack_type")
				.count({ count: "*" })
				.where("created_on", ">=", since)
				.groupBy("ip", "attack_type")
				.orderBy("count", "desc");

			// Aggregate by IP.
			const byIp = new Map();
			for (const r of rows) {
				const ip = r.ip;
				const count = Number.parseInt(String(r.count ?? "0"), 10) || 0;
				const t = r.attack_type;
				if (!byIp.has(ip)) byIp.set(ip, { ip, total: 0, byType: { sqli: 0, ddos: 0, bot: 0, authfail: 0 } });
				const entry = byIp.get(ip);
				entry.total += count;
				if (t in entry.byType) entry.byType[t] += count;
			}

			// Sort by total desc, take top N.
			const sorted = [...byIp.values()].sort((a, b) => b.total - a.total).slice(0, limit);

			// Fetch ban state for these IPs.
			const ips = sorted.map((e) => e.ip);
			const banRows = ips.length
				? await db()("nyxguard_ip_rule")
						.whereIn("ip_cidr", ips)
						.where("action", "deny")
						.andWhere(whereRuleIsCurrentlyActive)
						.select("ip_cidr", "expires_on")
			: [];
			const bannedSet = new Map();
			for (const r of banRows) {
				if (!bannedSet.has(r.ip_cidr)) bannedSet.set(r.ip_cidr, r.expires_on ? new Date(r.expires_on).toISOString() : null);
			}

			// Load current thresholds from settings.
			const settings = await internalNyxGuard.settings.get(db());

			res.status(200).send({
				windowMinutes: 5,
				thresholds: {
					ddosRateRps: settings.ddosRateRps,
					ddosBurst: settings.ddosBurst,
					ddosConnLimit: settings.ddosConnLimit,
					bot: settings.authfailThreshold,
					authfail: settings.authfailThreshold,
				},
				items: sorted.map((e) => ({
					ip: e.ip,
					total: e.total,
					byType: e.byType,
					banned: bannedSet.has(e.ip),
					bannedUntil: bannedSet.get(e.ip) ?? null,
				})),
			});
		} catch (err) {
			debug(logger, `GET /api/nyxguard/rate-status: ${err}`);
			next(err);
		}
	});

export default router;
