import _ from "lodash";
import db from "../db.js";
import errs from "../lib/error.js";
import { castJsonIfNeed } from "../lib/helpers.js";
import utils from "../lib/utils.js";
import proxyHostModel from "../models/proxy_host.js";
import internalAuditLog from "./audit-log.js";
import internalCertificate from "./certificate.js";
import internalHost from "./host.js";
import internalNginx from "./nginx.js";
import internalNyxGuard from "./nyxguard.js";

const ENFORCE_NYXGUARD_PROTECTION = process.env.NYXGUARD_ENFORCE_PROTECTION === "1";

// Directives that must never appear in user-supplied advanced_config.
// Lua execution hooks allow arbitrary code execution if nginx is built with
// OpenResty/ngx_lua. `include` is blocked to prevent loading external config
// files that could introduce any of the above. `load_module` is blocked to
// prevent loading additional nginx dynamic modules.
const BLOCKED_NGINX_DIRECTIVES = new Set([
	// Lua execution hooks — string form
	"access_by_lua",
	"set_by_lua",
	"content_by_lua",
	"rewrite_by_lua",
	"header_filter_by_lua",
	"body_filter_by_lua",
	"log_by_lua",
	"balancer_by_lua",
	"ssl_certificate_by_lua",
	// Lua execution hooks — block form (*_block variants)
	"access_by_lua_block",
	"set_by_lua_block",
	"content_by_lua_block",
	"rewrite_by_lua_block",
	"header_filter_by_lua_block",
	"body_filter_by_lua_block",
	"log_by_lua_block",
	"balancer_by_lua_block",
	"ssl_certificate_by_lua_block",
	// Lua environment
	"lua_shared_dict",
	"lua_package_path",
	"lua_package_cpath",
	// Module / file loading
	"load_module",
	"include",
]);

/**
 * Tokenises an nginx config string and returns the set of bare directive names
 * (words that appear in "directive position" — at the start of a statement,
 * i.e. immediately after a `;`, `{`, `}`, or at the beginning of the input,
 * ignoring `#` line comments and quoted strings).
 *
 * This is intentionally simple: it does not understand every nginx syntax edge
 * case, but it is strictly more robust than the previous single-regex approach
 * which could be evaded by Unicode lookalikes or comment folding.
 *
 * @param {string} src
 * @returns {Set<string>}
 */
