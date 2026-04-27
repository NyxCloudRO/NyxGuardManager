import fs from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import { lookup, reverse } from "node:dns/promises";
import db from "../db.js";
import { global as logger } from "../logger.js";
import internalNotifications from "./notifications.js";
import internalNyxGuard from "./nyxguard.js";
import { getTrustedSelfIpSet, isPrivateOrInternalIp } from "./trusted-ips.js";

const DEFAULT_ATTACK_LOG = "/data/logs/nyxguard_attacks.log";
const _envPollMs = parseInt(process.env.NYXGUARD_POLL_INTERVAL_MS ?? "", 10);
const DEFAULT_POLL_MS = Number.isFinite(_envPollMs)
	? Math.min(60_000, Math.max(1_000, _envPollMs))
	: 15_000;
const MAX_READ_BYTES = 4 * 1024 * 1024;
const RETENTION_DAYS = 30;
// NOTE: recentCounts is in-memory and resets on restart. A threshold > 1 means an attacker
// can split their requests across restarts to avoid banning. Keeping the threshold at 1
// ensures a single detected event triggers a ban regardless of restart timing.
const DEFAULT_AUTOBAN_THRESHOLD = 1;
const DEFAULT_AUTOBAN_WINDOW_SEC = 120;
const DEFAULT_AUTOBAN_BAN_HOURS = 24;
const BOT_AUTOBAN_THRESHOLD = 1;
const BOT_AUTOBAN_BAN_HOURS = 24;
const DDOS_AUTOBAN_THRESHOLD = 1;
const DDOS_AUTOBAN_BAN_HOURS = 24;
const SQLI_AUTOBAN_THRESHOLD = 1;
const SQLI_AUTOBAN_BAN_HOURS = 24;
const RECENT_COUNTS_PRUNE_EVERY_MS = 60_000;
const RECENT_COUNTS_STALE_AFTER_MS = 30 * 60 * 1000;
const RECENT_COUNTS_MAX_EVENTS_PER_KEY = 2048;
const SEO_SAFE_MODE = process.env.NYXGUARD_SEO_SAFE_MODE !== "0";
const SEO_VERIFY_TIMEOUT_MS = Number.parseInt(process.env.NYXGUARD_SEO_VERIFY_TIMEOUT_MS ?? "", 10) || 1500;
const SEO_CRAWLER_ALLOW_HOURS = Number.parseInt(process.env.NYXGUARD_SEO_CRAWLER_ALLOW_HOURS ?? "", 10) || 24;
const CRAWLER_VERIFY_CACHE_TTL_MS = Number.parseInt(process.env.NYXGUARD_SEO_VERIFY_CACHE_TTL_MS ?? "", 10) || 300000;

let timer = null;
let lastReloadMs = 0;
let lastRecentCountsPruneMs = 0;
const recentCounts = new Map(); // key: type|ip -> { tsMs: number[] }
const crawlerVerifyCache = new Map(); // key: ip -> { ok: boolean, expiresAtMs: number }
// Track bans that were created but whose nginx reload was rate-limited and skipped.
// On the next poll we retry the reload even if no new bans occurred.
let pendingReload = false;

function isValidAttackType(t) {
	return t === "sqli" || t === "ddos" || t === "bot" || t === "authfail";
}

function shouldAutoBan(type) {
	if (process.env.NYXGUARD_AUTOBAN_FORCE_OFF === "1") return false;
	if (type === "authfail") return process.env.NYXGUARD_AUTOBAN_AUTHFAIL !== "0";
	return true;
}

