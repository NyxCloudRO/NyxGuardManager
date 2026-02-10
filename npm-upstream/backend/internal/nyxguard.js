import fs from "node:fs/promises";
import net from "node:net";
import path from "node:path";

import internalNginx from "./nginx.js";

const SETTINGS_ID = 1;

const NYXGUARD_CUSTOM_DIR = "/data/nginx/custom";
const HTTP_TOP_CONF = path.join(NYXGUARD_CUSTOM_DIR, "http_top.conf");
const NYXGUARD_HTTP_CONF = path.join(NYXGUARD_CUSTOM_DIR, "nyxguard_http.conf");
const NYXGUARD_SERVER_CONF = path.join(NYXGUARD_CUSTOM_DIR, "nyxguard_server.conf");
const NYXGUARD_GEOIP2_CONF = path.join(NYXGUARD_CUSTOM_DIR, "nyxguard_geoip2.conf");
const NYXGUARD_BOT_CONF = path.join(NYXGUARD_CUSTOM_DIR, "nyxguard_bot.conf");
const NYXGUARD_DDOS_CONF = path.join(NYXGUARD_CUSTOM_DIR, "nyxguard_ddos.conf");
const NYXGUARD_SQLI_CONF = path.join(NYXGUARD_CUSTOM_DIR, "nyxguard_sqli.conf");

const GEOIP_DIR = "/data/geoip";
const GEOIP_COUNTRY_DB = path.join(GEOIP_DIR, "GeoLite2-Country.mmdb");
const GEOIP_IP2LOCATION_DB = path.join(GEOIP_DIR, "IP2Location-Country.mmdb");

const WAF_MARK_BEGIN = "# NyxGuard WAF BEGIN";
const WAF_MARK_END = "# NyxGuard WAF END";
const WAF_BLOCK = `${WAF_MARK_BEGIN}
include /data/nginx/custom/nyxguard_server.conf;
${WAF_MARK_END}`;

const BOT_MARK_BEGIN = "# NyxGuard BOT DEFENSE BEGIN";
const BOT_MARK_END = "# NyxGuard BOT DEFENSE END";
const BOT_BLOCK = `${BOT_MARK_BEGIN}
include /data/nginx/custom/nyxguard_bot.conf;
${BOT_MARK_END}`;

const DDOS_MARK_BEGIN = "# NyxGuard DDOS SHIELD BEGIN";
const DDOS_MARK_END = "# NyxGuard DDOS SHIELD END";
const DDOS_BLOCK = `${DDOS_MARK_BEGIN}
include /data/nginx/custom/nyxguard_ddos.conf;
${DDOS_MARK_END}`;

const SQLI_MARK_BEGIN = "# NyxGuard SQL INJECTION SHIELD BEGIN";
const SQLI_MARK_END = "# NyxGuard SQL INJECTION SHIELD END";
const SQLI_BLOCK = `${SQLI_MARK_BEGIN}
include /data/nginx/custom/nyxguard_sqli.conf;
${SQLI_MARK_END}`;

async function writeAtomic(filePath, contents) {
	const dir = path.dirname(filePath);
	const tmp = path.join(dir, `.${path.basename(filePath)}.${process.pid}.tmp`);
	await fs.writeFile(tmp, contents, { encoding: "utf8" });
	await fs.rename(tmp, filePath);
}

function normalizeText(s) {
	return (s ?? "").replace(/\r\n/g, "\n");
}

function ensureTrailingNewline(s) {
	return s.endsWith("\n") ? s : `${s}\n`;
}

function stripMarkedBlock(text, begin, end) {
	const t = normalizeText(text);
	const re = new RegExp(`\\n?${begin}[\\s\\S]*?${end}\\n?`, "g");
	return t.replace(re, "\n").trimEnd();
}

function buildGeoBlock(varName, cidrs) {
	// Nginx geo blocks must be in http {}.
	// CIDRs are untrusted input; keep it simple and only emit sane-ish patterns.
	const lines = [];
	lines.push(`geo $${varName} {`);
	lines.push(`\tdefault 0;`);
	for (const c of cidrs) {
		lines.push(`\t${c} 1;`);
	}
	lines.push(`}`);
	return lines.join("\n");
}

