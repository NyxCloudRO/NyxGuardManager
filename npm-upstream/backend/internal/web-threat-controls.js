import net from "node:net";

const DEFAULT_CREATED_BY = "system";

const DEFAULT_POLICY = {
	mode: "monitor",
	inbound: {
		enabled: true,
		enforcement: { mode: "monitor", reject_status: 400 },
		framing: {
			reject_multiple_content_length: true,
			reject_cl_te_conflict: true,
			reject_invalid_chunked: true,
			max_request_line_bytes: 4096,
			max_header_line_bytes: 8192,
			max_headers_bytes: 65536,
		},
		methods: {
			allowed: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
			block_trace: true,
			block_connect: true,
		},
		path_normalization: {
			collapse_slashes: true,
			normalize_dot_segments: true,
			reject_double_encoded_traversal: true,
		},
		limits: {
			max_body_bytes_default: 26214400,
			client_read_seconds: 15,
		},
		forwarded_trust: {
			trusted_proxy_cidrs: [],
			strip_untrusted_forwarded: true,
		},
	},
	browser: {
		enabled: true,
		enforcement: { mode: "report-only" },
		headers_preset: "balanced",
		hsts: { enabled: "auto", max_age: 15552000, include_subdomains: false, preload: false },
		csp: {
			mode: "report-only",
			directives: {
				"default-src": ["'self'"],
				"object-src": ["'none'"],
				"base-uri": ["'none'"],
				"frame-ancestors": ["'none'"],
				"img-src": ["'self'", "data:", "https:"],
				"connect-src": ["'self'", "https:"],
			},
			report_endpoint: "/__nyxguard/csp-report",
		},
		cookie_flags: {
			enabled: false,
			force_secure: true,
			force_httponly: true,
			samesite: "Lax",
			exceptions: [],
		},
	},
	outbound: {
		enabled: true,
		enforcement: { mode: "monitor" },
		capability: "auto",
		schemes: { allow_https: true, allow_http: false },
		allowlist: [],
		block_private_ranges: true,
		redirects: { allow: true, max: 3 },
		dns_pinning: true,
		timeouts: { connect_ms: 2000, read_ms: 5000 },
		max_response_bytes: 2097152,
	},
};

function safeJsonParse(v, fallback) {
	if (v == null) return fallback;
	if (typeof v === "object") return v;
	try {
		return JSON.parse(String(v));
	} catch {
		return fallback;
	}
}

function clampInt(v, min, max, fallback) {
	const n = Number.parseInt(String(v ?? ""), 10);
	if (!Number.isFinite(n)) return fallback;
	return Math.min(max, Math.max(min, n));
}

function normalizeMode(v, allowed, fallback) {
	const s = String(v ?? "").toLowerCase().trim();
	return allowed.includes(s) ? s : fallback;
}

function normalizeMethods(arr) {
	const items = Array.isArray(arr) ? arr : [];
	const out = [];
	for (const it of items) {
		const s = String(it ?? "").trim().toUpperCase();
		if (!/^[A-Z]{3,10}$/.test(s)) continue;
		out.push(s);
	}
	return [...new Set(out)].slice(0, 16);
}

function normalizeCidrList(arr) {
	const items = Array.isArray(arr) ? arr : [];
	const out = [];
	for (const it of items) {
		const s = String(it ?? "").trim();
		if (!s) continue;
		const parts = s.split("/");
		if (parts.length > 2) continue;
		const ip = parts[0];
		if (!net.isIP(ip)) continue;
		if (parts.length === 2) {
			const p = Number.parseInt(parts[1], 10);
			if (Number.isNaN(p)) continue;
			if (net.isIP(ip) === 4 && (p < 0 || p > 32)) continue;
			if (net.isIP(ip) === 6 && (p < 0 || p > 128)) continue;
		}
		out.push(s);
	}
	return [...new Set(out)].slice(0, 64);
}

