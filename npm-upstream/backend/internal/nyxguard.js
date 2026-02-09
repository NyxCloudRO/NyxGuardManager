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
	if (!/^[0-9a-fA-F:.\/]+$/.test(v)) return null;

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

	settings: {
		get: async (db) => {
			const row = await db("nyxguard_settings").where({ id: SETTINGS_ID }).first();
			if (row) {
				return {
					botDefenseEnabled: !!row.bot_defense_enabled,
					ddosEnabled: !!row.ddos_enabled,
					logRetentionDays: row.log_retention_days ? Number.parseInt(String(row.log_retention_days), 10) : 30,
				};
			}
			await db("nyxguard_settings").insert({
				id: SETTINGS_ID,
				bot_defense_enabled: 0,
				ddos_enabled: 0,
				log_retention_days: 30,
			});
			return { botDefenseEnabled: false, ddosEnabled: false, logRetentionDays: 30 };
		},
		update: async (db, patch) => {
			const current = await internalNyxGuard.settings.get(db);
			const next = {
				botDefenseEnabled:
					typeof patch.botDefenseEnabled === "boolean"
						? patch.botDefenseEnabled
						: current.botDefenseEnabled,
				ddosEnabled: typeof patch.ddosEnabled === "boolean" ? patch.ddosEnabled : current.ddosEnabled,
				logRetentionDays:
					typeof patch.logRetentionDays === "number" ? patch.logRetentionDays : current.logRetentionDays,
			};

			await db("nyxguard_settings")
				.where({ id: SETTINGS_ID })
				.update({
					bot_defense_enabled: next.botDefenseEnabled ? 1 : 0,
					ddos_enabled: next.ddosEnabled ? 1 : 0,
					log_retention_days: next.logRetentionDays,
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
					}
				}
			} catch {
				// ignore
			}

			const httpLines = [];
			httpLines.push("# Managed by NyxGuard Manager");
			httpLines.push("# This file is included in nginx http{} via /data/nginx/custom/http_top.conf");
			httpLines.push("");
			if (geoipAvailable || ip2Available) {
				httpLines.push(`# GeoIP2 Country DB (optional)`);
				httpLines.push(`include ${NYXGUARD_GEOIP2_CONF};`);
				httpLines.push("");
			}

			httpLines.push("# Country resolution (CF header preferred; GeoIP2 fallback when installed)");
			if (geoipAvailable || ip2Available) {
				// Stage 1: Cloudflare header (if present), else MaxMind (if installed).
				httpLines.push("map $http_cf_ipcountry $nyxguard_country_mm {");
				httpLines.push("\tdefault $http_cf_ipcountry;");
				httpLines.push("\t\"\" $geoip2_country_code_mm;");
				httpLines.push("}");
				httpLines.push("");
				// Stage 2: if still empty, fall back to IP2Location (if installed).
				httpLines.push("map $nyxguard_country_mm $nyxguard_country {");
				httpLines.push("\tdefault $nyxguard_country_mm;");
				httpLines.push("\t\"\" $geoip2_country_code_ip2;");
				httpLines.push("}");
			} else {
				httpLines.push("map $http_cf_ipcountry $nyxguard_country {");
				httpLines.push("\tdefault $http_cf_ipcountry;");
				httpLines.push("\t\"\" \"-\";");
				httpLines.push("}");
			}
			httpLines.push("");

			httpLines.push("# Rate limit zones (used by protected apps only)");
			httpLines.push('limit_req_zone $binary_remote_addr zone=nyxguard_req:10m rate=10r/s;');
			httpLines.push('limit_conn_zone $binary_remote_addr zone=nyxguard_conn:10m;');
			httpLines.push("");
			httpLines.push("# IP allow/deny maps (enforced by protected apps only)");
			httpLines.push(buildGeoBlock("nyxguard_allow", allowList));
			httpLines.push("");
			httpLines.push(buildGeoBlock("nyxguard_deny", denyList));
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
			serverLines.push("# Allow list overrides deny list.");
			serverLines.push("set $nyxguard_block 0;");
			serverLines.push("if ($nyxguard_deny = 1) { set $nyxguard_block 1; }");
			serverLines.push("if ($nyxguard_country_deny = 1) { set $nyxguard_block 1; }");
			serverLines.push("if ($nyxguard_allow = 1) { set $nyxguard_block 0; }");
			serverLines.push("if ($nyxguard_country_allow = 1) { set $nyxguard_block 0; }");
			serverLines.push("if ($nyxguard_block = 1) { return 403; }");
			serverLines.push("");

			await writeAtomic(NYXGUARD_SERVER_CONF, ensureTrailingNewline(serverLines.join("\n")));

			// Per-app include files: content depends on global toggles. Apps include these files when enabled.
			try {
				const botLines = [];
				botLines.push("# Managed by NyxGuard Manager");
				if (settings.botDefenseEnabled) {
					botLines.push("# Bot Defense (enabled globally)");
					botLines.push('if ($http_user_agent ~* "(?:curl|wget|python-requests|libwww-perl|nikto|sqlmap)") { return 403; }');
					botLines.push('if ($request_uri ~* "(?:wp-login\\.php|xmlrpc\\.php)") { return 404; }');
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
					ddosLines.push("# DDoS Shield (enabled globally)");
					ddosLines.push("limit_conn nyxguard_conn 30;");
					ddosLines.push("limit_req zone=nyxguard_req burst=50 nodelay;");
				} else {
					ddosLines.push("# DDoS Shield is disabled globally.");
				}
				await writeAtomic(NYXGUARD_DDOS_CONF, ensureTrailingNewline(ddosLines.join("\n")));
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
					`[Client $remote_addr] [Country $nyxguard_country] [Length $body_bytes_sent] [Gzip $gzip_ratio] [Sent-to $server] ` +
					`\"$http_user_agent\" \"$http_referer\"';\n` +
					`log_format standard ` +
					`'[$time_local] $status - $request_method $scheme $host \"$request_uri\" ` +
					`[Client $remote_addr] [Country $nyxguard_country] [Length $body_bytes_sent] [Gzip $gzip_ratio] ` +
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
