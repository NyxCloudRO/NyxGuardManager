import { migrate as logger } from "../logger.js";

const migrateName = "nyxguard_attacks_sqli";

const up = async (knex) => {
	logger.info(`[${migrateName}] Migrating Up...`);

	// Global setting for SQL Injection Shield
	const hasSqliEnabled = await knex.schema.hasColumn("nyxguard_settings", "sqli_enabled");
	if (!hasSqliEnabled) {
		await knex.schema.table("nyxguard_settings", (table) => {
			table.boolean("sqli_enabled").notNullable().defaultTo(false);
		});
		logger.info(`[${migrateName}] nyxguard_settings.sqli_enabled column added`);
	}

	// Normalized attack events (fed by nginx attack log)
	const hasAttacks = await knex.schema.hasTable("nyxguard_attack_event");
	if (!hasAttacks) {
		await knex.schema.createTable("nyxguard_attack_event", (table) => {
			table.increments("id").primary();
			table.enu("attack_type", ["sqli", "ddos", "bot"]).notNullable();
			table.string("ip", 64).notNullable();
			table.string("host", 255).nullable().defaultTo(null);
			table.string("method", 16).nullable().defaultTo(null);
			table.text("uri").nullable().defaultTo(null);
			table.integer("status").nullable().defaultTo(null);
			table.text("user_agent").nullable().defaultTo(null);
			table.text("referer").nullable().defaultTo(null);
			table.integer("proxy_host_id").unsigned().nullable().defaultTo(null);
			table.integer("ban_rule_id").unsigned().nullable().defaultTo(null);
			table.dateTime("created_on").notNullable().defaultTo(knex.fn.now());

			table.index(["created_on"], "idx_nyxguard_attack_event_created_on");
			table.index(["attack_type", "created_on"], "idx_nyxguard_attack_event_type_created_on");
			table.index(["ip", "created_on"], "idx_nyxguard_attack_event_ip_created_on");
		});
		logger.info(`[${migrateName}] nyxguard_attack_event table created`);
	}

	// Track where the backend last read nginx's attack log.
	const hasState = await knex.schema.hasTable("nyxguard_attack_state");
	if (!hasState) {
		await knex.schema.createTable("nyxguard_attack_state", (table) => {
			table.increments("id").primary();
			table.string("log_path", 255).notNullable();
			table.bigInteger("inode").notNullable().defaultTo(0);
			table.bigInteger("offset").notNullable().defaultTo(0);
			table.dateTime("modified_on").notNullable().defaultTo(knex.fn.now());
		});
		logger.info(`[${migrateName}] nyxguard_attack_state table created`);
	}
};

const down = async (knex) => {
	logger.warn(`[${migrateName}] Migrating Down...`);
	await knex.schema.dropTableIfExists("nyxguard_attack_state");
	await knex.schema.dropTableIfExists("nyxguard_attack_event");
	const hasSqliEnabled = await knex.schema.hasColumn("nyxguard_settings", "sqli_enabled");
	if (hasSqliEnabled) {
		await knex.schema.table("nyxguard_settings", (table) => {
			table.dropColumn("sqli_enabled");
		});
	}
};

export { up, down };

