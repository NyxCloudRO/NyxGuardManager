import fs from "node:fs/promises";
import net from "node:net";
import path from "node:path";

export const DEFAULT_DDOS_RATE_RPS = 25;
export const DEFAULT_DDOS_BURST = 120;
export const DEFAULT_DDOS_CONN_LIMIT = 80;
export const DEFAULT_LOG_RETENTION_DAYS = 90;
export const ALLOWED_LOG_RETENTION_DAYS = [30, 60, 90, 180];

export async function writeAtomic(filePath, contents) {
	const dir = path.dirname(filePath);
	const tmp = path.join(dir, `.${path.basename(filePath)}.${process.pid}.tmp`);
	await fs.writeFile(tmp, contents, { encoding: "utf8" });
	await fs.rename(tmp, filePath);
}

export function normalizeText(s) {
	return (s ?? "").replace(/\r\n/g, "\n");
}

export function ensureTrailingNewline(s) {
	return s.endsWith("\n") ? s : `${s}\n`;
}

export function stripMarkedBlock(text, begin, end) {
	const t = normalizeText(text);
	const re = new RegExp(`\\n?${begin}[\\s\\S]*?${end}\\n?`, "g");
	return t
		.replace(re, "\n")
		.replace(/^\n+/, "")
		.replace(/\n{3,}/g, "\n\n")
		.trimEnd();
}

export function buildGeoBlock(varName, cidrs) {
	// Nginx geo blocks must be in http {}.
	// CIDRs are untrusted input; keep it simple and only emit sane-ish patterns.
	const lines = [];
	lines.push(`geo $${varName} {`);
	lines.push("\tdefault 0;");
	for (const c of cidrs) {
		lines.push(`\t${c} 1;`);
	}
	lines.push("}");
	return lines.join("\n");
}

export function sanitizeCidr(value) {
	const v = String(value ?? "").trim();
	if (!v) return null;
	if (!/^[0-9a-fA-F:./]+$/.test(v)) return null;

	const parts = v.split("/");
	if (parts.length > 2) return null;

	let ip = parts[0];
	let ipVer = net.isIP(ip);
	// Normalize IPv4 dotted quads like 10.01.01.11 (leading zeros) to 10.1.1.11.
	// Node's net.isIP rejects some representations with leading zeros; users commonly paste them.
	if (!ipVer && /^\d+\.\d+\.\d+\.\d+$/.test(ip)) {
		const octets = ip.split(".").map((s) => Number.parseInt(s, 10));
		if (octets.length === 4 && octets.every((n) => Number.isInteger(n) && n >= 0 && n <= 255)) {
			ip = octets.join(".");
			ipVer = net.isIP(ip);
		}
	}
	if (!ipVer) return null;

	if (parts.length === 1) {
		return ip;
	}

	const prefix = Number.parseInt(parts[1], 10);
	if (Number.isNaN(prefix)) return null;
	if (ipVer === 4 && (prefix < 0 || prefix > 32)) return null;
	if (ipVer === 6 && (prefix < 0 || prefix > 128)) return null;
	return `${ip}/${prefix}`;
}

export function sanitizeCountryCode(value) {
	const v = String(value ?? "")
		.trim()
		.toUpperCase();
	if (!/^[A-Z]{2}$/.test(v)) return null;
	return v;
}

export function computeExpiresOn(expiresInDays) {
	if (!expiresInDays) return null;
	const days = Number.parseInt(String(expiresInDays), 10);
	if (Number.isNaN(days) || days <= 0) return null;
	return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

export function isExpired(expiresOn) {
	if (!expiresOn) return false;
	const ms =
		typeof expiresOn === "string"
			? Date.parse(expiresOn)
			: expiresOn instanceof Date
				? expiresOn.getTime()
				: Date.parse(String(expiresOn));
	if (!Number.isFinite(ms)) return false;
	return ms <= Date.now();
}

export function clampInt(val, min, max, fallback) {
	const n = Number.parseInt(String(val ?? ""), 10);
	if (!Number.isFinite(n)) return fallback;
	return Math.min(max, Math.max(min, n));
}

export function normalizeLogRetentionDays(val, fallback = DEFAULT_LOG_RETENTION_DAYS) {
	const n = Number.parseInt(String(val ?? ""), 10);
	if (!Number.isFinite(n)) return fallback;
	return ALLOWED_LOG_RETENTION_DAYS.includes(n) ? n : fallback;
}

export function parseTokenList(text, { maxItems = 50, maxLen = 64 } = {}) {
	const raw = String(text ?? "");
	const items = raw
		.split(/\r?\n/)
		.map((s) => s.trim())
		.filter(Boolean)
		.map((s) => (s.length > maxLen ? s.slice(0, maxLen) : s));
	return items.slice(0, maxItems);
}

export function escapeRegexLiteral(s) {
	return String(s ?? "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