function recordAndShouldBan(type, ip, tsMs, { threshold, windowSec }) {
	const windowMs = Math.max(5, windowSec) * 1000;

	const key = `${type}|${ip}`;
	const cur = recentCounts.get(key) || { tsMs: [] };
	cur.tsMs.push(tsMs);
	const cutoff = tsMs - windowMs;
	// Keep only timestamps within the window without allocating a new array every event.
	let firstValidIdx = 0;
	while (firstValidIdx < cur.tsMs.length && cur.tsMs[firstValidIdx] < cutoff) {
		firstValidIdx += 1;
	}
	if (firstValidIdx > 0) cur.tsMs.splice(0, firstValidIdx);
	// Bound per-key memory even under sustained attack traffic.
	if (cur.tsMs.length > RECENT_COUNTS_MAX_EVENTS_PER_KEY) {
		cur.tsMs.splice(0, cur.tsMs.length - RECENT_COUNTS_MAX_EVENTS_PER_KEY);
	}
	recentCounts.set(key, cur);

	return cur.tsMs.length >= threshold;
}

function pruneRecentCounts(nowMs) {
	if (nowMs - lastRecentCountsPruneMs < RECENT_COUNTS_PRUNE_EVERY_MS) return;
	lastRecentCountsPruneMs = nowMs;
	const staleCutoff = nowMs - RECENT_COUNTS_STALE_AFTER_MS;
	for (const [key, value] of recentCounts.entries()) {
		const ts = value?.tsMs;
		if (!Array.isArray(ts) || ts.length === 0 || ts[ts.length - 1] < staleCutoff) {
			recentCounts.delete(key);
		}
	}
}

function parseJsonLine(line) {
	const s = String(line ?? "").trim();
	if (!s) return null;
	try {
		const obj = JSON.parse(s);
		if (!obj || typeof obj !== "object") return null;
		if (!isValidAttackType(obj.type)) return null;
		if (typeof obj.ip !== "string" || !net.isIP(obj.ip)) return null;
		if (typeof obj.ts !== "string") return null;
		const ms = Date.parse(obj.ts);
		if (!Number.isFinite(ms)) return null;
		const auth = obj.auth === true || obj.auth === 1 || obj.auth === "1";
		return {
			tsMs: ms,
			ip: obj.ip,
			type: obj.type,
			host: typeof obj.host === "string" ? obj.host : null,
			method: typeof obj.method === "string" ? obj.method : null,
			uri: typeof obj.uri === "string" ? obj.uri : null,
			status: typeof obj.status === "number" ? obj.status : null,
			ua: typeof obj.ua === "string" ? obj.ua : null,
			ref: typeof obj.ref === "string" ? obj.ref : null,
			auth,
		};
	} catch {
		return null;
	}
}

function webThreatRuleForAttack(type) {
	switch (type) {
		case "sqli":
			return {
				ruleId: "inbound.sqli",
				reason: "SQL injection protection matched",
			};
		case "ddos":
			return {
				ruleId: "inbound.ddos",
				reason: "DDoS/rate-limit protection matched",
			};
		case "bot":
			return {
				ruleId: "inbound.bot",
				reason: "Bot defense protection matched",
			};
		case "authfail":
			return {
				ruleId: "inbound.authfail",
				reason: "Failed-login protection matched",
			};
		default:
			return null;
	}
}

async function insertWebThreatEventForAttack(knex, ev) {
	const mapped = webThreatRuleForAttack(ev.type);
	if (!mapped) return;

	const ts = new Date(ev.tsMs);
	const meta = {
		host: ev.host,
		method: ev.method,
		uri: ev.uri,
		status: ev.status,
		userAgent: ev.ua,
		referer: ev.ref,
		source: "nyxguard_attack_monitor",
	};

	try {
		const existing = await knex("web_threat_events")
			.where({
				ts,
				category: "inbound",
				rule_id: mapped.ruleId,
				action: "block",
				src_ip: ev.ip,
			})
			.first();
		if (existing) return;

		await knex("web_threat_events").insert({
			ts,
			app_id: null,
			route_id: null,
			category: "inbound",
			rule_id: mapped.ruleId,
			action: "block",
			reason: mapped.reason,
			src_ip: ev.ip,
			request_id: null,
			meta: JSON.stringify(meta),
		});
	} catch {
		// Ignore if the web threat migration is not present or an insert races.
	}
}