function sanitizeCidr(value) {
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

function sanitizeCountryCode(value) {
	const v = String(value ?? "").trim().toUpperCase();
	if (!/^[A-Z]{2}$/.test(v)) return null;
	return v;
}

function computeExpiresOn(expiresInDays) {
	if (!expiresInDays) return null;
	const days = Number.parseInt(String(expiresInDays), 10);
	if (Number.isNaN(days) || days <= 0) return null;
	return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

function isExpired(expiresOn) {
	if (!expiresOn) return false;
	const ms = typeof expiresOn === "string" ? Date.parse(expiresOn) : expiresOn instanceof Date ? expiresOn.getTime() : Date.parse(String(expiresOn));
	if (!Number.isFinite(ms)) return false;
	return ms <= Date.now();
}

function clampInt(val, min, max, fallback) {
	const n = Number.parseInt(String(val ?? ""), 10);
	if (!Number.isFinite(n)) return fallback;
	return Math.min(max, Math.max(min, n));
}

function parseTokenList(text, { maxItems = 50, maxLen = 64 } = {}) {
	const raw = String(text ?? "");
	const items = raw
		.split(/\r?\n/)
		.map((s) => s.trim())
		.filter(Boolean)
		.map((s) => (s.length > maxLen ? s.slice(0, maxLen) : s));
	return items.slice(0, maxItems);
}

function escapeRegexLiteral(s) {
	return String(s ?? "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const internalNyxGuard = {
	waf: {
		markBegin: WAF_MARK_BEGIN,
		markEnd: WAF_MARK_END,
		applyAdvancedConfig: (advancedConfig, enabled) => {
			const ac = normalizeText(advancedConfig);
			const re = new RegExp(
				`\\n?${WAF_MARK_BEGIN}[\\s\\S]*?${WAF_MARK_END}\\n?`,
				"g",
			);
			const stripped = ac.replace(re, "\n").trimEnd();
			if (!enabled) {
				return stripped ? ensureTrailingNewline(stripped) : "";
			}
			const next = stripped ? `${ensureTrailingNewline(stripped)}\n${WAF_BLOCK}\n` : `${WAF_BLOCK}\n`;
			return next;
		},
		isEnabledInAdvancedConfig: (advancedConfig) => {
			const ac = normalizeText(advancedConfig);
			return ac.includes(WAF_MARK_BEGIN) && ac.includes(WAF_MARK_END);
		},
	},

	botDefense: {
		markBegin: BOT_MARK_BEGIN,
		markEnd: BOT_MARK_END,
		applyAdvancedConfig: (advancedConfig, enabled) => {
			const stripped = stripMarkedBlock(advancedConfig, BOT_MARK_BEGIN, BOT_MARK_END);
			if (!enabled) {
				return stripped ? ensureTrailingNewline(stripped) : "";
			}
			const next = stripped ? `${ensureTrailingNewline(stripped)}\n${BOT_BLOCK}\n` : `${BOT_BLOCK}\n`;
			return next;
		},
		isEnabledInAdvancedConfig: (advancedConfig) => {
			const ac = normalizeText(advancedConfig);
			return ac.includes(BOT_MARK_BEGIN) && ac.includes(BOT_MARK_END);
		},
	},

	ddos: {
		markBegin: DDOS_MARK_BEGIN,
		markEnd: DDOS_MARK_END,
		applyAdvancedConfig: (advancedConfig, enabled) => {
			const stripped = stripMarkedBlock(advancedConfig, DDOS_MARK_BEGIN, DDOS_MARK_END);
			if (!enabled) {
				return stripped ? ensureTrailingNewline(stripped) : "";
			}
			const next = stripped ? `${ensureTrailingNewline(stripped)}\n${DDOS_BLOCK}\n` : `${DDOS_BLOCK}\n`;
			return next;
		},
		isEnabledInAdvancedConfig: (advancedConfig) => {
			const ac = normalizeText(advancedConfig);
			return ac.includes(DDOS_MARK_BEGIN) && ac.includes(DDOS_MARK_END);
		},
	},

	sqli: {
		markBegin: SQLI_MARK_BEGIN,
		markEnd: SQLI_MARK_END,
		applyAdvancedConfig: (advancedConfig, enabled) => {
			const stripped = stripMarkedBlock(advancedConfig, SQLI_MARK_BEGIN, SQLI_MARK_END);
			if (!enabled) {
				return stripped ? ensureTrailingNewline(stripped) : "";
			}
			const next = stripped ? `${ensureTrailingNewline(stripped)}\n${SQLI_BLOCK}\n` : `${SQLI_BLOCK}\n`;
			return next;
		},
		isEnabledInAdvancedConfig: (advancedConfig) => {
			const ac = normalizeText(advancedConfig);
			return ac.includes(SQLI_MARK_BEGIN) && ac.includes(SQLI_MARK_END);
		},
	},

		settings: {
			get: async (db) => {
				const row = await db("nyxguard_settings").where({ id: SETTINGS_ID }).first();
					if (row) {
						return {
							botDefenseEnabled: !!row.bot_defense_enabled,
							ddosEnabled: !!row.ddos_enabled,
							sqliEnabled: !!row.sqli_enabled,
							logRetentionDays: row.log_retention_days ? Number.parseInt(String(row.log_retention_days), 10) : 30,
							ddosRateRps: clampInt(row.ddos_rate_rps, 1, 10000, 10),
							ddosBurst: clampInt(row.ddos_burst, 0, 100000, 50),
							ddosConnLimit: clampInt(row.ddos_conn_limit, 1, 100000, 30),
							botUaTokens: row.bot_ua_tokens ?? "",
							botPathTokens: row.bot_path_tokens ?? "",
							sqliThreshold: clampInt(row.sqli_threshold, 1, 1000, 8),
							sqliMaxBody: clampInt(row.sqli_max_body, 0, 1048576, 65536),
							sqliProbeMinScore: clampInt(row.sqli_probe_min_score, 0, 1000, 3),
							sqliProbeBanScore: clampInt(row.sqli_probe_ban_score, 1, 100000, 20),
							sqliProbeWindowSec: clampInt(row.sqli_probe_window_sec, 1, 600, 30),
							authfailThreshold: clampInt(row.authfail_threshold, 1, 1000, 5),
							authfailWindowSec: clampInt(row.authfail_window_sec, 5, 3600, 180),
							authfailBanHours: clampInt(row.authfail_ban_hours, 1, 8760, 24),
							authBypassEnabled: typeof row.auth_bypass_enabled === "boolean" ? row.auth_bypass_enabled : !!row.auth_bypass_enabled,
						};
					}
					await db("nyxguard_settings").insert({
						id: SETTINGS_ID,
						bot_defense_enabled: 0,
						ddos_enabled: 0,
						sqli_enabled: 0,
						log_retention_days: 30,
						ddos_rate_rps: 10,
						ddos_burst: 50,
						ddos_conn_limit: 30,
						bot_ua_tokens: "curl\nwget\npython-requests\nlibwww-perl\nnikto\nsqlmap",
						bot_path_tokens: "wp-login.php\nxmlrpc.php",
						sqli_threshold: 8,
						sqli_max_body: 65536,
						sqli_probe_min_score: 3,
						sqli_probe_ban_score: 20,
						sqli_probe_window_sec: 30,
						authfail_threshold: 5,
						authfail_window_sec: 180,
						authfail_ban_hours: 24,
						auth_bypass_enabled: 1,
					});
					return {
						botDefenseEnabled: false,
						ddosEnabled: false,
						sqliEnabled: false,
						logRetentionDays: 30,
						ddosRateRps: 10,
						ddosBurst: 50,
						ddosConnLimit: 30,
						botUaTokens: "curl\nwget\npython-requests\nlibwww-perl\nnikto\nsqlmap",
						botPathTokens: "wp-login.php\nxmlrpc.php",
						sqliThreshold: 8,
						sqliMaxBody: 65536,
						sqliProbeMinScore: 3,
						sqliProbeBanScore: 20,
						sqliProbeWindowSec: 30,
						authfailThreshold: 5,
						authfailWindowSec: 180,
						authfailBanHours: 24,
						authBypassEnabled: true,
					};
				},
				update: async (db, patch) => {
					const current = await internalNyxGuard.settings.get(db);
					const next = {
					botDefenseEnabled:
						typeof patch.botDefenseEnabled === "boolean"
							? patch.botDefenseEnabled
							: current.botDefenseEnabled,
						ddosEnabled: typeof patch.ddosEnabled === "boolean" ? patch.ddosEnabled : current.ddosEnabled,
						sqliEnabled: typeof patch.sqliEnabled === "boolean" ? patch.sqliEnabled : current.sqliEnabled,
						logRetentionDays:
							typeof patch.logRetentionDays === "number" ? patch.logRetentionDays : current.logRetentionDays,
						ddosRateRps: typeof patch.ddosRateRps === "number" ? clampInt(patch.ddosRateRps, 1, 10000, current.ddosRateRps) : current.ddosRateRps,
						ddosBurst: typeof patch.ddosBurst === "number" ? clampInt(patch.ddosBurst, 0, 100000, current.ddosBurst) : current.ddosBurst,
						ddosConnLimit: typeof patch.ddosConnLimit === "number" ? clampInt(patch.ddosConnLimit, 1, 100000, current.ddosConnLimit) : current.ddosConnLimit,
						botUaTokens: typeof patch.botUaTokens === "string" ? patch.botUaTokens : current.botUaTokens,
						botPathTokens: typeof patch.botPathTokens === "string" ? patch.botPathTokens : current.botPathTokens,
						sqliThreshold: typeof patch.sqliThreshold === "number" ? clampInt(patch.sqliThreshold, 1, 1000, current.sqliThreshold) : current.sqliThreshold,
						sqliMaxBody: typeof patch.sqliMaxBody === "number" ? clampInt(patch.sqliMaxBody, 0, 1048576, current.sqliMaxBody) : current.sqliMaxBody,
						sqliProbeMinScore: typeof patch.sqliProbeMinScore === "number" ? clampInt(patch.sqliProbeMinScore, 0, 1000, current.sqliProbeMinScore) : current.sqliProbeMinScore,
						sqliProbeBanScore: typeof patch.sqliProbeBanScore === "number" ? clampInt(patch.sqliProbeBanScore, 1, 100000, current.sqliProbeBanScore) : current.sqliProbeBanScore,
						sqliProbeWindowSec: typeof patch.sqliProbeWindowSec === "number" ? clampInt(patch.sqliProbeWindowSec, 1, 600, current.sqliProbeWindowSec) : current.sqliProbeWindowSec,
						authfailThreshold: typeof patch.authfailThreshold === "number" ? clampInt(patch.authfailThreshold, 1, 1000, current.authfailThreshold) : current.authfailThreshold,
						authfailWindowSec: typeof patch.authfailWindowSec === "number" ? clampInt(patch.authfailWindowSec, 5, 3600, current.authfailWindowSec) : current.authfailWindowSec,
						authfailBanHours: typeof patch.authfailBanHours === "number" ? clampInt(patch.authfailBanHours, 1, 8760, current.authfailBanHours) : current.authfailBanHours,
						authBypassEnabled: typeof patch.authBypassEnabled === "boolean" ? patch.authBypassEnabled : current.authBypassEnabled,
					};

				await db("nyxguard_settings")
					.where({ id: SETTINGS_ID })
						.update({
							bot_defense_enabled: next.botDefenseEnabled ? 1 : 0,
							ddos_enabled: next.ddosEnabled ? 1 : 0,
							sqli_enabled: next.sqliEnabled ? 1 : 0,
							log_retention_days: next.logRetentionDays,
							ddos_rate_rps: next.ddosRateRps,
							ddos_burst: next.ddosBurst,
							ddos_conn_limit: next.ddosConnLimit,
							bot_ua_tokens: next.botUaTokens,
							bot_path_tokens: next.botPathTokens,
							sqli_threshold: next.sqliThreshold,
							sqli_max_body: next.sqliMaxBody,
							sqli_probe_min_score: next.sqliProbeMinScore,
							sqli_probe_ban_score: next.sqliProbeBanScore,
							sqli_probe_window_sec: next.sqliProbeWindowSec,
							authfail_threshold: next.authfailThreshold,
							authfail_window_sec: next.authfailWindowSec,
							authfail_ban_hours: next.authfailBanHours,
							auth_bypass_enabled: next.authBypassEnabled ? 1 : 0,
							modified_on: db.fn.now(),
						});

				return next;
			},
		},

	ipRules: {
		list: async (db) => {
			const rows = await db("nyxguard_ip_rule").select("*").orderBy([{ column: "enabled", order: "desc" }, { column: "id", order: "desc" }]);
			return rows.map((r) => ({
				id: r.id,
				enabled: !!r.enabled,
				action: r.action,
				ipCidr: r.ip_cidr,
				note: r.note ?? null,
				expiresOn: r.expires_on ? new Date(r.expires_on).toISOString() : null,
				createdOn: r.created_on,
				modifiedOn: r.modified_on,
			}));
		},
		get: async (db, id) => {
			const r = await db("nyxguard_ip_rule").where({ id }).first();
			if (!r) return null;
			return {
				id: r.id,
				enabled: !!r.enabled,
				action: r.action,
				ipCidr: r.ip_cidr,
				note: r.note ?? null,
				expiresOn: r.expires_on ? new Date(r.expires_on).toISOString() : null,
				createdOn: r.created_on,
				modifiedOn: r.modified_on,
			};
		},
		create: async (db, data) => {
			const cidr = sanitizeCidr(data.ipCidr);
			if (!cidr) throw new Error("Invalid CIDR/IP value");
			const expiresOn = data.expiresOn ? new Date(data.expiresOn) : computeExpiresOn(data.expiresInDays);
			const [id] = await db("nyxguard_ip_rule").insert({
				enabled: data.enabled === false ? 0 : 1,
				action: data.action === "allow" ? "allow" : "deny",
				ip_cidr: cidr,
				note: data.note ?? null,
				expires_on: expiresOn ?? null,
				created_on: db.fn.now(),
				modified_on: db.fn.now(),
			});
			return id;
		},
		update: async (db, id, data) => {
			const patch = {};
			if (typeof data.enabled === "boolean") patch.enabled = data.enabled ? 1 : 0;
			if (typeof data.action === "string") patch.action = data.action === "allow" ? "allow" : "deny";
			if (typeof data.ipCidr === "string") {
				const cidr = sanitizeCidr(data.ipCidr);
				if (!cidr) throw new Error("Invalid CIDR/IP value");
				patch.ip_cidr = cidr;
			}
			if (typeof data.note !== "undefined") patch.note = data.note ?? null;
			if (typeof data.expiresOn !== "undefined") {
				patch.expires_on = data.expiresOn ? new Date(data.expiresOn) : null;
			}
			if (typeof data.expiresInDays !== "undefined") {
				patch.expires_on = computeExpiresOn(data.expiresInDays);
			}
			patch.modified_on = db.fn.now();
			await db("nyxguard_ip_rule").where({ id }).update(patch);
			return true;
		},
		remove: async (db, id) => {
			await db("nyxguard_ip_rule").where({ id }).delete();
			return true;
		},
	},

	countryRules: {
		list: async (db) => {
			const rows = await db("nyxguard_country_rule")
				.select("*")
				.orderBy([{ column: "enabled", order: "desc" }, { column: "id", order: "desc" }]);
			return rows.map((r) => ({
				id: r.id,
				enabled: !!r.enabled,
				action: r.action,
				countryCode: r.country_code,
				note: r.note ?? null,
				expiresOn: r.expires_on ? new Date(r.expires_on).toISOString() : null,
				createdOn: r.created_on,
				modifiedOn: r.modified_on,
			}));
		},
		get: async (db, id) => {
			const r = await db("nyxguard_country_rule").where({ id }).first();
			if (!r) return null;
			return {
				id: r.id,
				enabled: !!r.enabled,
				action: r.action,
				countryCode: r.country_code,
				note: r.note ?? null,
				expiresOn: r.expires_on ? new Date(r.expires_on).toISOString() : null,
				createdOn: r.created_on,
				modifiedOn: r.modified_on,
			};
		},
		create: async (db, data) => {
			const cc = sanitizeCountryCode(data.countryCode);
			if (!cc) throw new Error("Invalid country code");
			const expiresOn = data.expiresOn ? new Date(data.expiresOn) : computeExpiresOn(data.expiresInDays);
			const [id] = await db("nyxguard_country_rule").insert({
				enabled: data.enabled === false ? 0 : 1,
				action: data.action === "allow" ? "allow" : "deny",
				country_code: cc,
				note: data.note ?? null,
				expires_on: expiresOn ?? null,
				created_on: db.fn.now(),
				modified_on: db.fn.now(),
			});
			return id;
		},
		update: async (db, id, data) => {
			const patch = {};
			if (typeof data.enabled === "boolean") patch.enabled = data.enabled ? 1 : 0;
			if (typeof data.action === "string") patch.action = data.action === "allow" ? "allow" : "deny";
			if (typeof data.countryCode === "string") {
				const cc = sanitizeCountryCode(data.countryCode);
				if (!cc) throw new Error("Invalid country code");
				patch.country_code = cc;
			}
			if (typeof data.note !== "undefined") patch.note = data.note ?? null;
			if (typeof data.expiresOn !== "undefined") {
				patch.expires_on = data.expiresOn ? new Date(data.expiresOn) : null;
			}
			if (typeof data.expiresInDays !== "undefined") {
				patch.expires_on = computeExpiresOn(data.expiresInDays);
			}
			patch.modified_on = db.fn.now();
			await db("nyxguard_country_rule").where({ id }).update(patch);
			return true;
		},
		remove: async (db, id) => {
			await db("nyxguard_country_rule").where({ id }).delete();
			return true;
		},
	},

	nginx: {
		ensureFiles: async () => {
			await fs.mkdir(NYXGUARD_CUSTOM_DIR, { recursive: true });

			// Ensure http_top.conf always includes our nyxguard_http.conf.
			const httpTop = `# Managed by NyxGuard Manager\n# This file is safe to edit, but NyxGuard may overwrite the NyxGuard include.\ninclude ${NYXGUARD_HTTP_CONF};\n`;
			await writeAtomic(HTTP_TOP_CONF, httpTop);

			// Ensure placeholder files exist.
			try {
				await fs.stat(NYXGUARD_HTTP_CONF);
			} catch {
				await writeAtomic(NYXGUARD_HTTP_CONF, "# Managed by NyxGuard Manager\n");
			}
			try {
				await fs.stat(NYXGUARD_SERVER_CONF);
			} catch {
				await writeAtomic(NYXGUARD_SERVER_CONF, "# Managed by NyxGuard Manager\n");
			}
			try {
				await fs.stat(NYXGUARD_BOT_CONF);
			} catch {
				await writeAtomic(NYXGUARD_BOT_CONF, "# Managed by NyxGuard Manager\n");
			}
				try {
					await fs.stat(NYXGUARD_DDOS_CONF);
				} catch {
					await writeAtomic(NYXGUARD_DDOS_CONF, "# Managed by NyxGuard Manager\n");
				}
				try {
					await fs.stat(NYXGUARD_SQLI_CONF);
				} catch {
					await writeAtomic(NYXGUARD_SQLI_CONF, "# Managed by NyxGuard Manager\n");
				}
			},

		apply: async (db) => {
			await internalNyxGuard.nginx.ensureFiles();

			const settings = await internalNyxGuard.settings.get(db);
			const rules = await internalNyxGuard.ipRules.list(db);
			let countryRules = [];
			try {
				countryRules = await internalNyxGuard.countryRules.list(db);
			} catch {
				// ignore if migration not applied yet
			}

			const allowCidrs = rules
				.filter((r) => r.enabled && r.action === "allow" && !isExpired(r.expiresOn))
				.map((r) => sanitizeCidr(r.ipCidr))
				.filter(Boolean);
			const denyCidrs = rules
				.filter((r) => r.enabled && r.action === "deny" && !isExpired(r.expiresOn))
				.map((r) => sanitizeCidr(r.ipCidr))
				.filter(Boolean);

			const allowSet = new Set(allowCidrs);
			const denySet = new Set(denyCidrs);
			const allowList = [...allowSet];
			const denyList = [...denySet];

			const allowCountries = countryRules
				.filter((r) => r.enabled && r.action === "allow" && !isExpired(r.expiresOn))
				.map((r) => sanitizeCountryCode(r.countryCode))
				.filter(Boolean);
			const denyCountries = countryRules
				.filter((r) => r.enabled && r.action === "deny" && !isExpired(r.expiresOn))
				.map((r) => sanitizeCountryCode(r.countryCode))
				.filter(Boolean);
			const allowCountryList = [...new Set(allowCountries)];
			const denyCountryList = [...new Set(denyCountries)];

			let geoipAvailable = false;
			try {
				await fs.stat(GEOIP_COUNTRY_DB);
				geoipAvailable = true;
			} catch {
				geoipAvailable = false;
			}

			let ip2Available = false;
			try {
				await fs.stat(GEOIP_IP2LOCATION_DB);
				ip2Available = true;
			} catch {
				ip2Available = false;
			}
			let ip2Enabled = ip2Available;

			const buildGeoip2Conf = ({ withIp2location }) => {
				const lines = [];
				lines.push("# Managed by NyxGuard Manager");
				lines.push(`# Only included when at least one GeoIP DB exists in ${GEOIP_DIR}.`);
				lines.push("");

				// MaxMind GeoLite2 Country (expected schema: country.iso_code)
				if (geoipAvailable) {
					lines.push(`# MaxMind GeoLite2 Country DB`);
					lines.push(`geoip2 ${GEOIP_COUNTRY_DB} {`);
					lines.push(`    $geoip2_country_code_mm country iso_code;`);
					lines.push(`}`);
					lines.push("");
				}

				// IP2Location Country (expected schema: country_short)
				if (withIp2location && ip2Available) {
					lines.push(`# IP2Location Country DB (fallback)`);
					lines.push(`geoip2 ${GEOIP_IP2LOCATION_DB} {`);
					lines.push(`    $geoip2_country_code_ip2 country_short;`);
					lines.push(`}`);
					lines.push("");
				}

				return ensureTrailingNewline(lines.join("\n"));
			};

			// Write geoip2 include only when a DB exists. If the IP2Location schema isn't compatible,
			// nginx -t will fail; we detect that and fall back to MaxMind-only config automatically.
			try {
				await fs.mkdir(GEOIP_DIR, { recursive: true });
				if (geoipAvailable || ip2Available) {
					await writeAtomic(NYXGUARD_GEOIP2_CONF, buildGeoip2Conf({ withIp2location: true }));
					try {
						await internalNginx.test();
					} catch {
						// Fall back to MaxMind-only (or empty) geoip2 conf so nginx never stays broken.
						await writeAtomic(NYXGUARD_GEOIP2_CONF, buildGeoip2Conf({ withIp2location: false }));
						ip2Enabled = false;
					}
				}
			} catch {
				// ignore
			}

			const httpLines = [];
			httpLines.push("# Managed by NyxGuard Manager");
			httpLines.push("# This file is included in nginx http{} via /data/nginx/custom/http_top.conf");
			httpLines.push("");
			if (geoipAvailable || ip2Enabled) {
				httpLines.push(`# GeoIP2 Country DB (optional)`);
				httpLines.push(`include ${NYXGUARD_GEOIP2_CONF};`);
				httpLines.push("");
			}

			httpLines.push("# Country resolution (CF header preferred; GeoIP2 fallback when installed)");
			if (geoipAvailable || ip2Enabled) {
				if (geoipAvailable && ip2Enabled) {
					// Stage 1: Cloudflare header (if present), else MaxMind.
					httpLines.push("map $http_cf_ipcountry $nyxguard_country_mm {");
					httpLines.push("\tdefault $http_cf_ipcountry;");
					httpLines.push("\t\"\" $geoip2_country_code_mm;");
					httpLines.push("}");
					httpLines.push("");
					// Stage 2: if still empty, fall back to IP2Location.
					httpLines.push("map $nyxguard_country_mm $nyxguard_country {");
					httpLines.push("\tdefault $nyxguard_country_mm;");
					httpLines.push("\t\"\" $geoip2_country_code_ip2;");
					httpLines.push("}");
				} else if (geoipAvailable) {
					httpLines.push("map $http_cf_ipcountry $nyxguard_country {");
						httpLines.push("\tdefault $http_cf_ipcountry;");
						httpLines.push("\t\"\" $geoip2_country_code_mm;");
					httpLines.push("}");
				} else {
					httpLines.push("map $http_cf_ipcountry $nyxguard_country {");
						httpLines.push("\tdefault $http_cf_ipcountry;");
						httpLines.push("\t\"\" $geoip2_country_code_ip2;");
					httpLines.push("}");
				}
			} else {
				httpLines.push("map $http_cf_ipcountry $nyxguard_country {");
				httpLines.push("\tdefault $http_cf_ipcountry;");
				httpLines.push("\t\"\" \"-\";");
				httpLines.push("}");
			}
			httpLines.push("");

				// Allow/Deny maps must be defined before any protection logic can safely reference $nyxguard_allow.
				// (eg. allowlisted IPs must bypass all protections, including rate limiting and bot rules.)
				httpLines.push("# IP allow/deny maps (enforced by protected apps only)");
				httpLines.push(buildGeoBlock("nyxguard_allow", allowList));
				httpLines.push("");
				httpLines.push(buildGeoBlock("nyxguard_deny", denyList));
				httpLines.push("");

				// Login attempt detection for "failed login" auto-ban (authfail).
				// This is intentionally heuristic and biased toward typical auth endpoints.
				httpLines.push("# Login detection (used for failed-login autoban events)");
				httpLines.push("map \"$request_method:$request_uri\" $nyxguard_is_login {");
				httpLines.push("\tdefault 0;");
				httpLines.push("\t~*^(?:POST|PUT|PATCH):(?:/|$) 0;");
				httpLines.push("\t~*^(?:POST|PUT|PATCH):/(?:api/)?(?:auth|login|signin|session|token|oauth)(?:/|\\?|$) 1;");
				httpLines.push("\t~*^(?:POST|PUT|PATCH):/(?:api/)?(?:users/)?(?:sign_in|sign-in|login)(?:/|\\?|$) 1;");
				httpLines.push("\t~*^(?:POST|PUT|PATCH):/(?:api/)?(?:accounts/)?(?:login|signin)(?:/|\\?|$) 1;");
				httpLines.push("\t~*^(?:POST|PUT|PATCH):/(?:api/)?(?:admin/)?(?:login|signin)(?:/|\\?|$) 1;");
				// Nextcloud uses /index.php/login
				httpLines.push("\t~*^(?:POST|PUT|PATCH):/(?:index\\.php/)?login(?:/|\\?|$) 1;");
				httpLines.push("}");
				httpLines.push("");

				// Used to detect "failed login" responses for apps that redirect back to login (302/303).
				httpLines.push("# Login redirect detection (helps classify 302/303 responses as auth failures)");
				httpLines.push("map $upstream_http_location $nyxguard_login_redirect {");
				httpLines.push("\tdefault 0;");
				httpLines.push("\t\"\" 0;");
				httpLines.push("\t~*login 1;");
				httpLines.push("\t~*sign[\\-_]?in 1;");
				httpLines.push("\t~*auth 1;");
				httpLines.push("}");
				httpLines.push("");

				httpLines.push("# Auth bypass toggle (global + per-app overrides)");
				// Default is the global setting. Per-app can force-disable bypass even if global is ON.
				// This is used to decide whether a request should be treated as \"authenticated\" for the purpose
				// of relaxing protections (rate limiting, bot rules, SQL shield correlation, etc).
				const authBypassDisabledHosts = new Set();
				if (settings.authBypassEnabled) {
					try {
						const rows = await db("proxy_host")
							.leftJoin("nyxguard_app", "nyxguard_app.proxy_host_id", "proxy_host.id")
							.select("proxy_host.domain_names", "nyxguard_app.auth_bypass_enabled")
							.where("proxy_host.is_deleted", 0);

						for (const r of rows) {
							const enabled = r.auth_bypass_enabled;
							const isEnabled = typeof enabled === "boolean" ? enabled : enabled == null ? true : !!enabled;
							if (isEnabled) continue;

							let domains = [];
							if (Array.isArray(r.domain_names)) {
								domains = r.domain_names;
							} else if (typeof r.domain_names === "string" && r.domain_names.trim()) {
								try {
									const parsed = JSON.parse(r.domain_names);
									if (Array.isArray(parsed)) domains = parsed;
								} catch {
									// ignore parse errors
								}
							}

							for (const d of domains) {
								if (typeof d === "string" && d.trim()) authBypassDisabledHosts.add(d.trim().toLowerCase());
							}
						}
					} catch {
						// If migration isn't present yet, or table is missing, just fall back to global.
					}
				}

				httpLines.push(`map $host $nyxguard_auth_bypass_enabled {`);
				httpLines.push(`\tdefault ${settings.authBypassEnabled ? 1 : 0};`);
				if (settings.authBypassEnabled && authBypassDisabledHosts.size) {
					for (const h of [...authBypassDisabledHosts].sort()) {
						httpLines.push(`\t\"${h.replace(/\"/g, "")}\" 0;`);
					}
				}
				httpLines.push("}");
				httpLines.push("");

				httpLines.push("# Rate limit zones (used by protected apps only)");
				httpLines.push("# Allowlisted IPs must never be rate-limited.");
				httpLines.push("# Authenticated requests should be far less likely to hit the rate limiter,");
				httpLines.push("# since legitimate users can generate high traffic (uploads/downloads, media streaming, etc).");
				httpLines.push("# This is a heuristic (common auth headers/cookies/params, or Plex token).");
				httpLines.push("map $http_authorization $nyxguard_has_auth_hdr {");
				httpLines.push("\tdefault 0;");
				httpLines.push("\t\"\" 0;");
				httpLines.push("\t~.+ 1;");
				httpLines.push("}");
				httpLines.push("map $http_x_api_key $nyxguard_has_api_key_hdr {");
				httpLines.push("\tdefault 0;");
				httpLines.push("\t\"\" 0;");
				// Quote the regex so nginx doesn't treat '{' and '}' as config block tokens.
				httpLines.push("\t\"~^.{16,}$\" 1;");
				httpLines.push("}");
				httpLines.push("map $http_x_immich_api_key $nyxguard_has_immich_api_key_hdr {");
				httpLines.push("\tdefault 0;");
				httpLines.push("\t\"\" 0;");
				httpLines.push("\t\"~^.{16,}$\" 1;");
				httpLines.push("}");
				httpLines.push("map $http_x_auth_token $nyxguard_has_x_auth_token_hdr {");
				httpLines.push("\tdefault 0;");
				httpLines.push("\t\"\" 0;");
				httpLines.push("\t\"~^.{16,}$\" 1;");
				httpLines.push("}");
				httpLines.push("map $http_x_access_token $nyxguard_has_x_access_token_hdr {");
				httpLines.push("\tdefault 0;");
				httpLines.push("\t\"\" 0;");
				httpLines.push("\t\"~^.{16,}$\" 1;");
				httpLines.push("}");
				httpLines.push("map $http_cookie $nyxguard_has_cookie {");
				httpLines.push("\tdefault 0;");
				httpLines.push("\t\"\" 0;");
				httpLines.push("\t~.+ 1;");
				httpLines.push("}");
				httpLines.push("map $arg_access_token $nyxguard_has_access_token_arg {");
				httpLines.push("\tdefault 0;");
				httpLines.push("\t\"\" 0;");
				httpLines.push("\t\"~^.{16,}$\" 1;");
				httpLines.push("}");
				httpLines.push("map $arg_token $nyxguard_has_token_arg {");
				httpLines.push("\tdefault 0;");
				httpLines.push("\t\"\" 0;");
				httpLines.push("\t\"~^.{16,}$\" 1;");
				httpLines.push("}");
				httpLines.push("map $arg_api_key $nyxguard_has_api_key_arg {");
				httpLines.push("\tdefault 0;");
				httpLines.push("\t\"\" 0;");
				httpLines.push("\t\"~^.{16,}$\" 1;");
				httpLines.push("}");
				httpLines.push("map $arg_apikey $nyxguard_has_apikey_arg {");
				httpLines.push("\tdefault 0;");
				httpLines.push("\t\"\" 0;");
				httpLines.push("\t\"~^.{16,}$\" 1;");
				httpLines.push("}");
				// Plex uses X-Plex-Token in query string and sometimes in headers. In some cases we also
				// want a request_uri fallback, since argument variable mapping can be tricky around '-' vs '_'.
				httpLines.push("map $arg_X_Plex_Token $nyxguard_has_plex_token_arg {");
				httpLines.push("\tdefault 0;");
				httpLines.push("\t\"\" 0;");
				httpLines.push("\t~.+ 1;");
				httpLines.push("}");
				httpLines.push("map $http_x_plex_token $nyxguard_has_plex_token_hdr {");
				httpLines.push("\tdefault 0;");
				httpLines.push("\t\"\" 0;");
				httpLines.push("\t~.+ 1;");
				httpLines.push("}");
				httpLines.push("map $request_uri $nyxguard_has_plex_token_uri {");
				httpLines.push("\tdefault 0;");
				httpLines.push("\t~*X-Plex-Token= 1;");
				httpLines.push("}");
				httpLines.push("map \"$nyxguard_has_plex_token_arg$nyxguard_has_plex_token_hdr$nyxguard_has_plex_token_uri\" $nyxguard_has_plex_token {");
				httpLines.push("\tdefault 0;");
				httpLines.push("\t~1 1;");
				httpLines.push("}");
				httpLines.push(
					"map \"$nyxguard_has_auth_hdr$nyxguard_has_api_key_hdr$nyxguard_has_immich_api_key_hdr$nyxguard_has_x_auth_token_hdr$nyxguard_has_x_access_token_hdr$nyxguard_has_cookie$nyxguard_has_access_token_arg$nyxguard_has_token_arg$nyxguard_has_api_key_arg$nyxguard_has_apikey_arg$nyxguard_has_plex_token\" $nyxguard_is_auth_raw {",
				);
				httpLines.push("\tdefault 0;");
				httpLines.push("\t~1 1;");
				httpLines.push("}");
				httpLines.push("map \"$nyxguard_auth_bypass_enabled:$nyxguard_is_auth_raw\" $nyxguard_is_auth {");
				httpLines.push("\tdefault 0;");
				httpLines.push("\t\"1:1\" 1;");
				httpLines.push("}");
				httpLines.push("");
				httpLines.push("# For requests: allowlisted or authenticated traffic uses a per-request key to avoid 429s.");
				httpLines.push("# Login endpoints should never be rate-limited; brute-force is handled by authfail autoban.");
				httpLines.push("map \"$nyxguard_allow:$nyxguard_is_auth:$nyxguard_is_login\" $nyxguard_rl_req_key {");
				httpLines.push("\tdefault $binary_remote_addr;");
				// Login endpoints: use a per-request key to effectively disable rate limiting on sign-in flows.
				// (Empty string keys would collapse all traffic into one bucket, making rate limiting worse.)
				httpLines.push("\t~^[01]:[01]:1$ \"$msec$connection$connection_requests\";");
				httpLines.push("\t~^1: \"$msec$connection$connection_requests\";");
				httpLines.push("\t~^0:1: \"$msec$connection$connection_requests\";");
				httpLines.push("}");
				httpLines.push("# For connections: allowlisted or authenticated traffic uses a per-connection key.");
				httpLines.push("map \"$nyxguard_allow:$nyxguard_is_auth:$nyxguard_is_login\" $nyxguard_rl_conn_key {");
				httpLines.push("\tdefault $binary_remote_addr;");
				// Login endpoints: use a per-connection key to avoid accidental 429s during auth flows.
				httpLines.push("\t~^[01]:[01]:1$ \"$connection\";");
				httpLines.push("\t~^1: \"$connection\";");
				httpLines.push("\t~^0:1: \"$connection\";");
				httpLines.push("}");
				const ddosRate = clampInt(settings.ddosRateRps, 1, 10000, 10);
				httpLines.push(`limit_req_zone $nyxguard_rl_req_key zone=nyxguard_req:10m rate=${ddosRate}r/s;`);
				httpLines.push('limit_conn_zone $nyxguard_rl_conn_key zone=nyxguard_conn:10m;');
				httpLines.push("");

					httpLines.push("# Bot detection maps (allowlisted IPs bypass bot rules)");
					const botUaTokens = parseTokenList(settings.botUaTokens, { maxItems: 60, maxLen: 80 });
					const botPathTokens = parseTokenList(settings.botPathTokens, { maxItems: 60, maxLen: 80 });
					const uaRe = botUaTokens.length ? botUaTokens.map(escapeRegexLiteral).join("|") : "";
					const pathRe = botPathTokens.length ? botPathTokens.map(escapeRegexLiteral).join("|") : "";
					httpLines.push("map $http_user_agent $nyxguard_bot_ua_raw {");
					httpLines.push("\tdefault 0;");
					if (uaRe) httpLines.push(`\t~*(?:${uaRe}) 1;`);
					httpLines.push("}");
					httpLines.push("map $request_uri $nyxguard_bot_path_raw {");
					httpLines.push("\tdefault 0;");
					if (pathRe) httpLines.push(`\t~*(?:${pathRe}) 1;`);
					httpLines.push("}");
					httpLines.push("# Authenticated requests should not be blocked as bot traffic.");
					httpLines.push("map \"$nyxguard_allow:$nyxguard_is_auth:$nyxguard_bot_ua_raw\" $nyxguard_bot_ua_block {");
					httpLines.push("\tdefault 0;");
					httpLines.push("\t\"0:0:1\" 1;");
				httpLines.push("}");
				httpLines.push("map \"$nyxguard_allow:$nyxguard_is_auth:$nyxguard_bot_path_raw\" $nyxguard_bot_path_block {");
				httpLines.push("\tdefault 0;");
				httpLines.push("\t\"0:0:1\" 1;");
				httpLines.push("}");
				httpLines.push("");
				httpLines.push("# Attack logging (NyxGuard)");
				httpLines.push("# Emits structured JSON lines into /data/logs/nyxguard_attacks.log for ingestion by the backend.");
				// Define the scratch variable in http{} so it can be referenced by maps/log_format.
				// It is later assigned per-request via `set $nyxguard_attack_type ...` in server/location contexts.
				httpLines.push("map \"\" $nyxguard_attack_type { default \"\"; }");
				httpLines.push("");
				// - ddos: generated when our rate limiter returns 429
				// - authfail: 401/403 on likely login endpoint and request not authenticated
				// - authfail can also be inferred from 302/303 redirects back to a login endpoint.
					httpLines.push("map \"$status:$nyxguard_is_login:$nyxguard_is_auth:$nyxguard_login_redirect\" $nyxguard_attack_type_by_status {");
					httpLines.push("\t~^429:0: ddos;");
					httpLines.push("\t~^(401|403):1:0: authfail;");
					httpLines.push("\t~^(302|303):1:0:1$ authfail;");
					httpLines.push('\tdefault "";');
					httpLines.push("}");
				httpLines.push("");
				httpLines.push("map $nyxguard_attack_type $nyxguard_attack_type_final {");
				httpLines.push("\tdefault $nyxguard_attack_type;");
				httpLines.push("\t\"\" $nyxguard_attack_type_by_status;");
				httpLines.push("}");
				httpLines.push("");
				httpLines.push("# Never log allowlisted traffic as an 'attack' (even if it would otherwise match rules).");
				httpLines.push("map \"$nyxguard_allow:$nyxguard_country_allow:$nyxguard_attack_type_final\" $nyxguard_attack_log {");
				httpLines.push("\tdefault 1;");
				httpLines.push("\t~^1: 0;");
				httpLines.push("\t~^0:1: 0;");
				httpLines.push("\t\"0:0:\" 0;");
				httpLines.push("}");
				httpLines.push("");
					httpLines.push(
						"log_format nyxguard_attack escape=json " +
							"'{\"ts\":\"$time_iso8601\",\"ip\":\"$remote_addr\",\"type\":\"$nyxguard_attack_type_final\",\"host\":\"$host\",\"method\":\"$request_method\",\"uri\":\"$request_uri\",\"status\":$status,\"ua\":\"$http_user_agent\",\"ref\":\"$http_referer\",\"auth\":$nyxguard_is_auth}';",
					);
					httpLines.push("");

					// Human-friendly block reason for the custom 403/429 page.
					httpLines.push("map $nyxguard_attack_type_final $nyxguard_block_reason {");
					httpLines.push("\tdefault \"Request blocked\";");
					httpLines.push("\tdeny \"Access blocked\";");
					httpLines.push("\tcountry_deny \"Access blocked\";");
					httpLines.push("\tbot \"Automated traffic blocked\";");
					httpLines.push("\tsqli \"Malicious request blocked\";");
					httpLines.push("\tddos \"Too many requests\";");
					httpLines.push("\tauthfail \"Too many failed sign-in attempts\";");
					httpLines.push("}");
					httpLines.push("map $nyxguard_attack_type_final $nyxguard_block_detail {");
					httpLines.push("\tdefault \"This app is protected by NyxGuard Manager.\";");
					httpLines.push("\tdeny \"Your IP address is currently blocked by a security rule.\";");
					httpLines.push("\tcountry_deny \"Access from your country is blocked by a security rule.\";");
					httpLines.push("\tbot \"Your request matched automated traffic detection.\";");
					httpLines.push("\tsqli \"Your request matched SQL injection protection.\";");
					httpLines.push("\tddos \"Your request rate exceeded the protection threshold.\";");
					httpLines.push("\tauthfail \"This IP was blocked due to repeated failed sign-in attempts.\";");
					httpLines.push("}");
					httpLines.push("");

					httpLines.push("# Lua shared dicts (NyxGuard)");
					httpLines.push("# Used for rolling correlation (eg. SQLi probe accumulation per IP).");
					httpLines.push("lua_shared_dict nyxguard_sqli_ip 10m;");
					httpLines.push("");

			httpLines.push("# Country allow/deny maps (enforced by protected apps only)");
			httpLines.push("map $nyxguard_country $nyxguard_country_allow {");
			httpLines.push("\tdefault 0;");
			for (const cc of allowCountryList) {
				httpLines.push(`\t${cc} 1;`);
			}
			httpLines.push("}");
			httpLines.push("");
			httpLines.push("map $nyxguard_country $nyxguard_country_deny {");
			httpLines.push("\tdefault 0;");
			for (const cc of denyCountryList) {
				httpLines.push(`\t${cc} 1;`);
			}
			httpLines.push("}");
			httpLines.push("");

			await writeAtomic(NYXGUARD_HTTP_CONF, ensureTrailingNewline(httpLines.join("\n")));

			const serverLines = [];
			serverLines.push("# Managed by NyxGuard Manager");
			serverLines.push("# Included inside protected proxy-host server blocks via advanced_config include.");
			serverLines.push("");
			serverLines.push("# Per-request scratch vars (must exist for conditional logging in http{}).");
			serverLines.push('set $nyxguard_attack_type "";');
			serverLines.push("# Attack log (in addition to the per-host access_log set by NPM).");
			serverLines.push("access_log /data/logs/nyxguard_attacks.log nyxguard_attack if=$nyxguard_attack_log;");
			serverLines.push("");
			serverLines.push("# Allow list overrides deny list.");
			serverLines.push("set $nyxguard_block 0;");
			serverLines.push("if ($nyxguard_deny = 1) { set $nyxguard_attack_type \"deny\"; set $nyxguard_block 1; }");
			serverLines.push("if ($nyxguard_country_deny = 1) { set $nyxguard_attack_type \"country_deny\"; set $nyxguard_block 1; }");
			serverLines.push("if ($nyxguard_allow = 1) { set $nyxguard_block 0; }");
			serverLines.push("if ($nyxguard_country_allow = 1) { set $nyxguard_block 0; }");
			serverLines.push("if ($nyxguard_block = 1) { return 403; }");
			serverLines.push("");

			// Branded block pages for protected apps.
			serverLines.push("recursive_error_pages off;");
			serverLines.push("error_page 403 = @nyxguard_blocked_403;");
			serverLines.push("error_page 429 = @nyxguard_blocked_429;");
			serverLines.push("");
			serverLines.push("# NyxGuard static asset (served only by the proxy, not the upstream app)");
			serverLines.push("location = /_nyxguard/fav.png {");
			serverLines.push("\taccess_log off;");
			serverLines.push("\tadd_header Cache-Control \"public, max-age=86400\" always;");
			serverLines.push("\tdefault_type image/png;");
			serverLines.push("\talias /var/www/nyxguard/fav.png;");
			serverLines.push("}");
			serverLines.push("");
			serverLines.push("location @nyxguard_blocked_403 {");
			serverLines.push("\tinternal;");
			serverLines.push("\tadd_header Cache-Control \"no-store\" always;");
			serverLines.push("\tdefault_type text/html;");
			serverLines.push(
				"\treturn 403 '<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>Blocked | NyxGuard</title><link rel=\"icon\" href=\"/_nyxguard/fav.png\"><style>html,body{height:100%}body{margin:0;font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Ubuntu,Cantarell,Noto Sans,Helvetica,Arial;color:#e9edf6;background:radial-gradient(1200px 600px at 15% 10%,#2b62ff55 0%,transparent 60%),radial-gradient(900px 500px at 85% 15%,#ff2bbd33 0%,transparent 55%),linear-gradient(135deg,#0b1330 0%,#1a0e2b 55%,#190b22 100%)}.wrap{min-height:100%;display:flex;align-items:center;justify-content:center;padding:28px}.card{width:min(760px,100%);background:linear-gradient(180deg,rgba(255,255,255,.06),rgba(255,255,255,.03));border:1px solid rgba(255,255,255,.10);border-radius:18px;box-shadow:0 30px 80px rgba(0,0,0,.45);overflow:hidden}.top{display:flex;gap:14px;align-items:center;padding:18px 18px 0}.mark{width:44px;height:44px;border-radius:12px;background:rgba(255,255,255,.06);display:grid;place-items:center;border:1px solid rgba(255,255,255,.12)}.mark img{width:26px;height:26px;object-fit:contain}.brand{font-weight:700;letter-spacing:.2px}.body{padding:18px}.h1{margin:10px 0 6px;font-size:22px}.p{margin:0 0 14px;opacity:.92;line-height:1.45}.meta{display:grid;grid-template-columns:1fr;gap:10px;margin-top:14px}.row{display:flex;flex-wrap:wrap;gap:10px;align-items:center;padding:10px 12px;border-radius:12px;background:rgba(0,0,0,.25);border:1px solid rgba(255,255,255,.08)}.k{opacity:.8}.v{font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace}.pill{margin-left:auto;padding:4px 10px;border-radius:999px;background:rgba(43,98,255,.18);border:1px solid rgba(43,98,255,.35);color:#dbe7ff;font-size:12px}.foot{padding:14px 18px;border-top:1px solid rgba(255,255,255,.10);opacity:.85;font-size:13px}</style></head><body><div class=\"wrap\"><div class=\"card\"><div class=\"top\"><div class=\"mark\"><img src=\"/_nyxguard/fav.png\" alt=\"NyxGuard\"></div><div><div class=\"brand\">NyxGuard Manager</div><div style=\"opacity:.8;font-size:13px\">Security Gateway</div></div></div><div class=\"body\"><div class=\"pill\">$nyxguard_block_reason</div><div class=\"h1\">Request blocked (403)</div><p class=\"p\">$nyxguard_block_detail</p><div class=\"meta\"><div class=\"row\"><span class=\"k\">Client IP</span><span class=\"v\">$remote_addr</span></div><div class=\"row\"><span class=\"k\">Host</span><span class=\"v\">$host</span></div><div class=\"row\"><span class=\"k\">Time</span><span class=\"v\">$time_iso8601</span></div><div class=\"row\"><span class=\"k\">Reference</span><span class=\"v\">CF-Ray:$http_cf_ray</span></div></div></div><div class=\"foot\">This app is protected by NyxGuard. If you believe this is an error, contact the administrator and provide the details above.</div></div></div></body></html>';"
			);
			serverLines.push("}");
			serverLines.push("");
			serverLines.push("location @nyxguard_blocked_429 {");
			serverLines.push("\tinternal;");
			serverLines.push("\tadd_header Retry-After \"5\" always;");
			serverLines.push("\tadd_header Cache-Control \"no-store\" always;");
			serverLines.push("\tdefault_type text/html;");
			serverLines.push(
				"\treturn 429 '<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>Too Many Requests | NyxGuard</title><link rel=\"icon\" href=\"/_nyxguard/fav.png\"><style>html,body{height:100%}body{margin:0;font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Ubuntu,Cantarell,Noto Sans,Helvetica,Arial;color:#e9edf6;background:radial-gradient(1200px 600px at 15% 10%,#2b62ff55 0%,transparent 60%),radial-gradient(900px 500px at 85% 15%,#ff2bbd33 0%,transparent 55%),linear-gradient(135deg,#0b1330 0%,#1a0e2b 55%,#190b22 100%)}.wrap{min-height:100%;display:flex;align-items:center;justify-content:center;padding:28px}.card{width:min(760px,100%);background:linear-gradient(180deg,rgba(255,255,255,.06),rgba(255,255,255,.03));border:1px solid rgba(255,255,255,.10);border-radius:18px;box-shadow:0 30px 80px rgba(0,0,0,.45);overflow:hidden}.top{display:flex;gap:14px;align-items:center;padding:18px 18px 0}.mark{width:44px;height:44px;border-radius:12px;background:rgba(255,255,255,.06);display:grid;place-items:center;border:1px solid rgba(255,255,255,.12)}.mark img{width:26px;height:26px;object-fit:contain}.brand{font-weight:700;letter-spacing:.2px}.body{padding:18px}.h1{margin:10px 0 6px;font-size:22px}.p{margin:0 0 14px;opacity:.92;line-height:1.45}.meta{display:grid;grid-template-columns:1fr;gap:10px;margin-top:14px}.row{display:flex;flex-wrap:wrap;gap:10px;align-items:center;padding:10px 12px;border-radius:12px;background:rgba(0,0,0,.25);border:1px solid rgba(255,255,255,.08)}.k{opacity:.8}.v{font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace}.pill{margin-left:auto;padding:4px 10px;border-radius:999px;background:rgba(255,60,100,.18);border:1px solid rgba(255,60,100,.35);color:#ffdbe3;font-size:12px}.foot{padding:14px 18px;border-top:1px solid rgba(255,255,255,.10);opacity:.85;font-size:13px}</style></head><body><div class=\"wrap\"><div class=\"card\"><div class=\"top\"><div class=\"mark\"><img src=\"/_nyxguard/fav.png\" alt=\"NyxGuard\"></div><div><div class=\"brand\">NyxGuard Manager</div><div style=\"opacity:.8;font-size:13px\">Security Gateway</div></div></div><div class=\"body\"><div class=\"pill\">$nyxguard_block_reason</div><div class=\"h1\">Too many requests (429)</div><p class=\"p\">Please slow down and try again. This limit protects the service from abuse.</p><div class=\"meta\"><div class=\"row\"><span class=\"k\">Client IP</span><span class=\"v\">$remote_addr</span></div><div class=\"row\"><span class=\"k\">Host</span><span class=\"v\">$host</span></div><div class=\"row\"><span class=\"k\">Time</span><span class=\"v\">$time_iso8601</span></div><div class=\"row\"><span class=\"k\">Reference</span><span class=\"v\">CF-Ray:$http_cf_ray</span></div></div></div><div class=\"foot\">This app is protected by NyxGuard. If you are a legitimate user and see this repeatedly, contact the administrator.</div></div></div></body></html>';"
			);
			serverLines.push("}");
			serverLines.push("");

			await writeAtomic(NYXGUARD_SERVER_CONF, ensureTrailingNewline(serverLines.join("\n")));

			// Per-app include files: content depends on global toggles. Apps include these files when enabled.
				try {
					const botLines = [];
					botLines.push("# Managed by NyxGuard Manager");
					if (settings.botDefenseEnabled) {
						botLines.push("# Bot Defense (enabled globally)");
						botLines.push('if ($nyxguard_bot_ua_block = 1) { set $nyxguard_attack_type "bot"; return 403; }');
						botLines.push('if ($nyxguard_bot_path_block = 1) { set $nyxguard_attack_type "bot"; return 404; }');
					} else {
						botLines.push("# Bot Defense is disabled globally.");
					}
					await writeAtomic(NYXGUARD_BOT_CONF, ensureTrailingNewline(botLines.join("\n")));
				} catch {
					// ignore
				}

				try {
					const ddosLines = [];
					ddosLines.push("# Managed by NyxGuard Manager");
					if (settings.ddosEnabled) {
						const conn = clampInt(settings.ddosConnLimit, 1, 100000, 30);
						const burst = clampInt(settings.ddosBurst, 0, 100000, 50);
						ddosLines.push("# DDoS Shield (enabled globally)");
						ddosLines.push("limit_req_status 429;");
						ddosLines.push("limit_conn_status 429;");
						ddosLines.push(`limit_conn nyxguard_conn ${conn};`);
						ddosLines.push(`limit_req zone=nyxguard_req burst=${burst} nodelay;`);
					} else {
						ddosLines.push("# DDoS Shield is disabled globally.");
					}
					await writeAtomic(NYXGUARD_DDOS_CONF, ensureTrailingNewline(ddosLines.join("\n")));
				} catch {
				// ignore
			}

				try {
					const sqliLines = [];
					sqliLines.push("# Managed by NyxGuard Manager");
						if (settings.sqliEnabled) {
							sqliLines.push("# SQL Injection Shield (enabled globally)");
							sqliLines.push("");
							sqliLines.push("# SQLi detection (normalized + scored; includes small request body inspection).");
							sqliLines.push("# Tuning knobs:");
								sqliLines.push("# - $nyxguard_sqli_threshold: block when score >= threshold");
								sqliLines.push("# - $nyxguard_sqli_max_body: max body bytes to inspect (larger bodies are skipped)");
								sqliLines.push(`set $nyxguard_sqli_threshold ${clampInt(settings.sqliThreshold, 1, 1000, 8)};`);
								sqliLines.push(`set $nyxguard_sqli_max_body ${clampInt(settings.sqliMaxBody, 0, 1048576, 65536)};`);
								sqliLines.push("# Rolling correlation (per-IP): accumulate suspicious scores over a short window.");
								sqliLines.push(`set $nyxguard_sqli_probe_min_score ${clampInt(settings.sqliProbeMinScore, 0, 1000, 3)};`);
								sqliLines.push(`set $nyxguard_sqli_probe_ban_score ${clampInt(settings.sqliProbeBanScore, 1, 100000, 20)};`);
								sqliLines.push(`set $nyxguard_sqli_probe_window ${clampInt(settings.sqliProbeWindowSec, 1, 600, 30)};`);
								sqliLines.push("");
								sqliLines.push("access_by_lua_block {");
							// Allowlisted IPs and countries must bypass SQL Shield entirely.
							sqliLines.push("  if ngx.var.nyxguard_allow == \"1\" or ngx.var.nyxguard_country_allow == \"1\" then return end");
							// Authenticated requests should not be blocked by SQL Shield (avoid breaking legitimate logged-in usage).
							sqliLines.push("  if ngx.var.nyxguard_is_auth == \"1\" then return end");
							sqliLines.push("  local threshold = tonumber(ngx.var.nyxguard_sqli_threshold) or 8");
							sqliLines.push("  local max_body = tonumber(ngx.var.nyxguard_sqli_max_body) or 65536");
							sqliLines.push("");
							sqliLines.push("  local cjson = require \"cjson.safe\"");
							sqliLines.push("");
							sqliLines.push("  -- Map common Unicode fullwidth ASCII to regular ASCII (homoglyph bypass hardening).");
							sqliLines.push("  local function defullwidth(s)");
							sqliLines.push("    if not s or s == \"\" then return \"\" end");
							sqliLines.push("    local out = {}");
							sqliLines.push("    for c in s:gmatch(\"[%z\\1-\\127\\194-\\244][\\128-\\191]*\") do");
							sqliLines.push("      local b1 = c:byte(1)");
							sqliLines.push("      if not b1 then out[#out+1] = c");
							sqliLines.push("      elseif b1 < 0x80 then out[#out+1] = c");
							sqliLines.push("      else");
							sqliLines.push("        local cp");
							sqliLines.push("        if b1 < 0xE0 then");
							sqliLines.push("          local b2 = c:byte(2) or 0");
							sqliLines.push("          cp = (b1 - 0xC0) * 0x40 + (b2 - 0x80)");
							sqliLines.push("        elseif b1 < 0xF0 then");
							sqliLines.push("          local b2 = c:byte(2) or 0");
							sqliLines.push("          local b3 = c:byte(3) or 0");
							sqliLines.push("          cp = (b1 - 0xE0) * 0x1000 + (b2 - 0x80) * 0x40 + (b3 - 0x80)");
							sqliLines.push("        else");
							sqliLines.push("          local b2 = c:byte(2) or 0");
							sqliLines.push("          local b3 = c:byte(3) or 0");
							sqliLines.push("          local b4 = c:byte(4) or 0");
							sqliLines.push("          cp = (b1 - 0xF0) * 0x40000 + (b2 - 0x80) * 0x1000 + (b3 - 0x80) * 0x40 + (b4 - 0x80)");
							sqliLines.push("        end");
							sqliLines.push("        if cp and cp >= 0xFF10 and cp <= 0xFF19 then");
							sqliLines.push("          out[#out+1] = string.char(cp - 0xFF10 + 48)");
							sqliLines.push("        elseif cp and cp >= 0xFF21 and cp <= 0xFF3A then");
							sqliLines.push("          out[#out+1] = string.char(cp - 0xFF21 + 65)");
							sqliLines.push("        elseif cp and cp >= 0xFF41 and cp <= 0xFF5A then");
							sqliLines.push("          out[#out+1] = string.char(cp - 0xFF41 + 97)");
							sqliLines.push("        else");
							sqliLines.push("          out[#out+1] = c");
							sqliLines.push("        end");
							sqliLines.push("      end");
							sqliLines.push("    end");
							sqliLines.push("    return table.concat(out)");
							sqliLines.push("  end");
							sqliLines.push("");
							sqliLines.push("  local function normalize(s)");
							sqliLines.push("    if not s or s == \"\" then return \"\" end");
							sqliLines.push("    if #s > 16384 then s = string.sub(s, 1, 16384) end");
							sqliLines.push("    s = defullwidth(s)");
							sqliLines.push("    s = string.gsub(s, \"\\0\", \"\")");
							sqliLines.push("    s = string.gsub(s, \"%+\", \" \")");
							sqliLines.push("    for _ = 1, 2 do");
							sqliLines.push("      if string.find(s, \"%%\", 1, true) then");
								sqliLines.push("        s = ngx.unescape_uri(s)");
						sqliLines.push("      else");
						sqliLines.push("        break");
							sqliLines.push("      end");
							sqliLines.push("    end");
							sqliLines.push("    s = string.lower(s)");
							sqliLines.push("    -- Strip combining diacritics and collapse comment blocks used for keyword splitting (sel/**/ect).");
							sqliLines.push("    s = ngx.re.gsub(s, \"[\\\\x{0300}-\\\\x{036f}]\", \"\", \"ujo\")");
							sqliLines.push("    s = ngx.re.gsub(s, [[/\\*.*?\\*/]], \" \", \"ijos\")");
							sqliLines.push("    s = ngx.re.gsub(s, [[--+]], \" \", \"ijo\")");
							sqliLines.push("    s = ngx.re.gsub(s, [[#]], \" \", \"ijo\")");
							sqliLines.push("    s = string.gsub(s, \"%s+\", \" \")");
							sqliLines.push("    return s");
							sqliLines.push("  end");
						sqliLines.push("");
						sqliLines.push("  local function any_match(s, re)");
						sqliLines.push("    if not s or s == \"\" then return false end");
						sqliLines.push("    local from = ngx.re.find(s, re, \"ijo\")");
						sqliLines.push("    return from ~= nil");
						sqliLines.push("  end");
						sqliLines.push("");
							sqliLines.push("  local function score_text(s)");
							sqliLines.push("    local score = 0");
							sqliLines.push("    if not s or s == \"\" then return 0 end");
							sqliLines.push("    local s_nows = ngx.re.gsub(s, \"\\\\s+\", \"\", \"jo\")");
							sqliLines.push("");
						sqliLines.push("    -- Classic boolean probes / tautologies");
						sqliLines.push("    if any_match(s, [[(?:'|%27|%2527|\\\"|%22|%2522)\\s*(?:or|and)\\s*(?:'|%27|%2527|\\\"|%22|%2522)?\\s*\\d+\\s*(?:=|like)\\s*\\d+]]) then score = score + 6 end");
						sqliLines.push("    if any_match(s, [[(?:'|%27|%2527)\\s*(?:or|and)\\s*1\\s*=\\s*1]]) then score = score + 6 end");
						sqliLines.push("");
							sqliLines.push("    -- UNION / schema enumeration");
							sqliLines.push("    if any_match(s, [[(?:^|[^a-z0-9_])union(?:\\s|%20|\\+)+select(?:\\s|%20|\\+)+]]) then score = score + 7 end");
							sqliLines.push("    if any_match(s_nows, [[(?:^|[^a-z0-9_])unionselect]]) then score = score + 6 end");
							sqliLines.push("    if any_match(s, [[information_schema|pg_catalog|sqlite_master|sys\\.objects]]) then score = score + 4 end");
							sqliLines.push("    if any_match(s_nows, [[information_schema|pg_catalog|sqlite_master|sys\\.objects]]) then score = score + 3 end");
							sqliLines.push("");
							sqliLines.push("    -- Time-based probes");
							sqliLines.push("    if any_match(s, [[\\bsleep\\s*\\(|\\bbenchmark\\s*\\(|\\bwaitfor(?:\\s|%20)+delay\\b]]) then score = score + 6 end");
							sqliLines.push("    if any_match(s_nows, [[\\bsleep\\(|\\bbenchmark\\(|\\bwaitfordelay\\b]]) then score = score + 5 end");
							sqliLines.push("");
							sqliLines.push("    -- Stacked queries / comments");
							sqliLines.push("    if any_match(s, [[(?:;|%3b)\\s*(?:select|insert|update|delete|drop|create|alter|truncate)\\b]]) then score = score + 7 end");
							sqliLines.push("    if any_match(s_nows, [[(?:;|%3b)(?:select|insert|update|delete|drop|create|alter|truncate)\\b]]) then score = score + 6 end");
							// Use quoted string (not long-bracket) to avoid Lua parsing edge cases when patterns end with ']'.
							sqliLines.push("    if any_match(s, \"(?:--|%2d%2d|#|%23|/\\\\*|%2f%2a|%252f%252a)\") then score = score + 4 end");
							sqliLines.push("");
								sqliLines.push("    -- Dangerous functions / file ops / OS exec");
								sqliLines.push("    if any_match(s, [[\\b(load_file|into(?:\\s|%20)+outfile|xp_cmdshell)\\b]]) then score = score + 7 end");
								sqliLines.push("    if any_match(s_nows, [[\\b(load_file|intooutfile|xp_cmdshell)\\b]]) then score = score + 6 end");
								sqliLines.push("");
							sqliLines.push("    -- Hex / char-encoded payloads (evades simple keyword regexes)");
							sqliLines.push("    if any_match(s, [[0x[0-9a-f]{6,}]]) then score = score + 4 end");
								sqliLines.push("    if any_match(s, [[\\bchar\\s*\\(\\s*\\d+(?:\\s*,\\s*\\d+){3,}\\s*\\)]]) then score = score + 6 end");
								sqliLines.push("    if any_match(s, [[\\bunhex\\s*\\(]]) then score = score + 4 end");
								sqliLines.push("");
								sqliLines.push("    -- Lightweight anomaly signals to reduce simple bypasses (comment splitting / heavy operators)");
								sqliLines.push("    -- Guard these heuristics behind a \"suspicious token\" check to reduce false positives");
								sqliLines.push("    -- on legitimate long query-strings (eg. some APIs and apps like Plex).");
								sqliLines.push("    local has_tokens = any_match(s, [[(?:'|%27|%2527|\\\"|%22|%2522|;|%3b|/\\*|%2f%2a|%252f%252a|--|%2d%2d|#|%23|\\b(?:union|select|where|from|sleep|benchmark|waitfor|information_schema|pg_catalog|sqlite_master|sys\\.objects|load_file|xp_cmdshell|unhex|char)\\b|0x[0-9a-f]{6,})]])");
								sqliLines.push("    if has_tokens then");
								sqliLines.push("      local _, n_ops = string.gsub(s, \"[=%(%)%*%/<>]\", \"\")");
								sqliLines.push("      if n_ops >= 12 then score = score + 2 end");
								sqliLines.push("      if #s >= 512 then score = score + 2 end");
								sqliLines.push("      -- Operator/keyword density: typical of automated SQLi payloads.");
								sqliLines.push("      local _, n_eq = string.gsub(s, \"=\", \"\")");
								sqliLines.push("      if n_eq >= 6 then score = score + 2 end");
								sqliLines.push("      if any_match(s, [[=\\s*=|!=|<>|\\|\\|]]) then score = score + 2 end");
								sqliLines.push("      local _, n_or = string.gsub(s, \" or \", \"\")");
								sqliLines.push("      if n_or >= 2 then score = score + 2 end");
								sqliLines.push("      local _, n_and = string.gsub(s, \" and \", \"\")");
								sqliLines.push("      if n_and >= 2 then score = score + 2 end");
								sqliLines.push("      if any_match(s, [[\\b(?:or|and)\\b\\s+\\d+\\s*=\\s*\\d+]]) then score = score + 2 end");
								sqliLines.push("    end");
							sqliLines.push("");
						sqliLines.push("    return score");
						sqliLines.push("  end");
							sqliLines.push("");
							sqliLines.push("  local score = 0");
							sqliLines.push("  local uri = normalize(ngx.var.request_uri or \"\")");
							sqliLines.push("  score = score + score_text(uri)");
							sqliLines.push("");
							sqliLines.push("  -- Query-string inspection by parameter/value to reduce false positives.");
							sqliLines.push("  local uargs = ngx.req.get_uri_args(100)");
							sqliLines.push("  for k, v in pairs(uargs) do");
							sqliLines.push("    if type(k) == \"string\" and k ~= \"\" then");
							sqliLines.push("      score = score + score_text(normalize(k))");
							sqliLines.push("    end");
							sqliLines.push("    local function score_val(val)");
							sqliLines.push("      local vs = normalize(tostring(val))");
							sqliLines.push("      score = score + score_text(vs)");
							sqliLines.push("      -- Heuristic parameter-type awareness: numeric-ish params containing letters/operators are suspicious.");
							sqliLines.push("      if type(k) == \"string\" and (k == \"id\" or k == \"page\" or k == \"limit\" or k == \"offset\" or k == \"count\") then");
							// Avoid Lua long-bracket strings here because the regex ends with a ']' which would create ']]]' and break parsing.
							sqliLines.push("        if any_match(vs, \"[^0-9\\\\s\\\\-\\\\+]\") then score = score + 2 end");
							sqliLines.push("      end");
							sqliLines.push("    end");
							sqliLines.push("    if type(v) == \"table\" then");
							sqliLines.push("      for _, vv in ipairs(v) do score_val(vv) end");
							sqliLines.push("    elseif v ~= nil then");
							sqliLines.push("      score_val(v)");
							sqliLines.push("    end");
							sqliLines.push("  end");
							sqliLines.push("");
						sqliLines.push("  -- Inspect small request bodies for POST/PUT/PATCH/DELETE (JSON and form data are common SQLi carriers).");
						sqliLines.push("  local method = ngx.req.get_method()");
						sqliLines.push("  if method == \"POST\" or method == \"PUT\" or method == \"PATCH\" or method == \"DELETE\" then");
						sqliLines.push("    local headers = ngx.req.get_headers()");
						sqliLines.push("    local cl = tonumber(headers[\"content-length\"])");
						sqliLines.push("    if not cl or cl <= max_body then");
						sqliLines.push("      local ct = headers[\"content-type\"] or \"\"");
						sqliLines.push("      ct = string.lower(ct)");
						sqliLines.push("      local is_json = string.find(ct, \"application/json\", 1, true) ~= nil");
						sqliLines.push("      local is_form = string.find(ct, \"application/x-www-form-urlencoded\", 1, true) ~= nil");
						sqliLines.push("      local is_text = string.find(ct, \"text/plain\", 1, true) ~= nil");
						sqliLines.push("      if is_json or is_form or is_text or ct == \"\" then");
						sqliLines.push("        ngx.req.read_body()");
						sqliLines.push("        local body = ngx.req.get_body_data()");
						sqliLines.push("        if not body then");
						sqliLines.push("          local f = ngx.req.get_body_file()");
						sqliLines.push("          if f then");
						sqliLines.push("            local fh = io.open(f, \"rb\")");
						sqliLines.push("            if fh then");
						sqliLines.push("              body = fh:read(max_body + 1)");
						sqliLines.push("              fh:close()");
						sqliLines.push("            end");
						sqliLines.push("          end");
							sqliLines.push("        end");
							sqliLines.push("        if body and #body <= max_body then");
							sqliLines.push("          local nb = normalize(body)");
							sqliLines.push("          score = score + score_text(nb)");
							sqliLines.push("");
							sqliLines.push("          -- If JSON, also decode and inspect keys/values individually to reduce obfuscation.");
							sqliLines.push("          if is_json then");
							sqliLines.push("            local obj = cjson.decode(body)");
							sqliLines.push("            if obj ~= nil then");
							sqliLines.push("              local seen = 0");
							sqliLines.push("              local function walk(x, depth)");
							sqliLines.push("                if seen >= 200 or depth >= 6 then return end");
							sqliLines.push("                local tx = type(x)");
							sqliLines.push("                if tx == \"table\" then");
							sqliLines.push("                  for kk, vv in pairs(x) do");
							sqliLines.push("                    seen = seen + 1");
							sqliLines.push("                    if type(kk) == \"string\" and kk ~= \"\" then");
							sqliLines.push("                      score = score + score_text(normalize(kk))");
							sqliLines.push("                    end");
							sqliLines.push("                    walk(vv, depth + 1)");
							sqliLines.push("                    if seen >= 200 then return end");
							sqliLines.push("                  end");
							sqliLines.push("                elseif tx == \"string\" then");
							sqliLines.push("                  score = score + score_text(normalize(x))");
							sqliLines.push("                end");
							sqliLines.push("              end");
							sqliLines.push("              walk(obj, 0)");
							sqliLines.push("            end");
							sqliLines.push("          end");
							sqliLines.push("        end");
						sqliLines.push("      end");
						sqliLines.push("    end");
							sqliLines.push("  end");
							sqliLines.push("");
							sqliLines.push("  -- Hard block when threshold is hit.");
							sqliLines.push("  if score >= threshold then");
							sqliLines.push("    ngx.var.nyxguard_attack_type = \"sqli\"");
							sqliLines.push("    return ngx.exit(ngx.HTTP_FORBIDDEN)");
							sqliLines.push("  end");
							sqliLines.push("");
							sqliLines.push("  -- Rolling correlation: repeated low/medium-score probes should eventually block.");
							sqliLines.push("  local probe_min = tonumber(ngx.var.nyxguard_sqli_probe_min_score) or 3");
							sqliLines.push("  local ban_score = tonumber(ngx.var.nyxguard_sqli_probe_ban_score) or 20");
							sqliLines.push("  local window = tonumber(ngx.var.nyxguard_sqli_probe_window) or 30");
							sqliLines.push("  if score >= probe_min then");
							sqliLines.push("    local sh = ngx.shared.nyxguard_sqli_ip");
							sqliLines.push("    local ip = ngx.var.remote_addr or \"\"");
							sqliLines.push("    if sh and ip ~= \"\" then");
							sqliLines.push("      local key = \"sqli:\" .. ip");
							sqliLines.push("      local total, _ = sh:incr(key, score, 0, window)");
							sqliLines.push("      if total and total >= ban_score then");
							sqliLines.push("        ngx.var.nyxguard_attack_type = \"sqli\"");
							sqliLines.push("        return ngx.exit(ngx.HTTP_FORBIDDEN)");
							sqliLines.push("      end");
							sqliLines.push("    end");
							sqliLines.push("  end");
							sqliLines.push("}");
					} else {
						sqliLines.push("# SQL Injection Shield is disabled globally.");
					}
					await writeAtomic(NYXGUARD_SQLI_CONF, ensureTrailingNewline(sqliLines.join("\n")));
				} catch {
				// ignore
			}

				// Apply log retention to NPM's logrotate configuration.
				// This controls how long the nginx access/error logs are kept on disk.
				try {
				const days = [30, 60, 90, 180].includes(settings.logRetentionDays) ? settings.logRetentionDays : 30;
				const logrotateConf =
					`/data/logs/*_access.log /data/logs/*/access.log {\n` +
					`    su npm npm\n` +
					`    create 0644\n` +
					`    daily\n` +
					`    rotate ${days}\n` +
					`    missingok\n` +
					`    notifempty\n` +
					`    compress\n` +
					`    sharedscripts\n` +
					`    postrotate\n` +
					`    kill -USR1 $(cat /run/nginx/nginx.pid 2>/dev/null) 2>/dev/null || true\n` +
					`    endscript\n` +
					`}\n\n` +
					`/data/logs/*_error.log /data/logs/*/error.log {\n` +
					`    su npm npm\n` +
					`    create 0644\n` +
					`    daily\n` +
					`    rotate ${days}\n` +
					`    missingok\n` +
					`    notifempty\n` +
					`    compress\n` +
					`    sharedscripts\n` +
					`    postrotate\n` +
					`    kill -USR1 $(cat /run/nginx/nginx.pid 2>/dev/null) 2>/dev/null || true\n` +
					`    endscript\n` +
					`}\n`;
				await fs.writeFile("/etc/logrotate.d/nginx-proxy-manager", logrotateConf, { encoding: "utf8" });
			} catch {
				// Ignore failures; nginx reload should still work.
			}

			// Enrich access logs with country when behind Cloudflare.
			// Uses NyxGuard's resolved country which can be backed by GeoIP2 (optional).
			try {
				const logProxyConf =
					`log_format proxy ` +
					`'[$time_local] $upstream_cache_status $upstream_status $status - $request_method $scheme $host \"$request_uri\" ` +
					`[Client $remote_addr] [Country $nyxguard_country] [Rx $request_length] [Tx $bytes_sent] [Length $body_bytes_sent] [Gzip $gzip_ratio] [Sent-to $server] ` +
					`\"$http_user_agent\" \"$http_referer\"';\n` +
					`log_format standard ` +
					`'[$time_local] $status - $request_method $scheme $host \"$request_uri\" ` +
					`[Client $remote_addr] [Country $nyxguard_country] [Rx $request_length] [Tx $bytes_sent] [Length $body_bytes_sent] [Gzip $gzip_ratio] ` +
					`\"$http_user_agent\" \"$http_referer\"';\n\n` +
					`access_log /data/logs/fallback_http_access.log proxy;\n`;
				await fs.writeFile("/etc/nginx/conf.d/include/log-proxy.conf", logProxyConf, { encoding: "utf8" });
			} catch {
				// ignore
			}

			// Reload nginx to apply changes.
			await internalNginx.reload();
			return { settings, rulesCount: rules.length };
		},
	},
};

export default internalNyxGuard;
