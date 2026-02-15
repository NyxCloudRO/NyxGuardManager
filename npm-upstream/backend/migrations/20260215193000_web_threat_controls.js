import { migrate as logger } from "../logger.js";

const migrateName = "web_threat_controls";

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

const up = async (knex) => {
	logger.info(`[${migrateName}] Migrating Up...`);
	const hasSets = await knex.schema.hasTable("web_threat_policy_sets");
	if (!hasSets) {
		await knex.schema.createTable("web_threat_policy_sets", (table) => {
			table.bigIncrements("id").primary();
			table.enu("scope", ["global", "app"], { useNative: false, enumName: "web_threat_policy_sets_scope" }).notNullable();
			table.bigInteger("app_id").nullable().index();
			table.string("name", 128).notNullable();
			table.dateTime("created_at").notNullable().defaultTo(knex.fn.now());
			table.dateTime("updated_at").notNullable().defaultTo(knex.fn.now());
			table.index(["scope", "app_id"]);
		});
	}

	const hasVersions = await knex.schema.hasTable("web_threat_policy_versions");
	if (!hasVersions) {
		await knex.schema.createTable("web_threat_policy_versions", (table) => {
			table.bigIncrements("id").primary();
			table.bigInteger("policy_set_id").notNullable().unsigned().index();
			table.integer("version").notNullable();
			table.json("policy_json").notNullable();
			table.string("created_by", 128).notNullable();
			table.dateTime("created_at").notNullable().defaultTo(knex.fn.now());
			table.boolean("is_active").notNullable().defaultTo(false).index();
			table.unique(["policy_set_id", "version"]);
			table.index(["policy_set_id", "is_active"]);
		});
	}

	const hasBindings = await knex.schema.hasTable("web_threat_bindings");
	if (!hasBindings) {
		await knex.schema.createTable("web_threat_bindings", (table) => {
			table.bigIncrements("id").primary();
			table.bigInteger("app_id").notNullable().unsigned();
			table.bigInteger("route_id").nullable().unsigned();
			table.bigInteger("policy_set_id").notNullable().unsigned();
			table.boolean("enabled").notNullable().defaultTo(true);
			table.dateTime("created_at").notNullable().defaultTo(knex.fn.now());
			table.index(["app_id", "route_id"]);
			table.index(["policy_set_id"]);
		});
	}

	const hasEvents = await knex.schema.hasTable("web_threat_events");
	if (!hasEvents) {
		await knex.schema.createTable("web_threat_events", (table) => {
			table.bigIncrements("id").primary();
			table.dateTime("ts", { precision: 3 }).notNullable().defaultTo(knex.fn.now()).index();
			table.bigInteger("app_id").nullable().unsigned().index();
			table.bigInteger("route_id").nullable().unsigned();
			table.enu("category", ["inbound", "browser", "outbound"], { useNative: false, enumName: "web_threat_events_category" }).notNullable().index();
			table.string("rule_id", 64).notNullable().index();
			table.enu("action", ["allow", "log", "block"], { useNative: false, enumName: "web_threat_events_action" }).notNullable();
			table.string("reason", 255).notNullable();
			table.string("src_ip", 45).nullable();
			table.string("request_id", 64).nullable();
			table.json("meta").nullable();
			table.index(["app_id", "ts"]);
			table.index(["category", "ts"]);
			table.index(["rule_id", "ts"]);
		});
	}

	// Seed a safe-by-default global policy set + v1 (monitor/report-only/monitor).
	const existingGlobal = await knex("web_threat_policy_sets").where({ scope: "global" }).first();
	if (!existingGlobal) {
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
			policy_json: DEFAULT_POLICY,
			created_by: "system",
			created_at: knex.fn.now(),
			is_active: 1,
		});
	}
};

const down = async (knex) => {
	logger.warn(`[${migrateName}] Migrating Down...`);
	await knex.schema.dropTableIfExists("web_threat_events");
	await knex.schema.dropTableIfExists("web_threat_bindings");
	await knex.schema.dropTableIfExists("web_threat_policy_versions");
	await knex.schema.dropTableIfExists("web_threat_policy_sets");
};

export { up, down };
