import { migrate as logger } from "../logger.js";

const migrateName = "nyxguard_waf";

/**
 * Migrate
 *
 * @see http://knexjs.org/#Schema
 *
 * @param   {Object}  knex
 * @returns {Promise}
 */
const up = async (knex) => {
	logger.info(`[${migrateName}] Migrating Up...`);

	const hasSettings = await knex.schema.hasTable("nyxguard_settings");
	if (!hasSettings) {
		await knex.schema.createTable("nyxguard_settings", (table) => {
			table.increments("id").primary();
			table.boolean("bot_defense_enabled").notNullable().defaultTo(false);
			table.boolean("ddos_enabled").notNullable().defaultTo(false);
			table.integer("log_retention_days").notNullable().defaultTo(30);
			table.dateTime("created_on").notNullable().defaultTo(knex.fn.now());
			table.dateTime("modified_on").notNullable().defaultTo(knex.fn.now());
		});
		logger.info(`[${migrateName}] nyxguard_settings table created`);
	}

	const hasRules = await knex.schema.hasTable("nyxguard_ip_rule");
	if (!hasRules) {
		await knex.schema.createTable("nyxguard_ip_rule", (table) => {
			table.increments("id").primary();
			table.boolean("enabled").notNullable().defaultTo(true);
			table.enu("action", ["allow", "deny"]).notNullable().defaultTo("deny");
			table.string("ip_cidr", 64).notNullable();
			table.string("note", 255).nullable();
			table.dateTime("created_on").notNullable().defaultTo(knex.fn.now());
			table.dateTime("modified_on").notNullable().defaultTo(knex.fn.now());
			table.index(["enabled", "action"]);
		});
		logger.info(`[${migrateName}] nyxguard_ip_rule table created`);
	}

	// Optional: track which proxy hosts have NyxGuard WAF enabled.
	const hasApps = await knex.schema.hasTable("nyxguard_app");
	if (!hasApps) {
		await knex.schema.createTable("nyxguard_app", (table) => {
			table.integer("proxy_host_id").unsigned().notNullable().primary();
			table.boolean("waf_enabled").notNullable().defaultTo(false);
			table.dateTime("created_on").notNullable().defaultTo(knex.fn.now());
			table.dateTime("modified_on").notNullable().defaultTo(knex.fn.now());
			table.index(["waf_enabled"]);
		});
		logger.info(`[${migrateName}] nyxguard_app table created`);
	}
};

/**
 * Undo Migrate
 *
 * @param   {Object}  knex
 * @returns {Promise}
 */
const down = async (knex) => {
	logger.warn(`[${migrateName}] Migrating Down...`);
	await knex.schema.dropTableIfExists("nyxguard_app");
	await knex.schema.dropTableIfExists("nyxguard_ip_rule");
	await knex.schema.dropTableIfExists("nyxguard_settings");
};

export { up, down };