function normalizeHostForRule(host) {
	const h = String(host ?? "")
		.trim()
		.toLowerCase();
	if (!h) return "";
	return h.replace(/[^a-z0-9.-]/g, "");
}

function buildAutoBanNote(type, host) {
	const h = normalizeHostForRule(host);
	return h ? `Auto-ban: ${type}; host=${h}` : `Auto-ban: ${type}`;
}

function crawlerLabelFromUa(ua) {
	const s = String(ua ?? "").toLowerCase();
	if (!s) return null;
	if (s.includes("googlebot") || s.includes("google-inspectiontool") || s.includes("adsbot-google")) {
		return "google";
	}
	return null;
}

function runWithTimeout(promise, timeoutMs) {
	return Promise.race([
		promise,
		new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), Math.max(200, timeoutMs))),
	]);
}

async function verifyGoogleCrawlerIp(ip) {
	if (!net.isIP(ip)) return false;
	const nowMs = Date.now();
	const cached = crawlerVerifyCache.get(ip);
	if (cached && cached.expiresAtMs > nowMs) return cached.ok;

	const suffixes = [".googlebot.com", ".google.com", ".googleusercontent.com"];
	let ok = false;
	try {
		const ptr = await runWithTimeout(reverse(ip), SEO_VERIFY_TIMEOUT_MS);
		if (Array.isArray(ptr) && ptr.length) {
			for (const rawHost of ptr) {
				const host = String(rawHost ?? "")
					.trim()
					.toLowerCase()
					.replace(/\.+$/, "");
				if (!host) continue;
				if (!suffixes.some((s) => host.endsWith(s))) continue;
				try {
					const fwd = await runWithTimeout(lookup(host, { all: true }), SEO_VERIFY_TIMEOUT_MS);
					if (Array.isArray(fwd) && fwd.some((r) => String(r?.address ?? "") === ip)) {
						ok = true;
						break;
					}
				} catch {
					// ignore and keep checking other PTR names
				}
			}
		}
	} catch {
		ok = false;
	}
	crawlerVerifyCache.set(ip, { ok, expiresAtMs: nowMs + CRAWLER_VERIFY_CACHE_TTL_MS });
	return ok;
}

async function getState(knex, logPath) {
	const row = await knex("nyxguard_attack_state").where({ id: 1 }).first();
	if (row) {
		// If the configured log path changes, reset state.
		if (row.log_path !== logPath) {
			await knex("nyxguard_attack_state")
				.where({ id: 1 })
				.update({ log_path: logPath, inode: 0, offset: 0, modified_on: knex.fn.now() });
			return { id: 1, logPath, inode: 0, offset: 0 };
		}
		return {
			id: row.id,
			logPath: row.log_path,
			inode: Number.parseInt(String(row.inode ?? "0"), 10) || 0,
			offset: Number.parseInt(String(row.offset ?? "0"), 10) || 0,
		};
	}

	await knex("nyxguard_attack_state").insert({
		id: 1,
		log_path: logPath,
		inode: 0,
		offset: 0,
		modified_on: knex.fn.now(),
	});
	return { id: 1, logPath, inode: 0, offset: 0 };
}

async function setState(knex, inode, offset) {
	await knex("nyxguard_attack_state").where({ id: 1 }).update({
		inode,
		offset,
		modified_on: knex.fn.now(),
	});
}

