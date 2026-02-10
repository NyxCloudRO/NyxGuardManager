import { migrate as logger } from "../logger.js";

const migrateName = "nyxguard_globalgate_tuning";

async function addCol(knex, col, addFn) {
	const has = await knex.schema.hasColumn("nyxguard_settings", col);
	if (has) return;
	await knex.schema.alterTable("nyxguard_settings", (table) => addFn(table));
	logger.info(`[${migrateName}] Added nyxguard_settings.${col}`);
}

async function dropCol(knex, col) {
	const has = await knex.schema.hasColumn("nyxguard_settings", col);
	if (!has) return;
	await knex.schema.alterTable("nyxguard_settings", (table) => {
		table.dropColumn(col);
	});
	logger.info(`[${migrateName}] Dropped nyxguard_settings.${col}`);
}

const up = async (knex) => {
	logger.info(`[${migrateName}] Migrating Up...`);

	// DDoS tuning
	await addCol(knex, "ddos_rate_rps", (t) => t.integer("ddos_rate_rps").notNullable().defaultTo(10));
	await addCol(knex, "ddos_burst", (t) => t.integer("ddos_burst").notNullable().defaultTo(50));
	await addCol(knex, "ddos_conn_limit", (t) => t.integer("ddos_conn_limit").notNullable().defaultTo(30));

	// Bot tuning (simple tokens lists, newline separated)
	await addCol(knex, "bot_ua_tokens", (t) => t.text("bot_ua_tokens").nullable());
	await addCol(knex, "bot_path_tokens", (t) => t.text("bot_path_tokens").nullable());

	// SQL Shield tuning
	await addCol(knex, "sqli_threshold", (t) => t.integer("sqli_threshold").notNullable().defaultTo(8));
	await addCol(knex, "sqli_max_body", (t) => t.integer("sqli_max_body").notNullable().defaultTo(65536));
	await addCol(knex, "sqli_probe_min_score", (t) => t.integer("sqli_probe_min_score").notNullable().defaultTo(3));
	await addCol(knex, "sqli_probe_ban_score", (t) => t.integer("sqli_probe_ban_score").notNullable().defaultTo(20));
	await addCol(knex, "sqli_probe_window_sec", (t) => t.integer("sqli_probe_window_sec").notNullable().defaultTo(30));

	// Failed-login auto-ban tuning
	await addCol(knex, "authfail_threshold", (t) => t.integer("authfail_threshold").notNullable().defaultTo(5));
	await addCol(knex, "authfail_window_sec", (t) => t.integer("authfail_window_sec").notNullable().defaultTo(180));
	await addCol(knex, "authfail_ban_hours", (t) => t.integer("authfail_ban_hours").notNullable().defaultTo(24));

	// Global bypasses
	await addCol(knex, "auth_bypass_enabled", (t) => t.boolean("auth_bypass_enabled").notNullable().defaultTo(true));
};

const down = async (knex) => {
	logger.warn(`[${migrateName}] Migrating Down...`);

	await dropCol(knex, "auth_bypass_enabled");
	await dropCol(knex, "authfail_ban_hours");
	await dropCol(knex, "authfail_window_sec");
	await dropCol(knex, "authfail_threshold");
	await dropCol(knex, "sqli_probe_window_sec");
	await dropCol(knex, "sqli_probe_ban_score");
	await dropCol(knex, "sqli_probe_min_score");
	await dropCol(knex, "sqli_max_body");
	await dropCol(knex, "sqli_threshold");
	await dropCol(knex, "bot_path_tokens");
	await dropCol(knex, "bot_ua_tokens");
	await dropCol(knex, "ddos_conn_limit");
	await dropCol(knex, "ddos_burst");
	await dropCol(knex, "ddos_rate_rps");
};

export { up, down };