export function normalizePolicy(input) {
	const p = safeJsonParse(input, {});
	const inboundMode = normalizeMode(p?.inbound?.enforcement?.mode, ["off", "monitor", "enforce"], "monitor");
	const browserMode = normalizeMode(p?.browser?.enforcement?.mode, ["off", "report-only", "enforce"], "report-only");
	const outboundMode = normalizeMode(p?.outbound?.enforcement?.mode, ["off", "monitor", "enforce"], "monitor");

	const allowedMethods = normalizeMethods(p?.inbound?.methods?.allowed ?? DEFAULT_POLICY.inbound.methods.allowed);

	return {
		...DEFAULT_POLICY,
		mode: normalizeMode(p?.mode, ["off", "monitor", "enforce"], DEFAULT_POLICY.mode),
		inbound: {
			...DEFAULT_POLICY.inbound,
			enabled: p?.inbound?.enabled !== false,
			enforcement: {
				mode: inboundMode,
				reject_status: clampInt(p?.inbound?.enforcement?.reject_status, 400, 499, 400),
			},
			methods: {
				...DEFAULT_POLICY.inbound.methods,
				allowed: allowedMethods.length ? allowedMethods : DEFAULT_POLICY.inbound.methods.allowed,
				block_trace: p?.inbound?.methods?.block_trace !== false,
				block_connect: p?.inbound?.methods?.block_connect !== false,
			},
			path_normalization: {
				...DEFAULT_POLICY.inbound.path_normalization,
				collapse_slashes: p?.inbound?.path_normalization?.collapse_slashes !== false,
				normalize_dot_segments: p?.inbound?.path_normalization?.normalize_dot_segments !== false,
				reject_double_encoded_traversal: p?.inbound?.path_normalization?.reject_double_encoded_traversal !== false,
			},
			limits: {
				...DEFAULT_POLICY.inbound.limits,
				max_body_bytes_default: clampInt(p?.inbound?.limits?.max_body_bytes_default, 0, 1024 * 1024 * 1024, DEFAULT_POLICY.inbound.limits.max_body_bytes_default),
				client_read_seconds: clampInt(p?.inbound?.limits?.client_read_seconds, 1, 600, DEFAULT_POLICY.inbound.limits.client_read_seconds),
			},
			forwarded_trust: {
				...DEFAULT_POLICY.inbound.forwarded_trust,
				trusted_proxy_cidrs: normalizeCidrList(p?.inbound?.forwarded_trust?.trusted_proxy_cidrs ?? DEFAULT_POLICY.inbound.forwarded_trust.trusted_proxy_cidrs),
				strip_untrusted_forwarded: p?.inbound?.forwarded_trust?.strip_untrusted_forwarded !== false,
			},
		},
		browser: {
			...DEFAULT_POLICY.browser,
			enabled: p?.browser?.enabled !== false,
			enforcement: { mode: browserMode },
			headers_preset: normalizeMode(p?.browser?.headers_preset, ["balanced", "strict", "custom"], "balanced"),
			hsts: {
				...DEFAULT_POLICY.browser.hsts,
				enabled: ["auto", true, false].includes(p?.browser?.hsts?.enabled) ? p.browser.hsts.enabled : "auto",
				max_age: clampInt(p?.browser?.hsts?.max_age, 0, 63072000, DEFAULT_POLICY.browser.hsts.max_age),
				include_subdomains: p?.browser?.hsts?.include_subdomains === true,
				preload: p?.browser?.hsts?.preload === true,
			},
			csp: {
				...DEFAULT_POLICY.browser.csp,
				mode: normalizeMode(p?.browser?.csp?.mode, ["off", "report-only", "enforce"], DEFAULT_POLICY.browser.csp.mode),
				directives: typeof p?.browser?.csp?.directives === "object" && p.browser.csp.directives ? p.browser.csp.directives : DEFAULT_POLICY.browser.csp.directives,
				report_endpoint: typeof p?.browser?.csp?.report_endpoint === "string" ? p.browser.csp.report_endpoint : DEFAULT_POLICY.browser.csp.report_endpoint,
			},
			cookie_flags: {
				...DEFAULT_POLICY.browser.cookie_flags,
				enabled: p?.browser?.cookie_flags?.enabled === true,
				force_secure: p?.browser?.cookie_flags?.force_secure !== false,
				force_httponly: p?.browser?.cookie_flags?.force_httponly !== false,
				samesite: normalizeMode(p?.browser?.cookie_flags?.samesite, ["lax", "strict", "none"], "lax").toUpperCase(),
				exceptions: Array.isArray(p?.browser?.cookie_flags?.exceptions) ? p.browser.cookie_flags.exceptions.slice(0, 64) : [],
			},
		},
		outbound: {
			...DEFAULT_POLICY.outbound,
			enabled: p?.outbound?.enabled !== false,
			enforcement: { mode: outboundMode },
			capability: normalizeMode(p?.outbound?.capability, ["auto", "available", "unavailable"], "auto"),
			schemes: {
				allow_https: p?.outbound?.schemes?.allow_https !== false,
				allow_http: p?.outbound?.schemes?.allow_http === true,
			},
			allowlist: Array.isArray(p?.outbound?.allowlist) ? p.outbound.allowlist.slice(0, 256) : [],
			block_private_ranges: p?.outbound?.block_private_ranges !== false,
			redirects: {
				allow: p?.outbound?.redirects?.allow !== false,
				max: clampInt(p?.outbound?.redirects?.max, 0, 20, DEFAULT_POLICY.outbound.redirects.max),
			},
			dns_pinning: p?.outbound?.dns_pinning !== false,
			timeouts: {
				connect_ms: clampInt(p?.outbound?.timeouts?.connect_ms, 100, 60000, DEFAULT_POLICY.outbound.timeouts.connect_ms),
				read_ms: clampInt(p?.outbound?.timeouts?.read_ms, 100, 600000, DEFAULT_POLICY.outbound.timeouts.read_ms),
			},
			max_response_bytes: clampInt(p?.outbound?.max_response_bytes, 0, 1024 * 1024 * 1024, DEFAULT_POLICY.outbound.max_response_bytes),
		},
	};
}

