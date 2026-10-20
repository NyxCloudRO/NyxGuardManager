import {portalAuditWriteResult} from '../../internal/portal-security-health.mjs';
import { configGet } from '../../lib/config.js';
import {recordAccessDecision} from "../../internal/access-audit.mjs";
import {sanitizeContext} from "../../internal/audit-policy.mjs";
import { execFile } from "node:child_process";
import crypto from "node:crypto";
import { promisify } from "node:util";
import express from "express";
import db from "../../db.js";
import accessListAuthModel from "../../models/access_list_auth.js";
import accessListModel from "../../models/access_list.js";

const execFileAsync = promisify(execFile);
const router = express.Router({
	caseSensitive: true,
	strict: true,
	mergeParams: true,
});

const SESSION_COOKIE = "nyxguard_access";
const SECURE_SESSION_COOKIE = "__Host-nyxguard_access";
const SESSION_TTL_SEC = Number.parseInt(process.env.NYXGUARD_ACCESS_SESSION_TTL_SEC ?? "", 10) || 8 * 60 * 60;
const configuredSessionSecret =
	process.env.NYXGUARD_ACCESS_SESSION_SECRET ||
	process.env.JWT_SECRET ||
	process.env.NYXGUARD_SESSION_SECRET;
function sessionSecret() {
 if (configuredSessionSecret) return configuredSessionSecret;
 const key = configGet("keys")?.key;
 if (typeof key !== "string" || key.length < 64) throw Error("Access session signing key unavailable");
 return crypto.createHmac("sha256", key).update("nyxguard-access-portal-v1").digest();
}

function parseCookies(raw) {
	const out = {};
	const src = String(raw ?? "");
	if (!src) return out;
	for (const part of src.split(";")) {
		const i = part.indexOf("=");
		if (i <= 0) continue;
		const k = part.slice(0, i).trim();
		const v = part.slice(i + 1).trim();
		if (!k) continue;
		out[k] = v;
	}
	return out;
}

function parseCookieValues(raw, key) {
	const out = [];
	const src = String(raw ?? "");
	const wanted = String(key ?? "").trim();
	if (!src || !wanted) return out;
	for (const part of src.split(";")) {
		const i = part.indexOf("=");
		if (i <= 0) continue;
		const k = part.slice(0, i).trim();
		const v = part.slice(i + 1).trim();
		if (!k || k !== wanted || !v) continue;
		out.push(v);
	}
	return out;
}

