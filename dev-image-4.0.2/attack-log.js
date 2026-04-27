import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import readline from "node:readline";
import zlib from "node:zlib";
import express from "express";
import db from "../../db.js";
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

const DEFAULT_MINUTES = 15;
const MAX_BYTES_PER_FILE = 2 * 1024 * 1024; // enough for many recent requests without scanning large logs
const MAX_BYTES_PER_FILE_24H = 10 * 1024 * 1024;
const MAX_LIVE_TRAFFIC_MINUTES = 180 * 24 * 60;
const MAX_IPS_MINUTES = 180 * 24 * 60;
const MAX_ATTACKS_MINUTES = 180 * 24 * 60;
const MAX_TOTAL_SCAN_BYTES = 80 * 1024 * 1024; // safety cap for long windows
const SUMMARY_CACHE_TTL_MS = Number.parseInt(process.env.NYXGUARD_SUMMARY_CACHE_TTL_MS ?? "", 10) || 2000;
const IPS_CACHE_TTL_MS = Number.parseInt(process.env.NYXGUARD_IPS_CACHE_TTL_MS ?? "", 10) || 2000;
const ROUTE_CACHE_MAX_ENTRIES = 128;
const routeResultCache = new Map(); // key -> { expiresAt: number, value: any }
const routeInflight = new Map(); // key -> Promise<any>

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
		const rl = readline.createInterface({ input, crlfDelay: Number.POSITIVE_INFINITY });

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
						perHost.set(ev.host, {
							total: 0,
							allowed: 0,
							blocked: 0,
							rxBytes: 0,
							txBytes: 0,
							ips: new Set(),
						});
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
							perHost.set(ev.host, {
								total: 0,
								allowed: 0,
								blocked: 0,
								rxBytes: 0,
								txBytes: 0,
								ips: new Set(),
							});
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
						.andWhere("enabled", 1)
						.andWhere((qb) => qb.whereNull("expires_on").orWhere("expires_on", ">", db().fn.now()))
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
				await db()("nyxguard_ip_rule").where({ id: existing.id }).update({
					enabled: 1,
					expires_on: expiresOn,
					modified_on: db().fn.now(),
				});
			}

			await internalNyxGuard.nginx.apply(db());
			res.status(200).send({
				ip: data.ip,
				duration: data.duration,
				expiresOn: expiresOn ? expiresOn.toISOString() : null,
			});
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
			const items = rows.map((r) => {
				const rawAppName = r?.meta?.nyxguardAppName ?? r?.meta?.nyxguard_app_name;
				const appName = typeof rawAppName === "string" ? rawAppName.trim() : "";
				return {
					id: r.id,
					enabled: !!r.enabled,
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
	.get(async (_req, res, next) => {
		try {
			await res.locals.access.can("proxy_hosts:list");

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
						.where("enabled", 1)
						.andWhere((qb) => qb.whereNull("expires_on").orWhere("expires_on", ">", db().fn.now()))
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
