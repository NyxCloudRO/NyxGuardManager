import { constants } from "node:fs";
import { open } from "node:fs/promises";
import { join } from "node:path";

const WINDOWS = new Set([15, 60, 1440]);
const MAX_HOSTS = 20;
const MAX_FILE_BYTES = 64 * 1024;
const MAX_LINES = 1000;
const MAX_GROUPS = 40;
const FALLBACK_FILES = ["fallback_error.log", "fallback_http_error.log"];

// Only these known current OpenResty error logs can be inspected. Rotated logs,
// access logs and caller-supplied paths are deliberately excluded.
function logNames(hostIds) {
	if (!Array.isArray(hostIds) || hostIds.length > MAX_HOSTS ||
		hostIds.some((id) => !Number.isSafeInteger(id) || id < 1)) {
		throw new TypeError("Invalid configured proxy host IDs");
	}
	return [...FALLBACK_FILES.map((name) => ({ name, hostId: null })),
		...[...new Set(hostIds)].map((id) => ({ name: `proxy-host-${id}_error.log`, hostId: id }))];
}

function classify(line) {
	if (/connect\(\) failed.*connection refused|connection refused.*upstream/i.test(line)) return ["upstream_connection_refused", "FAIL"];
	if (/upstream timed out|timed out.*(?:upstream|connect\(\))/i.test(line)) return ["upstream_timeout", "FAIL"];
	if (/no resolver defined|host not found|could not be resolved|name or service not known/i.test(line)) return ["dns_resolution", "FAIL"];
	if (/SSL_do_handshake\(\) failed|upstream SSL certificate|certificate verify failed|handshake failed/i.test(line)) return ["tls_handshake", "FAIL"];
	if (/certificate.*(?:expired|renew|not yet valid)|(?:renew|acme).*certificate.*fail/i.test(line)) return ["certificate_renewal", "FAIL"];
	if (/upstream sent invalid header|upstream prematurely closed connection/i.test(line)) return ["upstream_response", "FAIL"];
	if (/\b(?:502|503|504)\b.*(?:upstream|proxy)|(?:upstream|proxy).*\b(?:502|503|504)\b/i.test(line)) return ["upstream_http_error", "WARNING"];
	if (/\[error\]|\[crit\]|\[alert\]|\[emerg\]/i.test(line)) return ["openresty_error", "WARNING"];
	return null;
}

function parseTimestamp(line, offsetMinutes) {
	const match = /^(\d{4})\/(\d{2})\/(\d{2}) (\d{2}):(\d{2}):(\d{2})\b/.exec(line);
	if (!match) return null;
	const [, year, month, day, hour, minute, second] = match.map(Number);
	const utc = Date.UTC(year, month - 1, day, hour, minute, second) - offsetMinutes * 60000;
	const check = new Date(utc + offsetMinutes * 60000);
	if (check.getUTCFullYear() !== year || check.getUTCMonth() + 1 !== month || check.getUTCDate() !== day ||
		check.getUTCHours() !== hour || check.getUTCMinutes() !== minute || check.getUTCSeconds() !== second) return null;
	return utc;
}

async function readTail(root, name) {
	let file;
	try {
		file = await open(join(root, name), constants.O_RDONLY | constants.O_NOFOLLOW);
		const stat = await file.stat();
		if (!stat.isFile()) return "";
		const length = Math.min(stat.size, MAX_FILE_BYTES);
		const bytes = Buffer.alloc(length);
		const { bytesRead } = await file.read(bytes, 0, length, stat.size - length);
		let text = bytes.subarray(0, bytesRead).toString("utf8");
		if (stat.size > length) {
			const firstNewline = text.indexOf("\n");
			text = firstNewline < 0 ? "" : text.slice(firstNewline + 1);
		}
		return text;
	} catch (error) {
		if (["ENOENT", "EACCES", "EPERM", "ELOOP"].includes(error.code)) return "";
		throw error;
	} finally {
		await file?.close();
	}
}

// Returns only fixed category names and numeric evidence. No log text, paths,
// hostnames, URLs, addresses or secret-bearing excerpts leave this module.
export async function recentOpenRestyProblems({ root, hostIds = [], windowMinutes = 60,
	now = new Date(), logUtcOffsetMinutes = 0 } = {}) {
	if (typeof root !== "string" || !root.startsWith("/") || !WINDOWS.has(windowMinutes) ||
		!(now instanceof Date) || !Number.isFinite(now.getTime()) ||
		!Number.isInteger(logUtcOffsetMinutes) || Math.abs(logUtcOffsetMinutes) > 840) {
		throw new TypeError("Invalid recent problem query");
	}
	const names = logNames(hostIds);
	const cutoff = now.getTime() - windowMinutes * 60000;
	const groups = new Map();
	for (const { name, hostId } of names) {
		const lines = (await readTail(root, name)).split("\n");
		for (const line of lines.slice(-MAX_LINES)) {
			const at = parseTimestamp(line, logUtcOffsetMinutes);
			if (at === null || at < cutoff || at > now.getTime() + 60000) continue;
			const category = classify(line);
			if (!category) continue;
			const key = `${hostId ?? 0}:${category[0]}`;
			const prior = groups.get(key);
			if (prior) {
				prior.count++;
				prior.firstSeen = Math.min(prior.firstSeen, at);
				prior.lastSeen = Math.max(prior.lastSeen, at);
			} else if (groups.size < MAX_GROUPS) {
				groups.set(key, { category: category[0], state: category[1], hostId, count: 1, firstSeen: at, lastSeen: at });
			}
		}
	}
	return [...groups.values()].sort((a, b) => b.lastSeen - a.lastSeen).map((group) => ({
		category: group.category, state: group.state, host_id: group.hostId,
		count: group.count, first_seen: new Date(group.firstSeen).toISOString(),
		last_seen: new Date(group.lastSeen).toISOString(),
	}));
}