function extractDirectiveTokens(src) {
	const tokens = new Set();
	let i = 0;
	const len = src.length;
	// Track whether we are at "directive position" (expecting a directive name next).
	let atDirectivePos = true;

	while (i < len) {
		const ch = src[i];

		// Skip line comments
		if (ch === "#") {
			while (i < len && src[i] !== "\n") i++;
			continue;
		}

		// Skip quoted strings (nginx allows single and double quotes)
		if (ch === '"' || ch === "'") {
			const quote = ch;
			i++;
			while (i < len) {
				if (src[i] === "\\") { i += 2; continue; }
				if (src[i] === quote) { i++; break; }
				i++;
			}
			atDirectivePos = false;
			continue;
		}

		// Statement delimiters reset directive position
		if (ch === ";" || ch === "{" || ch === "}") {
			atDirectivePos = true;
			i++;
			continue;
		}

		// Whitespace — preserve directive position if we haven't seen a token yet
		if (/\s/.test(ch)) {
			i++;
			continue;
		}

		// Non-whitespace, non-special character — read the full token
		let start = i;
		while (i < len && !/[\s;{}#"']/.test(src[i])) i++;
		const token = src.slice(start, i).toLowerCase();

		if (atDirectivePos) {
			tokens.add(token);
			atDirectivePos = false;
		}
	}
	return tokens;
}

/**
 * Validates user-supplied advanced_config for blocked nginx directives.
 * Strips NyxGuard-managed comment blocks before checking so system-generated
 * directives are never mistakenly flagged.
 *
 * @param {string} config
 * @throws {ValidationError}
 */
function validateAdvancedConfig(config) {
	if (!config || typeof config !== "string") return;
	// Strip NyxGuard-managed blocks (# NYXGUARD-* ... # /NYXGUARD-*) before checking
	const userConfig = config.replace(/# NYXGUARD-[\s\S]*?# \/NYXGUARD-[^\n]*/g, "");
	const directiveTokens = extractDirectiveTokens(userConfig);
	for (const token of directiveTokens) {
		if (BLOCKED_NGINX_DIRECTIVES.has(token)) {
			throw new errs.ValidationError(`Nginx directive '${token}' is not permitted in advanced config.`);
		}
	}
}

function nyxguardMetaBool(meta, camelKey, snakeKey) {
	if (!meta) return undefined;
	const parseLikeBool = (v) => {
		if (typeof v === "boolean") return v;
		if (v === 1 || v === "1") return true;
		if (v === 0 || v === "0") return false;
		if (typeof v === "string") {
			const s = v.trim().toLowerCase();
			if (s === "true" || s === "on" || s === "yes") return true;
			if (s === "false" || s === "off" || s === "no") return false;
		}
		return undefined;
	};
	const vCamel = meta[camelKey];
	const pCamel = parseLikeBool(vCamel);
	if (typeof pCamel === "boolean") return pCamel;
	const vSnake = meta[snakeKey];
	const pSnake = parseLikeBool(vSnake);
	if (typeof pSnake === "boolean") return pSnake;
	return undefined;
}

function hasMetaKey(meta, camelKey, snakeKey) {
	if (!meta || typeof meta !== "object") return false;
	return Object.hasOwn(meta, camelKey) || Object.hasOwn(meta, snakeKey);
}

function stripNyxguardSnakeKeys(meta) {
	if (!meta) return meta;
	// Keep meta stable: only normalize the NyxGuard keys that the UI may send in snake_case.
	const copy = { ...meta };
	delete copy.nyxguard_waf_enabled;
	delete copy.nyxguard_bot_defense_enabled;
	delete copy.nyxguard_ddos_enabled;
	delete copy.nyxguard_sqli_enabled;
	delete copy.nyxguard_auth_bypass_enabled;
	return copy;
}

async function applyNyxguardProtectionMeta(rows) {
	const list = Array.isArray(rows) ? rows.filter((r) => r?.id) : rows?.id ? [rows] : [];
	if (!list.length) return rows;

	let authBypassById = new Map();
	try {
		const appRows = await db()("nyxguard_app")
			.select("proxy_host_id", "auth_bypass_enabled")
			.whereIn(
				"proxy_host_id",
				list.map((r) => r.id),
			);
		authBypassById = new Map(appRows.map((r) => [r.proxy_host_id, !!r.auth_bypass_enabled]));
	} catch {
		// ignore: schema may not be migrated yet
	}

	for (const row of list) {
		const prevMeta = row.meta || {};
		const wafEnabled = internalNyxGuard.waf.isEnabledInAdvancedConfig(row.advanced_config);
		const botDefenseEnabled =
			wafEnabled && internalNyxGuard.botDefense.isEnabledInAdvancedConfig(row.advanced_config);
		const ddosEnabled = wafEnabled && internalNyxGuard.ddos.isEnabledInAdvancedConfig(row.advanced_config);
		const sqliEnabled = wafEnabled && internalNyxGuard.sqli.isEnabledInAdvancedConfig(row.advanced_config);
		const prevMetaAuthBypass =
			nyxguardMetaBool(prevMeta, "nyxguardAuthBypassEnabled", "nyxguard_auth_bypass_enabled") ?? false;
		const authBypassEnabled =
			wafEnabled && (authBypassById.has(row.id) ? authBypassById.get(row.id) : prevMetaAuthBypass);
		row.meta = {
			...stripNyxguardSnakeKeys(prevMeta),
			nyxguardWafEnabled: !!wafEnabled,
			nyxguardBotDefenseEnabled: !!botDefenseEnabled,
			nyxguardDdosEnabled: !!ddosEnabled,
			nyxguardSqliEnabled: !!sqliEnabled,
			nyxguardAuthBypassEnabled: !!authBypassEnabled,
		};
	}

	return rows;
}

const omissions = () => {
	return ["is_deleted", "owner.is_deleted"];
};

const internalProxyHost = {
	/**
	 * @param   {Access}  access
	 * @param   {Object}  data
	 * @returns {Promise}
	 */
	create: (access, data) => {
		let thisData = data;
		const createCertificate = thisData.certificate_id === "new";
		let createdRow = null;

		if (createCertificate) {
			delete thisData.certificate_id;
		}

		return access
			.can("proxy_hosts:create", thisData)
			.then(() => {
				// Get a list of the domain names and check each of them against existing records
				const domain_name_check_promises = [];

				thisData.domain_names.map((domain_name) => {
					domain_name_check_promises.push(internalHost.isHostnameTaken(domain_name));
					return true;
				});

				return Promise.all(domain_name_check_promises).then((check_results) => {
					check_results.map((result) => {
						if (result.is_taken) {
							throw new errs.ValidationError(`${result.hostname} is already in use`);
						}
						return true;
					});
				});
			})
			.then(() => {
				// At this point the domains should have been checked
				thisData.owner_user_id = access.token.getUserId(1);
				thisData = internalHost.cleanSslHstsData(thisData);

				// Fix for db field not having a default value
				// for this optional field.
				if (typeof thisData.advanced_config === "undefined") {
					thisData.advanced_config = "";
				}

				validateAdvancedConfig(thisData.advanced_config);

				return proxyHostModel
					.query()
					.insertAndFetch(thisData)
					.then(utils.omitRow(omissions()))
					.then((row) => {
						createdRow = row;
						return row;
					});
			})
			.then(async (row) => {
				if (createCertificate) {
					return internalCertificate
						.createQuickCertificate(access, thisData)
						.then((cert) => {
							// update host with cert id
							return internalProxyHost.update(access, {
								id: row.id,
								certificate_id: cert.id,
							});
						})
						.then(() => {
							return row;
						});
				}
				return row;
			})
			.then(async (row) => {
				// re-fetch with cert
				return internalProxyHost.get(access, {
					id: row.id,
					expand: ["certificate", "owner", "access_list.[clients,items]"],
				});
			})
			.then(async (row) => {
				// NyxGuard protection is enforced for all apps by default.
				// If enforcement is explicitly disabled, fallback to user-provided toggle values.
				const meta = thisData?.meta || {};
				const waf = ENFORCE_NYXGUARD_PROTECTION
					? true
					: !!nyxguardMetaBool(meta, "nyxguardWafEnabled", "nyxguard_waf_enabled");
				const bot = ENFORCE_NYXGUARD_PROTECTION
					? true
					: waf && !!nyxguardMetaBool(meta, "nyxguardBotDefenseEnabled", "nyxguard_bot_defense_enabled");
				const ddos = ENFORCE_NYXGUARD_PROTECTION
					? true
					: waf && !!nyxguardMetaBool(meta, "nyxguardDdosEnabled", "nyxguard_ddos_enabled");
				const sqli = ENFORCE_NYXGUARD_PROTECTION
					? true
					: waf && !!nyxguardMetaBool(meta, "nyxguardSqliEnabled", "nyxguard_sqli_enabled");
				const authBypass =
					waf && !!nyxguardMetaBool(meta, "nyxguardAuthBypassEnabled", "nyxguard_auth_bypass_enabled");

				let nextAdvanced = row.advanced_config ?? "";
				nextAdvanced = internalNyxGuard.waf.applyAdvancedConfig(nextAdvanced, waf);
				nextAdvanced = internalNyxGuard.botDefense.applyAdvancedConfig(nextAdvanced, bot);
				nextAdvanced = internalNyxGuard.ddos.applyAdvancedConfig(nextAdvanced, ddos);
				nextAdvanced = internalNyxGuard.sqli.applyAdvancedConfig(nextAdvanced, sqli);

				return internalProxyHost
					.update(access, {
						id: row.id,
						advanced_config: nextAdvanced,
						meta: {
							...stripNyxguardSnakeKeys(row.meta || {}),
							nyxguardWafEnabled: waf,
							nyxguardBotDefenseEnabled: bot,
							nyxguardDdosEnabled: ddos,
							nyxguardSqliEnabled: sqli,
							nyxguardAuthBypassEnabled: authBypass,
						},
					})
					.then(() =>
						internalProxyHost.get(access, {
							id: row.id,
							expand: ["certificate", "owner", "access_list.[clients,items]"],
						}),
					);
			})
			.then((row) => {
				// Configure nginx
				return internalNginx.configure(proxyHostModel, "proxy_host", row).then(() => {
					return row;
				});
			})
			.then((row) => {
				// Audit log
				thisData.meta = _.assign({}, thisData.meta || {}, row.meta);

				// Add to audit log
				return internalAuditLog
					.add(access, {
						action: "created",
						object_type: "proxy-host",
						object_id: row.id,
						meta: thisData,
					})
					.then(() => {
						return row;
					});
			})
			.catch(async (err) => {
				// Avoid "created but reported as failed" behavior:
				// if anything fails after DB insert (e.g. nginx/config validation),
				// soft-delete the new host and clean generated config best-effort.
				if (createdRow?.id) {
					try {
						await proxyHostModel.query().where("id", createdRow.id).patch({ is_deleted: 1 });
					} catch {}
					try {
						await internalNginx.deleteConfig("proxy_host", createdRow, true, true);
					} catch {}
					try {
						await internalNginx.reload();
					} catch {}
				}
				throw err;
			});
	},

	/**
	 * @param  {Access}  access
	 * @param  {Object}  data
	 * @param  {Number}  data.id
	 * @return {Promise}
	 */
	update: (access, data) => {
		let thisData = data;
		const create_certificate = thisData.certificate_id === "new";
		let shouldApplyNyxGuard = false;
		let nextAuthBypassEnabled;
		let nextWafEnabled;

		if (create_certificate) {
			delete thisData.certificate_id;
		}

		return access
			.can("proxy_hosts:update", thisData.id)
			.then((/*access_data*/) => {
				// Get a list of the domain names and check each of them against existing records
				const domain_name_check_promises = [];

				if (typeof thisData.domain_names !== "undefined") {
					thisData.domain_names.map((domain_name) => {
						return domain_name_check_promises.push(
							internalHost.isHostnameTaken(domain_name, "proxy", thisData.id),
						);
					});

					return Promise.all(domain_name_check_promises).then((check_results) => {
						check_results.map((result) => {
							if (result.is_taken) {
								throw new errs.ValidationError(`${result.hostname} is already in use`);
							}
							return true;
						});
					});
				}
			})
			.then(() => {
				if (typeof thisData.advanced_config === "string") {
					validateAdvancedConfig(thisData.advanced_config);
				}
				return internalProxyHost.get(access, { id: thisData.id });
			})
			.then((row) => {
				if (row.id !== thisData.id) {
					// Sanity check that something crazy hasn't happened
					throw new errs.InternalValidationError(
						`Proxy Host could not be updated, IDs do not match: ${row.id} !== ${thisData.id}`,
					);
				}

				if (create_certificate) {
					return internalCertificate
						.createQuickCertificate(access, {
							domain_names: thisData.domain_names || row.domain_names,
							meta: _.assign({}, row.meta, thisData.meta),
						})
						.then((cert) => {
							// update host with cert id
							thisData.certificate_id = cert.id;
						})
						.then(() => {
							return row;
						});
				}
				return row;
			})
			.then(async (row) => {
				// If NyxGuard toggles are present, apply them to advanced_config.
				// (UI sends these under meta.* to avoid changing the proxy-host API schema.)
				const meta = thisData?.meta || {};
				const hasNyx =
					hasMetaKey(meta, "nyxguardWafEnabled", "nyxguard_waf_enabled") ||
					hasMetaKey(meta, "nyxguardBotDefenseEnabled", "nyxguard_bot_defense_enabled") ||
					hasMetaKey(meta, "nyxguardDdosEnabled", "nyxguard_ddos_enabled") ||
					hasMetaKey(meta, "nyxguardSqliEnabled", "nyxguard_sqli_enabled") ||
					hasMetaKey(meta, "nyxguardAuthBypassEnabled", "nyxguard_auth_bypass_enabled");

				if (hasNyx) {
					const prevMeta = row.meta || {};
					const prevWaf =
						nyxguardMetaBool(prevMeta, "nyxguardWafEnabled", "nyxguard_waf_enabled") ??
						internalNyxGuard.waf.isEnabledInAdvancedConfig(row.advanced_config);
					const prevBot =
						nyxguardMetaBool(prevMeta, "nyxguardBotDefenseEnabled", "nyxguard_bot_defense_enabled") ??
						internalNyxGuard.botDefense.isEnabledInAdvancedConfig(row.advanced_config);
					const prevDdos =
						nyxguardMetaBool(prevMeta, "nyxguardDdosEnabled", "nyxguard_ddos_enabled") ??
						internalNyxGuard.ddos.isEnabledInAdvancedConfig(row.advanced_config);
					const prevSqli =
						nyxguardMetaBool(prevMeta, "nyxguardSqliEnabled", "nyxguard_sqli_enabled") ??
						internalNyxGuard.sqli.isEnabledInAdvancedConfig(row.advanced_config);
					let prevAuthBypass =
						nyxguardMetaBool(prevMeta, "nyxguardAuthBypassEnabled", "nyxguard_auth_bypass_enabled") ?? false;
					try {
						const appRow = await db()("nyxguard_app")
							.select("auth_bypass_enabled")
							.where({ proxy_host_id: row.id })
							.first();
						if (appRow && appRow.auth_bypass_enabled != null) {
							prevAuthBypass = !!appRow.auth_bypass_enabled;
						}
					} catch {
						// ignore; fallback to meta/default
					}

					const waf = nyxguardMetaBool(meta, "nyxguardWafEnabled", "nyxguard_waf_enabled");
					const bot = nyxguardMetaBool(meta, "nyxguardBotDefenseEnabled", "nyxguard_bot_defense_enabled");
					const ddos = nyxguardMetaBool(meta, "nyxguardDdosEnabled", "nyxguard_ddos_enabled");
					const sqli = nyxguardMetaBool(meta, "nyxguardSqliEnabled", "nyxguard_sqli_enabled");
					const authBypass = nyxguardMetaBool(
						meta,
						"nyxguardAuthBypassEnabled",
						"nyxguard_auth_bypass_enabled",
					);

					const wafNext = typeof waf === "boolean" ? waf : !!prevWaf;
					const botNext = wafNext && (typeof bot === "boolean" ? bot : !!prevBot);
					const ddosNext = wafNext && (typeof ddos === "boolean" ? ddos : !!prevDdos);
					const sqliNext = wafNext && (typeof sqli === "boolean" ? sqli : !!prevSqli);
					const authBypassNext = wafNext && (typeof authBypass === "boolean" ? authBypass : !!prevAuthBypass);

					const baseAdvanced =
						typeof thisData.advanced_config === "string"
							? thisData.advanced_config
							: (row.advanced_config ?? "");
					let nextAdvanced = internalNyxGuard.waf.applyAdvancedConfig(baseAdvanced, wafNext);
					nextAdvanced = internalNyxGuard.botDefense.applyAdvancedConfig(nextAdvanced, botNext);
					nextAdvanced = internalNyxGuard.ddos.applyAdvancedConfig(nextAdvanced, ddosNext);
					nextAdvanced = internalNyxGuard.sqli.applyAdvancedConfig(nextAdvanced, sqliNext);
					thisData.advanced_config = nextAdvanced;

					thisData.meta = _.assign(
						{},
						stripNyxguardSnakeKeys(row.meta),
						stripNyxguardSnakeKeys(thisData.meta),
						{
							nyxguardWafEnabled: wafNext,
							nyxguardBotDefenseEnabled: botNext,
							nyxguardDdosEnabled: ddosNext,
							nyxguardSqliEnabled: sqliNext,
							nyxguardAuthBypassEnabled: authBypassNext,
						},
					);
					nextWafEnabled = wafNext;
					nextAuthBypassEnabled = authBypassNext;
					shouldApplyNyxGuard = true;
				}

				if (typeof nextWafEnabled !== "boolean") {
					const effectiveAdvanced =
						typeof thisData.advanced_config === "string"
							? thisData.advanced_config
							: (row.advanced_config ?? "");
					nextWafEnabled = internalNyxGuard.waf.isEnabledInAdvancedConfig(effectiveAdvanced);
				}
				if (typeof nextAuthBypassEnabled !== "boolean") {
					let authBypass =
						nyxguardMetaBool(row.meta, "nyxguardAuthBypassEnabled", "nyxguard_auth_bypass_enabled") ?? false;
					try {
						const appRow = await db()("nyxguard_app")
							.select("auth_bypass_enabled")
							.where({ proxy_host_id: row.id })
							.first();
						if (appRow && appRow.auth_bypass_enabled != null) {
							authBypass = !!appRow.auth_bypass_enabled;
						}
					} catch {
						// ignore; keep fallback
					}
					nextAuthBypassEnabled = !!nextWafEnabled && !!authBypass;
				}

				// Add domain_names to the data in case it isn't there, so that the audit log renders correctly. The order is important here.
				// NOTE: Use thisData (not the original `data`) so we don't accidentally drop
				// computed fields like advanced_config/meta updates (NyxGuard toggles).
				thisData = _.assign({}, { domain_names: row.domain_names }, thisData);

				thisData = internalHost.cleanSslHstsData(thisData, row);

				return proxyHostModel
					.query()
					.where({ id: thisData.id })
					.patch(thisData)
					.then(utils.omitRow(omissions()))
					.then(async (saved_row) => {
						try {
							const hostId = thisData.id;
							await db()("nyxguard_app")
								.insert({
									proxy_host_id: hostId,
									waf_enabled: nextWafEnabled ? 1 : 0,
									auth_bypass_enabled: nextAuthBypassEnabled ? 1 : 0,
									created_on: db().fn.now(),
									modified_on: db().fn.now(),
								})
								.onConflict("proxy_host_id")
								.merge({
									waf_enabled: nextWafEnabled ? 1 : 0,
									auth_bypass_enabled: nextAuthBypassEnabled ? 1 : 0,
									modified_on: db().fn.now(),
								});
						} catch {
							// ignore when table/column is unavailable
						}
						// Add to audit log
						return internalAuditLog
							.add(access, {
								action: "updated",
								object_type: "proxy-host",
								object_id: row.id,
								meta: thisData,
							})
							.then(() => {
								return saved_row;
							});
					});
			})
			.then(() => {
				return internalProxyHost
					.get(access, {
						id: thisData.id,
						expand: ["owner", "certificate", "access_list.[clients,items]"],
					})
					.then((row) => {
						if (!row.enabled) {
							// No need to add nginx config if host is disabled
							return row;
						}
						// Configure nginx
						return internalNginx.configure(proxyHostModel, "proxy_host", row).then(async (new_meta) => {
							row.meta = new_meta;
							if (shouldApplyNyxGuard) {
								await internalNyxGuard.nginx.apply(db());
							}
							return _.omit(internalHost.cleanRowCertificateMeta(row), omissions());
						});
					});
			});
	},

	/**
	 * @param  {Access}   access
	 * @param  {Object}   data
	 * @param  {Number}   data.id
	 * @param  {Array}    [data.expand]
	 * @param  {Array}    [data.omit]
	 * @return {Promise}
	 */
	get: (access, data) => {
		const thisData = data || {};

		return access
			.can("proxy_hosts:get", thisData.id)
			.then((access_data) => {
				const query = proxyHostModel
					.query()
					.where("is_deleted", 0)
					.andWhere("id", thisData.id)
					.allowGraph("[owner,access_list.[clients,items],certificate]")
					.first();

				if (access_data.permission_visibility !== "all") {
					query.andWhere("owner_user_id", access.token.getUserId(1));
				}

				if (typeof thisData.expand !== "undefined" && thisData.expand !== null) {
					query.withGraphFetched(`[${thisData.expand.join(", ")}]`);
				}

				return query.then(utils.omitRow(omissions()));
			})
			.then(async (row) => {
				if (!row || !row.id) {
					throw new errs.ItemNotFoundError(thisData.id);
				}
				const thisRow = internalHost.cleanRowCertificateMeta(row);
				await applyNyxguardProtectionMeta(thisRow);
				// Custom omissions
				if (typeof thisData.omit !== "undefined" && thisData.omit !== null) {
					return _.omit(row, thisData.omit);
				}
				return thisRow;
			});
	},

	/**
	 * @param {Access}  access
	 * @param {Object}  data
	 * @param {Number}  data.id
	 * @param {String}  [data.reason]
	 * @returns {Promise}
	 */
	delete: (access, data) => {
		return access
			.can("proxy_hosts:delete", data.id)
			.then(() => {
				return internalProxyHost.get(access, { id: data.id });
			})
			.then((row) => {
				if (!row || !row.id) {
					throw new errs.ItemNotFoundError(data.id);
				}

				return proxyHostModel
					.query()
					.where("id", row.id)
					.patch({
						is_deleted: 1,
					})
					.then(() => {
						// Delete Nginx Config
						return internalNginx.deleteConfig("proxy_host", row).then(() => {
							return internalNginx.reload();
						});
					})
					.then(() => {
						// Add to audit log
						return internalAuditLog.add(access, {
							action: "deleted",
							object_type: "proxy-host",
							object_id: row.id,
							meta: _.omit(row, omissions()),
						});
					});
			})
			.then(() => {
				return true;
			});
	},

	/**
	 * @param {Access}  access
	 * @param {Object}  data
	 * @param {Number}  data.id
	 * @param {String}  [data.reason]
	 * @returns {Promise}
	 */
	enable: (access, data) => {
		return access
			.can("proxy_hosts:update", data.id)
			.then(() => {
				return internalProxyHost.get(access, {
					id: data.id,
					expand: ["certificate", "owner", "access_list"],
				});
			})
			.then((row) => {
				if (!row || !row.id) {
					throw new errs.ItemNotFoundError(data.id);
				}
				if (row.enabled) {
					throw new errs.ValidationError("Host is already enabled");
				}

				row.enabled = 1;

				return proxyHostModel
					.query()
					.where("id", row.id)
					.patch({
						enabled: 1,
					})
					.then(() => {
						// Configure nginx
						return internalNginx.configure(proxyHostModel, "proxy_host", row);
					})
					.then(() => {
						// Add to audit log
						return internalAuditLog.add(access, {
							action: "enabled",
							object_type: "proxy-host",
							object_id: row.id,
							meta: _.omit(row, omissions()),
						});
					});
			})
			.then(() => {
				return true;
			});
	},

	/**
	 * @param {Access}  access
	 * @param {Object}  data
	 * @param {Number}  data.id
	 * @param {String}  [data.reason]
	 * @returns {Promise}
	 */
	disable: (access, data) => {
		return access
			.can("proxy_hosts:update", data.id)
			.then(() => {
				return internalProxyHost.get(access, { id: data.id });
			})
			.then((row) => {
				if (!row || !row.id) {
					throw new errs.ItemNotFoundError(data.id);
				}
				if (!row.enabled) {
					throw new errs.ValidationError("Host is already disabled");
				}

				row.enabled = 0;

				return proxyHostModel
					.query()
					.where("id", row.id)
					.patch({
						enabled: 0,
					})
					.then(() => {
						// Delete Nginx Config
						return internalNginx.deleteConfig("proxy_host", row).then(() => {
							return internalNginx.reload();
						});
					})
					.then(() => {
						// Add to audit log
						return internalAuditLog.add(access, {
							action: "disabled",
							object_type: "proxy-host",
							object_id: row.id,
							meta: _.omit(row, omissions()),
						});
					});
			})
			.then(() => {
				return true;
			});
	},

	/**
	 * All Hosts
	 *
	 * @param   {Access}  access
	 * @param   {Array}   [expand]
	 * @param   {String}  [search_query]
	 * @returns {Promise}
	 */
	getAll: async (access, expand, searchQuery) => {
		const accessData = await access.can("proxy_hosts:list");
		const query = proxyHostModel
			.query()
			.where("is_deleted", 0)
			.groupBy("id")
			.allowGraph("[owner,access_list,certificate]")
			.orderBy(castJsonIfNeed("domain_names"), "ASC");

		if (accessData.permission_visibility !== "all") {
			query.andWhere("owner_user_id", access.token.getUserId(1));
		}

		// Query is used for searching
		if (typeof searchQuery === "string" && searchQuery.length > 0) {
			query.where(function () {
				this.where(castJsonIfNeed("domain_names"), "like", `%${searchQuery}%`);
			});
		}

		if (typeof expand !== "undefined" && expand !== null) {
			query.withGraphFetched(`[${expand.join(", ")}]`);
		}

		const rows = await query.then(utils.omitRows(omissions()));
		await applyNyxguardProtectionMeta(rows);
		if (typeof expand !== "undefined" && expand !== null && expand.indexOf("certificate") !== -1) {
			return internalHost.cleanAllRowsCertificateMeta(rows);
		}
		return rows;
	},

	/**
	 * Report use
	 *
	 * @param   {Number}  user_id
	 * @param   {String}  visibility
	 * @returns {Promise}
	 */
	getCount: (user_id, visibility) => {
		const query = proxyHostModel.query().count("id as count").where("is_deleted", 0);

		if (visibility !== "all") {
			query.andWhere("owner_user_id", user_id);
		}

		return query.first().then((row) => {
			return Number.parseInt(row.count, 10);
		});
	},
};

export default internalProxyHost;
