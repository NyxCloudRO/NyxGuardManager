import fs from "node:fs/promises";
import path from "node:path";
import net from "node:net";

import internalNyxGuard from "./nyxguard.js";
import { global as logger } from "../logger.js";
import db from "../db.js";

const DEFAULT_ATTACK_LOG = "/data/logs/nyxguard_attacks.log";
const DEFAULT_POLL_MS = 15_000;
const MAX_READ_BYTES = 4 * 1024 * 1024;
const RETENTION_DAYS = 30;
const DEFAULT_AUTOBAN_THRESHOLD = 5;
const DEFAULT_AUTOBAN_WINDOW_SEC = 180;

let timer = null;
let lastReloadMs = 0;
const recentCounts = new Map(); // key: type|ip -> { tsMs: number[] }

function isValidAttackType(t) {
	return t === "sqli" || t === "ddos" || t === "bot" || t === "authfail";
}

function shouldAutoBan(type) {
	// DDoS is already handled by rate limiting (429). Auto-banning on 429s causes
	// false positives for bursty but legitimate apps (eg. media apps doing parallel requests).
	// If you really want ddos auto-bans, opt in via env var.
	if (type === "ddos") return process.env.NYXGUARD_AUTOBAN_DDOS === "1";
	if (type === "authfail") return process.env.NYXGUARD_AUTOBAN_AUTHFAIL !== "0";
	return true;
}

function recordAndShouldBan(type, ip, tsMs, { threshold, windowSec }) {
	const windowMs = Math.max(5, windowSec) * 1000;

	const key = `${type}|${ip}`;
	const cur = recentCounts.get(key) || { tsMs: [] };
	cur.tsMs.push(tsMs);
	// Keep only timestamps within the window.
	const cutoff = tsMs - windowMs;
	cur.tsMs = cur.tsMs.filter((t) => t >= cutoff);
	recentCounts.set(key, cur);

	return cur.tsMs.length >= threshold;
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

async function upsertAutoBanRule(knex, ip, type, banUntil) {
	// Respect explicit allow rules.
	const allow = await knex("nyxguard_ip_rule")
		.where({ ip_cidr: ip, action: "allow", enabled: 1 })
		.first();
	if (allow) return { changed: false };

	const deny = await knex("nyxguard_ip_rule")
		.where({ ip_cidr: ip, action: "deny" })
		.orderBy("id", "desc")
		.first();

	if (!deny) {
		const [id] = await knex("nyxguard_ip_rule").insert({
			enabled: 1,
			action: "deny",
			ip_cidr: ip,
			note: `Auto-ban: ${type}`,
			expires_on: banUntil,
			created_on: knex.fn.now(),
			modified_on: knex.fn.now(),
		});
		return { changed: true, id };
	}

	// Permanent deny: keep as-is.
	if (!deny.expires_on) {
		await knex("nyxguard_ip_rule")
			.where({ id: deny.id })
			.update({ enabled: 1, modified_on: knex.fn.now() });
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
			note: deny.note ? deny.note : `Auto-ban: ${type}`,
			expires_on: shouldExtend ? banUntil : deny.expires_on,
			modified_on: knex.fn.now(),
		});
	return { changed: shouldExtend || !deny.enabled, id: deny.id };
}

async function pollOnce() {
	const knex = db();
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

	// Persist new offset eagerly so we don't reprocess on crash.
	await setState(knex, inode, st.size);

	const txt = buf.toString("utf8");
	const lines = txt.split("\n").filter(Boolean);
	if (!lines.length) return;

	const now = new Date();
	const seen = new Set();

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

		try {
				if (shouldAutoBan(ev.type)) {
					// Never auto-ban traffic that appears authenticated (cookie/auth header present).
					// If the user authenticated successfully, they may legitimately generate high traffic.
					if (!ev.auth) {
						const threshold =
							ev.type === "authfail"
								? Number.parseInt(String(settings?.authfailThreshold ?? ""), 10) || DEFAULT_AUTOBAN_THRESHOLD
								: Number.parseInt(process.env.NYXGUARD_AUTOBAN_THRESHOLD ?? "", 10) || DEFAULT_AUTOBAN_THRESHOLD;
						const windowSec =
							ev.type === "authfail"
								? Number.parseInt(String(settings?.authfailWindowSec ?? ""), 10) || DEFAULT_AUTOBAN_WINDOW_SEC
								: Number.parseInt(process.env.NYXGUARD_AUTOBAN_WINDOW_SEC ?? "", 10) || DEFAULT_AUTOBAN_WINDOW_SEC;
						const banHours =
							ev.type === "authfail"
								? Number.parseInt(String(settings?.authfailBanHours ?? ""), 10) || 24
								: 24;
						const banUntil = new Date(now.getTime() + banHours * 60 * 60 * 1000);

						if (recordAndShouldBan(ev.type, ev.ip, ev.tsMs, { threshold, windowSec })) {
							const ban = await upsertAutoBanRule(knex, ev.ip, ev.type, banUntil);
						if (ban.changed) banChanged = true;
						}
					}
				}
			} catch {
				// ignore
			}
	}

	// Cleanup (best effort)
	try {
		const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);
		await knex("nyxguard_attack_event").where("created_on", "<", cutoff).delete();
	} catch {
		// ignore
	}

	// Reload nginx only when bans changed, and rate-limit reloads.
	if (banChanged) {
		const nowMs = Date.now();
		if (nowMs - lastReloadMs > 30_000) {
			lastReloadMs = nowMs;
			try {
				await internalNyxGuard.nginx.apply(knex);
			} catch (err) {
				logger.warn("NyxGuard attack monitor: nginx apply failed:", err?.message ?? err);
			}
		}
	}

	if (inserted > 0) {
		logger.info(`NyxGuard attack monitor: ingested ${inserted.toLocaleString()} event(s) from ${path.basename(logPath)}`);
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