function b64urlEncode(input) {
	return Buffer.from(input, "utf8")
		.toString("base64")
		.replace(/\+/g, "-")
		.replace(/\//g, "_")
		.replace(/=+$/g, "");
}

function b64urlDecode(input) {
	const s = String(input ?? "")
		.replace(/-/g, "+")
		.replace(/_/g, "/");
	const pad = s.length % 4;
	const fixed = pad ? s + "=".repeat(4 - pad) : s;
	return Buffer.from(fixed, "base64").toString("utf8");
}

function signBody(body) {
	return crypto
		.createHmac("sha256", sessionSecret())
		.update(body)
		.digest("base64")
		.replace(/\+/g, "-")
		.replace(/\//g, "_")
		.replace(/=+$/g, "");
}

function timingSafeEqualText(a, b) {
	const ba = Buffer.from(String(a ?? ""), "utf8");
	const bb = Buffer.from(String(b ?? ""), "utf8");
	if (ba.length !== bb.length) return false;
	return crypto.timingSafeEqual(ba, bb);
}

function safeRedirectPath(raw) {
	const s = String(raw ?? "").trim();
	if (!s.startsWith("/")) return "/";
	if (s.startsWith("//")) return "/";
	return s;
}

function getNormalizedHost(req) {
	const raw = String(req.headers["x-nyxguard-original-host"] || req.headers.host || "")
		.trim()
		.toLowerCase();
	if (!raw) return "";
	return raw.split(":")[0] || "";
}

function parseListId(raw) {
	const n = Number.parseInt(String(raw ?? ""), 10);
	return Number.isFinite(n) && n > 0 ? n : 0;
}

function getClientIp(req) {
	const normalizeIp = (raw) => {
		let ip = String(raw || "").trim();
		if (!ip) return "";
		// Strip IPv4-mapped IPv6 prefix to keep stable cache keys.
		if (ip.startsWith("::ffff:")) ip = ip.slice(7);
		// Remove brackets around IPv6 literal if present.
		if (ip.startsWith("[") && ip.endsWith("]")) ip = ip.slice(1, -1);
		return ip;
	};

	const xri = String(req.headers["x-real-ip"] || "").trim();
	if (xri) return normalizeIp(xri);

	const xff = String(req.headers["x-forwarded-for"] || "").trim();
	if (xff) {
		const first = xff
			.split(",")
			.map((s) => s.trim())
			.find(Boolean);
		if (first) return normalizeIp(first);
	}
	return normalizeIp(String(req.ip || req.socket?.remoteAddress || ""));
}

function getCountry(req) {
	return String(req.headers["cf-ipcountry"] || req.headers["x-nyxguard-country"] || "").trim().toUpperCase();
}

function getSessionToken(req) {
	const cookies = parseCookies(req.headers.cookie);
	const fromCookie = String(cookies[SECURE_SESSION_COOKIE] ?? cookies[SESSION_COOKIE] ?? "").trim();
	if (fromCookie) return fromCookie;
	return String(req.headers["x-nyxguard-access-token"] ?? "").trim();
}

function getSessionTokenCandidates(req) {
	const raw = String(req.headers.cookie ?? "");
	const values = [
		...parseCookieValues(raw, SECURE_SESSION_COOKIE),
		...parseCookieValues(raw, SESSION_COOKIE),
	];
	const queryToken = String(req.query?.token ?? "").trim();
	if (queryToken) values.push(queryToken);
	const headerToken = String(req.headers["x-nyxguard-access-token"] ?? "").trim();
	if (headerToken) values.push(headerToken);
	// De-duplicate while preserving order.
	const seen = new Set();
	const out = [];
	for (const v of values) {
		if (!v || seen.has(v)) continue;
		seen.add(v);
		out.push(v);
	}
	return out;
}

async function logCheckDeny(reason, req, ctx = {}) {
	try {
		const host = getNormalizedHost(req);
		const listId = parseListId(req.headers["x-nyxguard-access-list"] ?? req.query?.list);
		const ip = getClientIp(req);
		const token = getSessionToken(req);
		const ua = String(req.headers["user-agent"] || "");
		// Keep this compact but actionable for production incident tracing.
		console.warn(
			`[nyxguard-check-deny] reason=${reason} host=${host} list=${listId} ip=${ip} token_len=${token.length} ua=${ua} ctx=${JSON.stringify(
				ctx,
			)}`,
		);
		await recordAccessDecision(db(), req, reason, ctx).then(() => portalAuditWriteResult(true)).catch(() => {portalAuditWriteResult(false);console.error("Access decision audit persistence failed");});
	} catch {
		// no-op
	}
}

async function verifyApr1Password(password, hash) {
	const h = String(hash ?? "");
	const m = h.match(/^\$apr1\$([^$]+)\$/);
	if (!m || !m[1]) return false;
	const salt = m[1];
	const { stdout } = await execFileAsync("openssl", ["passwd", "-apr1", "-salt", salt, "--", String(password ?? "")]);
	return timingSafeEqualText(stdout.trim(), h);
}

async function verifyAccessPassword(password, storedPassword) {
	const candidate = String(password ?? "");
	const stored = String(storedPassword ?? "");
	if (!candidate || !stored) return false;

	// Backward compatibility: existing access-list credentials are stored as plaintext.
	// If/when rows are migrated to APR1 hashes, both formats remain valid.
	if (stored.startsWith("$apr1$")) {
		return verifyApr1Password(candidate, stored);
	}
	return timingSafeEqualText(candidate, stored);
}

async function findAccessUser(listId, username) {
	return accessListAuthModel
		.query()
		.where({
			access_list_id: listId,
			username: String(username ?? ""),
		})
		.orderBy("id", "desc")
		.first();
}

async function resolveProxyHostByDomain(host) {
	const target = String(host || "")
		.trim()
		.toLowerCase();
	if (!target) return null;
	try {
		const rows = await db()("proxy_host")
			.where({ is_deleted: 0 })
			.select("id", "forward_host", "forward_port", "domain_names", "access_list_id");
		for (const row of rows) {
			let domains = [];
			try {
				domains = Array.isArray(row.domain_names) ? row.domain_names : JSON.parse(row.domain_names || "[]");
			} catch {
				domains = [];
			}
			const has = Array.isArray(domains) && domains.some((d) => String(d || "").trim().toLowerCase() === target);
			if (!has) continue;
			return {
				id: Number(row.id) || 0,
				forwardHost: String(row.forward_host || "").trim(),
				forwardPort: Number(row.forward_port) || 0,
				accessListId: Number(row.access_list_id) || 0,
			};
		}
	} catch {
		// best effort only
	}
	return null;
}

async function resolveAccessListIdByHost(host) {
	try {
		const row = await resolveProxyHostByDomain(host);
		return Number(row?.accessListId) || 0;
	} catch {
		return 0;
	}
}

async function getEffectiveAccessListId(host, requestedListId) {
	const hostListId = host ? await resolveAccessListIdByHost(host) : 0;
	if (hostListId > 0) return hostListId;
	return Number(requestedListId) || 0;
}

async function normalizeRedirectForHost(host, redirectPath) {
	const rd = safeRedirectPath(redirectPath);
	if (rd !== "/") return rd;
	try {
		const proxyHost = await resolveProxyHostByDomain(host);
		if (!proxyHost) return rd;
		// Plex upstream root usually returns 401 and can trigger a login loop.
		// Force the canonical Plex web path after NyxGuard auth.
		if (Number(proxyHost.forwardPort) === 32400) {
			return "/web/index.html";
		}
	} catch {
		// keep original redirect
	}
	return rd;
}

async function writeAccessLoginAudit({
	host,
	listId,
	requestedListId,
	username,
	status,
	result,
	reason,
	externalIp,
	country,
	userAgent,
	referrer,
	scheme,
}) {
	try {
		const proxyHost = await resolveProxyHostByDomain(host);
		await db()("audit_log").insert({
			user_id: 0,
				category: "access",
				actor_kind: "unauthenticated",
			object_type: "access-login",
			object_id: Number(listId) || 0,
			action: result === "success" ? "login_success" : "login_failed",
			result: result === "success" ? "success" : "failed",
				meta: JSON.stringify(sanitizeContext({
				name: String(host || ""),
                source_ip: String(externalIp || ""),
                reason_code: String(reason || ""),
                resource: "/nginx/access-portal/session",
				host_id: proxyHost?.id || 0,
				internal_ip: proxyHost?.forwardHost || "",
				requested_list_id: Number(requestedListId) || 0,
				external_ip: String(externalIp || ""),
				country: String(country || ""),
				username: String(username || ""),
				status: Number(status) || 0,
				result: String(result || ""),
				reason: String(reason || ""),
				method: "POST",
				uri: "/_nyxguard/access/session",
				scheme: String(scheme || ""),
				user_agent: String(userAgent || ""),
				referrer: String(referrer || ""),
				ts: new Date().toISOString(),
				})),
			created_on: db().fn.now(),
			modified_on: db().fn.now(),
		});
	} catch {
		// never break auth flow because of logging
	}
}

function verifySessionToken(token, { expectedListId, expectedHost, rejected = () => {} }) {
	const parts = String(token ?? "").split(".");
	if (parts.length !== 2) return null;
	const [body, sig] = parts;
	if (!body || !sig) return null;
	const validSig = signBody(body);
	if (!timingSafeEqualText(sig, validSig)) { rejected("session_signature_rejected"); return null; }

	let payload;
	try {
		payload = JSON.parse(b64urlDecode(body));
	} catch {
		return null;
	}

	const exp = Number(payload?.exp ?? 0);
	const listId = Number(payload?.l ?? 0);
	const host = String(payload?.h ?? "").toLowerCase();
	const user = String(payload?.u ?? "");
	const hashSig = String(payload?.p ?? "");
	if (!Number.isFinite(exp) || exp <= Date.now()) return null;
	if (!Number.isFinite(listId) || listId <= 0) return null;
	if (!host || !user || !hashSig) return null;
	// Some nginx auth_request subrequests may not carry the access-list variable.
	// In that case expectedListId can be 0 and we trust the signed token list id.
	if (Number(expectedListId) > 0 && expectedListId !== listId) { rejected("session_scope_rejected"); return null; }
	if (expectedHost && expectedHost !== host) { rejected("session_scope_rejected"); return null; }
	return {
		listId,
		host,
		username: user,
		hashSig,
	};
}

router
	.route("/check")
	.all(async (req, res) => {
		const host = getNormalizedHost(req);
		const requestedListId = parseListId(req.headers["x-nyxguard-access-list"] ?? req.query?.list);
		const listId = await getEffectiveAccessListId(host, requestedListId);
		const tokenCandidates = getSessionTokenCandidates(req);
		let parsed = null, rejectedReason = null;
		for (const token of tokenCandidates) {
			const candidate = verifySessionToken(token, {
				expectedListId: listId,
				// Bind access sessions to the protected hostname to prevent cross-host reuse.
				expectedHost: host,
                rejected: reason => { rejectedReason = reason; },
			});
			if (candidate) {
				parsed = candidate;
				break;
			}
		}
		if (!parsed) {
			await logCheckDeny(rejectedReason || "token_unverified", req, { host, listId, requestedListId });
			res.set("X-NyxGuard-Access-List", String(listId));
			res.set("X-NyxGuard-Access-Allowed", "0");
			res.status(401).send("DENY");
			return;
		}
		res.set("X-NyxGuard-Access-List", String(parsed.listId));

		try {
			const userRow = await findAccessUser(parsed.listId, parsed.username);
			if (!userRow?.password) {
				logCheckDeny("user_missing", req, { parsedList: parsed.listId, parsedUser: parsed.username });
				res.set("X-NyxGuard-Access-List", String(listId));
				res.set("X-NyxGuard-Access-Allowed", "0");
				res.status(401).send("DENY");
				return;
			}
			const expectedHashSig = crypto.createHash("sha256").update(String(userRow.password)).digest("hex");
			if (!timingSafeEqualText(parsed.hashSig, expectedHashSig)) {
				logCheckDeny("hash_mismatch", req, { parsedList: parsed.listId, parsedUser: parsed.username });
				res.set("X-NyxGuard-Access-List", String(listId));
				res.set("X-NyxGuard-Access-Allowed", "0");
				res.status(401).send("DENY");
				return;
			}

			res.set("X-NyxGuard-Access-User", parsed.username);
			res.set("X-NyxGuard-Access-Allowed", "1");
			res.status(200).send("OK");
		} catch {
			logCheckDeny("check_exception", req, { parsedList: parsed.listId, parsedUser: parsed.username });
			res.set("X-NyxGuard-Access-Allowed", "0");
			res.status(401).send("DENY");
		}
	});

router
	.route("/session")
	.post(async (req, res) => {
		const requestedListId = parseListId(req.body?.list ?? req.query?.list);
		const username = String(req.body?.username ?? "").trim();
		const password = String(req.body?.password ?? "");
		const requestedRedirect = safeRedirectPath(req.body?.rd ?? req.query?.rd);
		const host = getNormalizedHost(req);
		const listId = await getEffectiveAccessListId(host, requestedListId);
		const externalIp = getClientIp(req);
		const country = getCountry(req);
		const userAgent = String(req.headers["user-agent"] || "");
		const referrer = String(req.headers.referer || "");
		const scheme = String(req.headers["x-nyxguard-scheme"] || req.headers["x-forwarded-proto"] || "http")
			.toLowerCase()
			.split(",")[0]
			.trim();
		const secure = scheme === "https";

		if (!listId || !host || !username || !password) {
			await writeAccessLoginAudit({
				host,
				listId,
				username,
				status: 400,
				result: "failed",
				reason: "missing_credentials",
				requestedListId,
				externalIp,
				country,
				userAgent,
				referrer,
				scheme,
			});
			res.status(400).send({ ok: false, message: "Missing credentials." });
			return;
		}

		try {
			const list = await accessListModel
				.query()
				.select("id")
				.where({ id: listId, is_deleted: 0 })
				.first();
			if (!list?.id) {
				await writeAccessLoginAudit({
					host,
					listId,
					username,
					status: 401,
					result: "failed",
					reason: "invalid_access_list",
					requestedListId,
					externalIp,
					country,
					userAgent,
					referrer,
					scheme,
				});
				res.status(401).send({ ok: false, message: "Invalid access list." });
				return;
			}

			const userRow = await findAccessUser(listId, username);
			if (!userRow?.password) {
				await writeAccessLoginAudit({
					host,
					listId,
					username,
					status: 401,
					result: "failed",
					reason: "invalid_user_or_password",
					externalIp,
					country,
					userAgent,
					referrer,
					scheme,
				});
				res.status(401).send({ ok: false, message: "Invalid username or password." });
				return;
			}

			const ok = await verifyAccessPassword(password, userRow.password);
			if (!ok) {
				await writeAccessLoginAudit({
					host,
					listId,
					username,
					status: 401,
					result: "failed",
					reason: "invalid_user_or_password",
					externalIp,
					country,
					userAgent,
					referrer,
					scheme,
				});
				res.status(401).send({ ok: false, message: "Invalid username or password." });
				return;
			}

			const hashSig = crypto.createHash("sha256").update(String(userRow.password)).digest("hex");
			const redirect = await normalizeRedirectForHost(host, requestedRedirect);
			const payload = {
				v: 1,
				l: listId,
				u: username,
				h: host,
				p: hashSig,
				exp: Date.now() + SESSION_TTL_SEC * 1000,
			};
			const body = b64urlEncode(JSON.stringify(payload));
			const token = `${body}.${signBody(body)}`;

			const cookieBits = [
				`${secure ? SECURE_SESSION_COOKIE : SESSION_COOKIE}=${token}`,
				`Max-Age=${SESSION_TTL_SEC}`,
				`Expires=${new Date(Date.now() + SESSION_TTL_SEC * 1000).toUTCString()}`,
				"Path=/",
				"HttpOnly",
				secure ? "SameSite=None" : "SameSite=Lax",
			];
			if (secure) cookieBits.push("Secure");
			res.setHeader("Set-Cookie", cookieBits.join("; "));
			await writeAccessLoginAudit({
				host,
				listId,
				username,
				status: 200,
				result: "success",
				reason: "authenticated",
				externalIp,
				country,
				userAgent,
				referrer,
				scheme,
			});
			res.status(200).send({ ok: true, redirect });
		} catch {
			await writeAccessLoginAudit({
				host,
				listId,
				username,
				status: 500,
				result: "failed",
				reason: "session_error",
				externalIp,
				country,
				userAgent,
				referrer,
				scheme,
			});
			res.status(500).send({ ok: false, message: "Failed to create session." });
		}
	});

export default router;
