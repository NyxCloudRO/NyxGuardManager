import https from "node:https";
import net from "node:net";
import os from "node:os";

const DEFAULT_CACHE_MS = Number.parseInt(process.env.NYXGUARD_TRUSTED_IP_CACHE_MS ?? "", 10) || 5 * 60 * 1000;
const REQUEST_TIMEOUT_MS = Number.parseInt(process.env.NYXGUARD_TRUSTED_IP_TIMEOUT_MS ?? "", 10) || 1500;

const PUBLIC_IP_ENDPOINTS = [
	"https://api.ipify.org",
	"https://ifconfig.me/ip",
	"https://ipv4.icanhazip.com",
	"https://api64.ipify.org",
];

let cached = {
	expiresAt: 0,
	values: [],
};

function isPrivateOrInternalIp(ip) {
	if (!net.isIP(ip)) return false;
	if (ip === "127.0.0.1" || ip === "::1") return true;

	const v4 = ip.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
	if (v4) {
		const a = Number.parseInt(v4[1], 10);
		const b = Number.parseInt(v4[2], 10);
		if (a === 10) return true;
		if (a === 172 && b >= 16 && b <= 31) return true;
		if (a === 192 && b === 168) return true;
		if (a === 169 && b === 254) return true;
		if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
		return false;
	}

	const lower = ip.toLowerCase();
	return (
		lower.startsWith("fc") ||
		lower.startsWith("fd") ||
		lower.startsWith("fe8") ||
		lower.startsWith("fe9") ||
		lower.startsWith("fea") ||
		lower.startsWith("feb")
	);
}

function normalizeIp(input) {
	const raw = String(input ?? "").trim();
	if (!raw) return null;
	if (net.isIP(raw)) return raw;

	// Normalize dotted IPv4 with leading zeros.
	if (/^\d+\.\d+\.\d+\.\d+$/.test(raw)) {
		const octets = raw.split(".").map((s) => Number.parseInt(s, 10));
		if (octets.length === 4 && octets.every((n) => Number.isInteger(n) && n >= 0 && n <= 255)) {
			const next = octets.join(".");
			return net.isIP(next) ? next : null;
		}
	}

	return null;
}

function requestPublicIp(url) {
	return new Promise((resolve) => {
		const req = https.get(
			url,
			{
				timeout: REQUEST_TIMEOUT_MS,
			},
			(res) => {
				const chunks = [];
				res.on("data", (chunk) => chunks.push(chunk));
				res.on("end", () => {
					const text = Buffer.concat(chunks).toString("utf8").trim();
					resolve(normalizeIp(text));
				});
			},
		);
		req.on("timeout", () => {
			req.destroy();
			resolve(null);
		});
		req.on("error", () => resolve(null));
	});
}

async function detectPublicIps() {
	const out = new Set();
	const results = await Promise.all(PUBLIC_IP_ENDPOINTS.map((url) => requestPublicIp(url)));
	for (const ip of results) {
		if (!ip) continue;
		out.add(ip);
	}
	return out;
}

function detectInterfaceIps() {
	const out = new Set();
	const all = os.networkInterfaces();
	for (const records of Object.values(all)) {
		for (const item of records ?? []) {
			const ip = normalizeIp(item?.address);
			if (!ip) continue;
			out.add(ip);
		}
	}
	return out;
}

function parseEnvIps() {
	const out = new Set();
	const raw = `${process.env.NYXGUARD_TRUSTED_IPS ?? ""},${process.env.NYXGUARD_SELF_IPS ?? ""}`;
	for (const item of raw.split(",")) {
		const ip = normalizeIp(item);
		if (!ip) continue;
		out.add(ip);
	}
	return out;
}

export async function getTrustedSelfIps() {
	const now = Date.now();
	if (cached.expiresAt > now && cached.values.length) return cached.values;

	const merged = new Set();
	for (const ip of detectInterfaceIps()) merged.add(ip);
	for (const ip of parseEnvIps()) merged.add(ip);
	for (const ip of await detectPublicIps()) merged.add(ip);

	const values = [...merged];
	cached = {
		expiresAt: now + DEFAULT_CACHE_MS,
		values,
	};
	return values;
}

export async function getTrustedSelfIpSet() {
	return new Set(await getTrustedSelfIps());
}

export { isPrivateOrInternalIp };