async function upsertAutoBanRule(knex, ip, type, banUntil, host) {
	// Respect explicit allow rules.
	const allow = await knex("nyxguard_ip_rule").where({ ip_cidr: ip, action: "allow", enabled: 1 }).first();
	if (allow) return { changed: false };

	const deny = await knex("nyxguard_ip_rule").where({ ip_cidr: ip, action: "deny" }).orderBy("id", "desc").first();
	const nextNote = buildAutoBanNote(type, host);

	if (!deny) {
		const [id] = await knex("nyxguard_ip_rule").insert({
			enabled: 1,
			action: "deny",
			ip_cidr: ip,
			note: nextNote,
			expires_on: banUntil,
			created_on: knex.fn.now(),
			modified_on: knex.fn.now(),
		});
		return { changed: true, id };
	}

	// Permanent deny: keep as-is.
	if (!deny.expires_on) {
		await knex("nyxguard_ip_rule").where({ id: deny.id }).update({ enabled: 1, modified_on: knex.fn.now() });
		return { changed: false, id: deny.id };
	}

	const curMs = Date.parse(String(deny.expires_on));
	const nextMs = banUntil instanceof Date ? banUntil.getTime() : Date.parse(String(banUntil));
	const shouldExtend = !Number.isFinite(curMs) || curMs < nextMs;
	if (!shouldExtend && deny.enabled) return { changed: false, id: deny.id };

	await knex("nyxguard_ip_rule")
		.where({ id: deny.id })
		.update({
			enabled: 1,
			note: deny.note ? deny.note : nextNote,
			expires_on: shouldExtend ? banUntil : deny.expires_on,
			modified_on: knex.fn.now(),
		});
	return { changed: shouldExtend || !deny.enabled, id: deny.id };
}

async function upsertVerifiedCrawlerAllowRule(knex, ip, provider, allowUntil) {
	const allow = await knex("nyxguard_ip_rule").where({ ip_cidr: ip, action: "allow" }).orderBy("id", "desc").first();
	const note = `Auto-allow verified crawler: ${provider}`;
	if (!allow) {
		const [id] = await knex("nyxguard_ip_rule").insert({
			enabled: 1,
			action: "allow",
			ip_cidr: ip,
			note,
			expires_on: allowUntil,
			created_on: knex.fn.now(),
			modified_on: knex.fn.now(),
		});
		return { changed: true, id };
	}

	const curMs = Date.parse(String(allow.expires_on ?? ""));
	const nextMs = allowUntil instanceof Date ? allowUntil.getTime() : Date.parse(String(allowUntil));
	const shouldExtend = !Number.isFinite(curMs) || curMs < nextMs;
	if (!shouldExtend && allow.enabled) return { changed: false, id: allow.id };

	await knex("nyxguard_ip_rule")
		.where({ id: allow.id })
		.update({
			enabled: 1,
			note: allow.note ? allow.note : note,
			expires_on: shouldExtend ? allowUntil : allow.expires_on,
			modified_on: knex.fn.now(),
		});
	return { changed: true, id: allow.id };
}