async function ensureGlobalPolicySet(knex) {
	const row = await knex("web_threat_policy_sets").where({ scope: "global" }).first();
	if (row?.id) return row.id;

	const [setId] = await knex("web_threat_policy_sets").insert({
		scope: "global",
		app_id: null,
		name: "Global Default",
		created_at: knex.fn.now(),
		updated_at: knex.fn.now(),
	});
	await knex("web_threat_policy_versions").insert({
		policy_set_id: setId,
		version: 1,
		policy_json: JSON.stringify(DEFAULT_POLICY),
		created_by: DEFAULT_CREATED_BY,
		created_at: knex.fn.now(),
		is_active: 1,
	});
	return setId;
}

async function getActivePolicyVersion(knex, policySetId) {
	const row = await knex("web_threat_policy_versions")
		.where({ policy_set_id: policySetId, is_active: 1 })
		.orderBy("version", "desc")
		.first();
	if (!row) return null;
	return {
		id: row.id,
		policySetId: row.policy_set_id,
		version: row.version,
		createdBy: row.created_by,
		createdAt: row.created_at,
		policy: normalizePolicy(row.policy_json),
	};
}

async function getPolicySet(knex, policySetId) {
	const row = await knex("web_threat_policy_sets").where({ id: policySetId }).first();
	if (!row) return null;
	return {
		id: row.id,
		scope: row.scope,
		appId: row.app_id,
		name: row.name,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

async function getLatestVersionNumber(knex, policySetId) {
	const row = await knex("web_threat_policy_versions").where({ policy_set_id: policySetId }).orderBy("version", "desc").first();
	return row?.version ? Number.parseInt(String(row.version), 10) || 0 : 0;
}

async function createPolicyVersion(knex, policySetId, policyJson, createdBy, { activate = true } = {}) {
	const nextVer = (await getLatestVersionNumber(knex, policySetId)) + 1;
	const normalized = normalizePolicy(policyJson);

	if (activate) {
		await knex("web_threat_policy_versions").where({ policy_set_id: policySetId, is_active: 1 }).update({ is_active: 0 });
	}

	const [id] = await knex("web_threat_policy_versions").insert({
		policy_set_id: policySetId,
		version: nextVer,
		policy_json: JSON.stringify(normalized),
		created_by: String(createdBy ?? DEFAULT_CREATED_BY).slice(0, 128),
		created_at: knex.fn.now(),
		is_active: activate ? 1 : 0,
	});

	return { id, version: nextVer, policy: normalized };
}

async function activatePolicyVersion(knex, policySetId, version) {
	const row = await knex("web_threat_policy_versions").where({ policy_set_id: policySetId, version }).first();
	if (!row) return { changed: false };
	await knex("web_threat_policy_versions").where({ policy_set_id: policySetId }).update({ is_active: 0 });
	await knex("web_threat_policy_versions").where({ id: row.id }).update({ is_active: 1 });
	return { changed: true };
}

async function rollbackPolicySet(knex, policySetId) {
	const active = await knex("web_threat_policy_versions").where({ policy_set_id: policySetId, is_active: 1 }).first();
	if (!active) return { changed: false };
	const prev = await knex("web_threat_policy_versions")
		.where({ policy_set_id: policySetId })
		.andWhere("version", "<", active.version)
		.orderBy("version", "desc")
		.first();
	if (!prev) return { changed: false };
	await activatePolicyVersion(knex, policySetId, prev.version);
	return { changed: true, version: prev.version };
}

async function getBoundPolicySetIdForApp(knex, appId) {
	const row = await knex("web_threat_bindings")
		.where({ app_id: appId, enabled: 1 })
		.whereNull("route_id")
		.orderBy("id", "desc")
		.first();
	return row?.policy_set_id ? Number.parseInt(String(row.policy_set_id), 10) || null : null;
}

async function getEffectivePolicyForApp(knex, appId) {
	const globalId = await ensureGlobalPolicySet(knex);
	const bound = appId ? await getBoundPolicySetIdForApp(knex, appId) : null;
	const policySetId = bound ?? globalId;
	const policySet = await getPolicySet(knex, policySetId);
	const active = await getActivePolicyVersion(knex, policySetId);
	return {
		policySet,
		activeVersion: active,
		effectivePolicy: active?.policy ?? DEFAULT_POLICY,
	};
}

const internalWebThreatControls = {
	defaultPolicy: DEFAULT_POLICY,
	normalizePolicy,
	ensureGlobalPolicySet,
	getPolicySet,
	getActivePolicyVersion,
	createPolicyVersion,
	activatePolicyVersion,
	rollbackPolicySet,
	getEffectivePolicyForApp,
};

export default internalWebThreatControls;

