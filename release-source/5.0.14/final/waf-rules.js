import net from "node:net";
import errs from "../lib/error.js";

const VALID_ACTIONS = new Set(["block", "allow"]);
const VALID_TYPES = new Set(["uri", "ua", "method", "header", "ip"]);
const VALID_METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD", "TRACE", "CONNECT"]);
const HEADER_NAME_RE = /^[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*$/;

function invalid(message) {
	throw new errs.ValidationError(message);
}

function normalizeIpPattern(raw) {
	const value = String(raw ?? "").trim();
	const parts = value.split("/");
	if (parts.length > 2 || !parts[0]) invalid(`Invalid IP/CIDR: ${value}`);
	const family = net.isIP(parts[0]);
	if (!family) invalid(`Invalid IP/CIDR: ${value}`);
	if (parts.length === 2) {
		if (!/^\d+$/.test(parts[1])) invalid(`Invalid IP/CIDR prefix: ${value}`);
		const prefix = Number(parts[1]);
		const max = family === 4 ? 32 : 128;
		if (prefix < 0 || prefix > max) invalid(`Invalid IP/CIDR prefix: ${value}`);
		return `${parts[0]}/${prefix}`;
	}
	return parts[0];
}

function normalizeRule(data) {
	const patternType = String(data.pattern_type ?? "uri").trim().toLowerCase();
	let pattern = String(data.pattern ?? "").trim();
	if (patternType === "method") pattern = pattern.toUpperCase();
	if (patternType === "ip" && pattern) pattern = normalizeIpPattern(pattern);

	const enabled = data.enabled === undefined ? 1 : data.enabled === true || data.enabled === 1 ? 1 : data.enabled === false || data.enabled === 0 ? 0 : null;
	if (enabled === null) invalid("enabled must be a boolean");

	const priority = data.priority === undefined || data.priority === "" ? 100 : Number(data.priority);
	if (!Number.isInteger(priority) || priority < 0 || priority > 9999) {
		invalid("priority must be an integer between 0 and 9999");
	}

	return {
		enabled,
		action: String(data.action ?? "block").trim().toLowerCase(),
		pattern_type: patternType,
		pattern,
		header_name: data.header_name === undefined || data.header_name === null ? null : String(data.header_name).trim(),
		// Notes are emitted as Nginx comments. Collapse control/newline characters
		// so an administrator-entered description can never become configuration.
		note: data.note ? String(data.note).replace(/[\x00-\x1f\x7f]+/g, " ").trim() : null,
		priority,
	};
}

function validateRule(data) {
	if (!VALID_ACTIONS.has(data.action)) invalid(`Invalid action: ${data.action}`);
	if (!VALID_TYPES.has(data.pattern_type)) invalid(`Invalid pattern type: ${data.pattern_type}`);
	if (!data.pattern) invalid("Pattern is required");
	if (data.pattern.length > 1024) invalid("Pattern must be 1024 characters or fewer");
	if (data.note && data.note.length > 255) invalid("Note must be 255 characters or fewer");

	if (data.pattern_type === "header") {
		if (!data.header_name) invalid("Header name is required for header rules");
		if (data.header_name.length > 128 || !HEADER_NAME_RE.test(data.header_name)) {
			invalid("Header name may contain letters, numbers, and single hyphens only");
		}
	} else {
		data.header_name = null;
	}

	if (data.pattern_type === "method" && !VALID_METHODS.has(data.pattern)) {
		invalid(`Invalid HTTP method: ${data.pattern}`);
	}
	if (data.pattern_type === "ip") normalizeIpPattern(data.pattern);

	if (["uri", "ua", "header"].includes(data.pattern_type)) {
		// Nginx parses $name and ${name} as configuration variables even inside a
		// quoted regex. Regex end anchors are safe; reject variable-like uses so a
		// manual pattern cannot read or splice runtime Nginx variables.
		if (/(^|[^\\])\$(?:[A-Za-z0-9_]|\{)/.test(data.pattern)) {
			invalid("Regex patterns cannot contain Nginx variable references");
		}
		try {
			// JavaScript and Nginx PCRE are not identical; this catches common syntax
			// errors, while the transactional Nginx test is the final authority.
			new RegExp(data.pattern);
		} catch {
			invalid(`Invalid regex pattern: ${data.pattern}`);
		}
	}
}

function prepareRule(data) {
	const normalized = normalizeRule(data);
	validateRule(normalized);
	return normalized;
}

function nginxEscapeDoubleQuoted(value) {
	// Backslashes and quotes are configuration syntax. Dollar end anchors are
	// intentionally preserved; variable-like dollar uses were rejected above.
	return String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function safeRuleId(id) {
	const value = Number(id);
	if (!Number.isInteger(value) || value <= 0) throw new Error(`Invalid persisted WAF rule id: ${id}`);
	return value;
}

function geoValue(pattern) {
	if (pattern.includes("/")) return pattern;
	return `${pattern}/${net.isIP(pattern) === 6 ? 128 : 32}`;
}

function buildNginxCondition(rule) {
	const pattern = String(rule.pattern).trim();
	switch (rule.pattern_type) {
		case "uri": {
			// $uri is the normalized request path and excludes query-string noise,
			// making manual rules deterministic across proxy rewrites. Match against
			// an explicit sentinel because some rewrite passes append internal state
			// that makes a raw PCRE end anchor unreliable for URI variables.
			// Treat a terminal slash as equivalent for routing purposes, so an exact
			// `/admin$` rule also covers Nginx's normalized `/admin/` form.
			const sentinelPattern = pattern.replace(/(^|[^\\])\$/g, "$1/?(?=::__NYX_WAF_END__)");
			return `$waf_custom_uri_value ~* "${nginxEscapeDoubleQuoted(sentinelPattern)}"`;
		}
		case "ua":
			return `$http_user_agent ~* "${nginxEscapeDoubleQuoted(pattern)}"`;
		case "method":
			return `$request_method = "${pattern}"`;
		case "header": {
			const variable = String(rule.header_name).toLowerCase().replace(/-/g, "_");
			return `$http_${variable} ~* "${nginxEscapeDoubleQuoted(pattern)}"`;
		}
		case "ip":
			return `$waf_custom_ip_rule_${safeRuleId(rule.id)} = 1`;
		default:
			return null;
	}
}

function enabledRules(rules) {
	return [...(rules ?? [])]
		.filter((rule) => Number(rule.enabled) === 1)
		.sort((a, b) => Number(a.priority) - Number(b.priority) || Number(a.id) - Number(b.id));
}

function generateNginxHttpSnippet(rules) {
	const ipRules = enabledRules(rules).filter((rule) => rule.pattern_type === "ip");
	if (!ipRules.length) return "# NyxGuard custom WAF IP maps: none configured.\n";
	const lines = ["# NyxGuard custom WAF IP/CIDR maps - Managed automatically."];
	for (const rule of ipRules) {
		// Use the explicit address form so evaluation follows the final real-IP
		// value after trusted-proxy processing instead of an implicit geo source.
		lines.push(`geo $remote_addr $waf_custom_ip_rule_${safeRuleId(rule.id)} {`);
		lines.push("\tdefault 0;");
		lines.push(`\t${geoValue(String(rule.pattern).trim())} 1;`);
		lines.push("}", "");
	}
	return lines.join("\n");
}

function generateNginxSnippet(rules) {
	const ordered = enabledRules(rules);
	if (!ordered.length) return "# NyxGuard WAF Custom Rules: none configured.\n";

	const lines = [
		"# NyxGuard WAF Custom Rules - Managed automatically. Do not edit.",
		"# First matching rule wins; lower priority numbers are evaluated first.",
		'set $waf_custom_uri_value "$uri::__NYX_WAF_END__";',
		'set $waf_custom_decision "";',
		'set $waf_custom_rule_match "0";',
		'set $waf_custom_rule_gate "";',
		"",
	];

	for (const rule of ordered) {
		const condition = buildNginxCondition(rule);
		if (!condition) continue;
		const note = rule.note ? ` - ${String(rule.note).replace(/[\r\n]+/g, " ")}` : "";
		lines.push(`# Rule ${safeRuleId(rule.id)} priority=${Number(rule.priority)} action=${rule.action}${note}`);
		lines.push('set $waf_custom_rule_match "0";');
		lines.push(`if (${condition}) { set $waf_custom_rule_match "1"; }`);
		lines.push('set $waf_custom_rule_gate "$waf_custom_decision:$waf_custom_rule_match";');
		lines.push(`if ($waf_custom_rule_gate = ":1") { set $waf_custom_decision "${rule.action}"; set $nyxguard_observed_candidate "${Buffer.from(JSON.stringify({reason:"waf_rule",id:safeRuleId(rule.id)})).toString("base64")}"; }`);
		lines.push("");
	}

	lines.push("# Enforce only a first-match block decision. Allow rules do not disable built-in protections.");
	lines.push('if ($waf_custom_decision = "block") { set $nyxguard_observed $nyxguard_observed_candidate; return 403 "Blocked by WAF custom rule."; }');
	lines.push("");
	return lines.join("\n");
}

const internalWafRules = {
	async list(knex, { proxyHostId = null } = {}) {
		return knex("nyxguard_waf_rule").where({ proxy_host_id: proxyHostId }).orderBy("priority", "asc").orderBy("id", "asc");
	},

	async get(knex, id) {
		const row = await knex("nyxguard_waf_rule").where({ id }).first();
		if (!row) throw new errs.ItemNotFoundError(`WAF rule ${id}`);
		return row;
	},

	async create(knex, data) {
		const prepared = prepareRule(data);
		const [id] = await knex("nyxguard_waf_rule").insert({
			...prepared,
			proxy_host_id: null,
			created_on: knex.fn.now(),
			modified_on: knex.fn.now(),
		});
		return internalWafRules.get(knex, id);
	},

	async update(knex, id, data) {
		const existing = await internalWafRules.get(knex, id);
		const prepared = prepareRule({ ...existing, ...data });
		await knex("nyxguard_waf_rule").where({ id }).update({ ...prepared, modified_on: knex.fn.now() });
		return internalWafRules.get(knex, id);
	},

	async remove(knex, id) {
		await internalWafRules.get(knex, id);
		await knex("nyxguard_waf_rule").where({ id }).delete();
	},

	generateNginxHttpSnippet,
	generateNginxSnippet,
};

export default internalWafRules;