async function pollOnce() {
	const knex = db();
	pruneRecentCounts(Date.now());
	const logPath = process.env.NYXGUARD_ATTACK_LOG || DEFAULT_ATTACK_LOG;
	let settings = null;
	try {
		settings = await internalNyxGuard.settings.get(knex);
	} catch {
		settings = null;
	}

	// If the migration isn't applied yet, do nothing.
	try {
		await knex("nyxguard_attack_state").select("id").limit(1);
		await knex("nyxguard_attack_event").select("id").limit(1);
	} catch {
		return;
	}

	let st;
	try {
		st = await fs.stat(logPath);
	} catch {
		return;
	}

	const state = await getState(knex, logPath);
	const inode = typeof st.ino === "number" ? st.ino : 0;
	let offset = state.offset;

	// Rotation or truncation
	if (state.inode !== inode || st.size < offset) {
		offset = 0;
	}

	let readStart = offset;
	let readLen = st.size - offset;
	if (readLen <= 0) {
		await setState(knex, inode, offset);
		return;
	}

	// Safety cap: if we fell behind, skip older lines and continue from near the end.
	if (readLen > MAX_READ_BYTES) {
		readStart = Math.max(0, st.size - MAX_READ_BYTES);
		readLen = st.size - readStart;
	}

	let buf;
	try {
		const fh = await fs.open(logPath, "r");
		try {
			buf = Buffer.alloc(readLen);
			await fh.read(buf, 0, readLen, readStart);
		} finally {
			await fh.close();
		}
	} catch {
		return;
	}

	const txt = buf.toString("utf8");
	const lines = txt.split("\n").filter(Boolean);
	if (!lines.length) {
		// Nothing to process; persist offset and return.
		await setState(knex, inode, st.size);
		return;
	}

	const now = new Date();
	const seen = new Set();
	const trustedSelfIps = await getTrustedSelfIpSet();

	let banChanged = false;
	let inserted = 0;

	for (const line of lines) {
		const ev = parseJsonLine(line);
		if (!ev) continue;

		const key = `${ev.type}|${ev.ip}|${ev.tsMs}|${ev.host ?? ""}|${ev.uri ?? ""}`;
		if (seen.has(key)) continue;
		seen.add(key);

		try {
			await knex("nyxguard_attack_event").insert({
				attack_type: ev.type,
				ip: ev.ip,
				host: ev.host,
				method: ev.method,
				uri: ev.uri,
				status: ev.status,
				user_agent: ev.ua,
				referer: ev.ref,
				created_on: new Date(ev.tsMs),
			});
			inserted += 1;
		} catch {
			// ignore insert failures (e.g. migrations mid-flight)
		}
		await insertWebThreatEventForAttack(knex, ev);

		try {
			if (shouldAutoBan(ev.type)) {
				// Never auto-ban traffic that appears authenticated (cookie/auth header present).
				// If the user authenticated successfully, they may legitimately generate high traffic.
				if (!ev.auth) {
					if (SEO_SAFE_MODE) {
						const crawler = crawlerLabelFromUa(ev.ua);
						if (crawler === "google") {
							const verified = await verifyGoogleCrawlerIp(ev.ip);
							if (verified) {
								const allowUntil = new Date(now.getTime() + SEO_CRAWLER_ALLOW_HOURS * 60 * 60 * 1000);
								const allowRes = await upsertVerifiedCrawlerAllowRule(knex, ev.ip, crawler, allowUntil);
								if (allowRes.changed) banChanged = true;
								continue;
							}
						}
					}

					// Never auto-ban internal/private or trusted-self source ranges.
					if (isPrivateOrInternalIp(ev.ip) || trustedSelfIps.has(ev.ip)) continue;

					const threshold =
						ev.type === "bot"
							? BOT_AUTOBAN_THRESHOLD
							: ev.type === "ddos"
								? Number.parseInt(process.env.NYXGUARD_AUTOBAN_DDOS_THRESHOLD ?? "", 10) ||
									DDOS_AUTOBAN_THRESHOLD
								: ev.type === "sqli"
									? SQLI_AUTOBAN_THRESHOLD
									: ev.type === "authfail"
										? Number.parseInt(String(settings?.authfailThreshold ?? ""), 10) ||
											DEFAULT_AUTOBAN_THRESHOLD
										: Number.parseInt(process.env.NYXGUARD_AUTOBAN_THRESHOLD ?? "", 10) ||
											DEFAULT_AUTOBAN_THRESHOLD;
					const windowSec =
						ev.type === "bot" || ev.type === "sqli" || ev.type === "ddos"
							? 1
							: ev.type === "authfail"
								? Number.parseInt(String(settings?.authfailWindowSec ?? ""), 10) ||
									DEFAULT_AUTOBAN_WINDOW_SEC
								: Number.parseInt(process.env.NYXGUARD_AUTOBAN_WINDOW_SEC ?? "", 10) ||
									DEFAULT_AUTOBAN_WINDOW_SEC;
					const banHours =
						ev.type === "bot"
							? BOT_AUTOBAN_BAN_HOURS
							: ev.type === "ddos"
								? Number.parseInt(process.env.NYXGUARD_AUTOBAN_DDOS_BAN_HOURS ?? "", 10) ||
									DDOS_AUTOBAN_BAN_HOURS
								: ev.type === "sqli"
									? SQLI_AUTOBAN_BAN_HOURS
									: ev.type === "authfail"
										? Number.parseInt(String(settings?.authfailBanHours ?? ""), 10) ||
											DEFAULT_AUTOBAN_BAN_HOURS
										: Number.parseInt(process.env.NYXGUARD_AUTOBAN_BAN_HOURS ?? "", 10) ||
											DEFAULT_AUTOBAN_BAN_HOURS;
					const banUntil = new Date(now.getTime() + banHours * 60 * 60 * 1000);

					if (recordAndShouldBan(ev.type, ev.ip, ev.tsMs, { threshold, windowSec })) {
						const ban = await upsertAutoBanRule(knex, ev.ip, ev.type, banUntil, ev.host);
						if (ban.changed) {
							banChanged = true;
							// Fire-and-forget: send notification without blocking the poll cycle.
							internalNotifications
								.send(knex, "attack_ban", {
									ip: ev.ip,
									type: ev.type,
									host: ev.host ?? "",
									banUntil: banUntil.toISOString(),
								})
								.catch(() => {
									// ignore
								});
						}
					}
				}
			}
		} catch {
			// ignore
		}
	}

	// Persist new offset AFTER all lines have been processed.
	// If the process crashes mid-loop the offset stays at the old value, so on the
	// next poll we re-read and re-process the same lines. Re-processing is safe:
	// attack_event inserts are idempotent (duplicate key silently ignored) and
	// upsertAutoBanRule is idempotent. Losing events by saving the offset too early
	// (before processing) is far worse than occasionally re-processing them.
	await setState(knex, inode, st.size);

	// Cleanup (best effort)
	try {
		const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);
		await knex("nyxguard_attack_event").where("created_on", "<", cutoff).delete();
	} catch {
		// ignore
	}

	// Audit log retention (best effort)
	try {
		const retentionSetting = await knex("setting").where("id", "audit-log-retention-days").first();
		const retentionDays = retentionSetting ? parseInt(retentionSetting.value, 10) : 180;
		if (retentionDays > 0) {
			const auditCutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
			await knex("audit_log").where("created_on", "<", auditCutoff).delete();
		}
	} catch {
		// ignore
	}

	// Disable expired temporary allow/deny rules so APIs only report active bans.
	try {
		const expiredRuleIds = await knex("nyxguard_ip_rule")
			.whereIn("action", ["allow", "deny"])
			.where("enabled", 1)
			.whereNotNull("expires_on")
			.andWhere("expires_on", "<=", knex.fn.now())
			.pluck("id");
		if (expiredRuleIds.length > 0) {
			await knex("nyxguard_ip_rule").whereIn("id", expiredRuleIds).update({ enabled: 0, modified_on: knex.fn.now() });
			banChanged = true;
		}
	} catch {
		// ignore
	}

	// Reload nginx when bans changed or a previous reload was skipped due to rate-limiting.
	// Rate-limit to once every 5 seconds to avoid hammering nginx during burst attacks,
	// but always retry on the next poll if a reload was deferred.
	if (banChanged) pendingReload = true;
	if (pendingReload) {
		const nowMs = Date.now();
		if (nowMs - lastReloadMs > 5_000) {
			lastReloadMs = nowMs;
			pendingReload = false;
			try {
				await internalNyxGuard.nginx.apply(knex);
			} catch (err) {
				// Keep pendingReload true so we retry next cycle.
				pendingReload = true;
				logger.warn("NyxGuard attack monitor: nginx apply failed, will retry:", err?.message ?? err);
			}
		}
	}

	if (inserted > 0) {
		logger.info(
			`NyxGuard attack monitor: ingested ${inserted.toLocaleString()} event(s) from ${path.basename(logPath)}`,
		);
	}
}

const internalAttackMonitor = {
	initTimer: (pollMs = DEFAULT_POLL_MS) => {
		if (timer) return;
		timer = setInterval(() => {
			pollOnce().catch(() => {
				// ignore
			});
		}, pollMs);
		// Run once shortly after startup.
		setTimeout(() => {
			pollOnce().catch(() => {
				// ignore
			});
		}, 2000);
	},
};

export default internalAttackMonitor;
