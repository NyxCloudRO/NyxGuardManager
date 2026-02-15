import fs from "node:fs/promises";
import path from "node:path";

import db from "../db.js";
import { global as logger } from "../logger.js";
import internalNyxGuard from "./nyxguard.js";

const DEFAULT_LOG = "/data/logs/web_threat_events.log";
const DEFAULT_STATE = "/data/logs/.web_threat_events.state.json";
const DEFAULT_POLL_MS = 10_000;
const MAX_READ_BYTES = 4 * 1024 * 1024;

let timer = null;
let lastReloadMs = 0;

function safeJsonParse(s) {
	try {
		return JSON.parse(s);
	} catch {
		return null;
	}
}

async function readState() {
	try {
		const raw = await fs.readFile(DEFAULT_STATE, "utf8");
		const obj = safeJsonParse(raw);
		if (!obj || typeof obj !== "object") return { inode: 0, offset: 0 };
		return {
			inode: Number.parseInt(String(obj.inode ?? "0"), 10) || 0,
			offset: Number.parseInt(String(obj.offset ?? "0"), 10) || 0,
		};
	} catch {
		return { inode: 0, offset: 0 };
	}
}

async function writeState(inode, offset) {
	try {
		await fs.writeFile(DEFAULT_STATE, JSON.stringify({ inode, offset }), "utf8");
	} catch {
		// ignore
	}
}

function normalizeEvent(obj) {
	if (!obj || typeof obj !== "object") return null;
	const category = String(obj.category ?? "");
	const ruleId = String(obj.rule_id ?? "");
	const action = String(obj.action ?? "");
	const reason = String(obj.reason ?? "");
	if (!["inbound", "browser", "outbound"].includes(category)) return null;
	if (!ruleId || ruleId.length > 64) return null;
	if (!["allow", "log", "block"].includes(action)) return null;
	if (!reason) return null;

	const ts = typeof obj.ts === "string" ? obj.ts : null;
	const meta = obj.meta && typeof obj.meta === "object" ? obj.meta : null;
	return {
		ts: ts ? new Date(ts) : new Date(),
		appId: obj.app_id != null ? Number.parseInt(String(obj.app_id), 10) || null : null,
		routeId: obj.route_id != null ? Number.parseInt(String(obj.route_id), 10) || null : null,
		category,
		ruleId,
		action,
		reason: reason.slice(0, 255),
		srcIp: typeof obj.src_ip === "string" ? obj.src_ip.slice(0, 45) : null,
		requestId: typeof obj.request_id === "string" ? obj.request_id.slice(0, 64) : null,
		meta,
	};
}

async function pollOnce() {
	const logPath = process.env.WEB_THREAT_EVENTS_LOG || DEFAULT_LOG;
	let st;
	try {
		st = await fs.stat(logPath);
	} catch {
		return;
	}
	const inode = typeof st.ino === "number" ? st.ino : 0;
	const state = await readState();
	let offset = state.offset;

	// Rotation/truncation
	if (state.inode !== inode || st.size < offset) {
		offset = 0;
	}

	let readStart = offset;
	let readLen = st.size - offset;
	if (readLen <= 0) {
		await writeState(inode, offset);
		return;
	}
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

	await writeState(inode, st.size);

	const lines = buf.toString("utf8").split("\n").filter(Boolean);
	if (!lines.length) return;

	const knex = db();
	let inserted = 0;
	let changedConfig = false;

	for (const line of lines) {
		const obj = safeJsonParse(line);
		const ev = normalizeEvent(obj);
		if (!ev) continue;
		try {
			await knex("web_threat_events").insert({
				ts: ev.ts,
				app_id: ev.appId,
				route_id: ev.routeId,
				category: ev.category,
				rule_id: ev.ruleId,
				action: ev.action,
				reason: ev.reason,
				src_ip: ev.srcIp,
				request_id: ev.requestId,
				meta: ev.meta ? JSON.stringify(ev.meta) : null,
			});
			inserted += 1;
			if (ev.category === "inbound" && ev.action === "block") changedConfig = true;
		} catch {
			// ignore insert failures
		}
	}

	if (inserted > 0) {
		logger.info(`Web Threat monitor: ingested ${inserted.toLocaleString()} event(s) from ${path.basename(logPath)}`);
	}

	// If config-affecting events were seen, ensure nginx config is applied (rate-limited).
	if (changedConfig) {
		const nowMs = Date.now();
		if (nowMs - lastReloadMs > 30_000) {
			lastReloadMs = nowMs;
			try {
				await internalNyxGuard.nginx.apply(knex);
			} catch {
				// ignore
			}
		}
	}
}

const internalWebThreatMonitor = {
	initTimer: (pollMs = DEFAULT_POLL_MS) => {
		if (timer) return;
		timer = setInterval(() => {
			pollOnce().catch(() => {});
		}, pollMs);
		setTimeout(() => {
			pollOnce().catch(() => {});
		}, 2500);
	},
};

export default internalWebThreatMonitor;

