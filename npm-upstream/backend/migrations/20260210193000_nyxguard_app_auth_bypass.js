import { migrate as logger } from "../logger.js";

const migrateName = "nyxguard_app_auth_bypass";

const up = async (knex) => {
	const hasApps = await knex.schema.hasTable("nyxguard_app");
	if (!hasApps) return;

	const hasCol = await knex.schema.hasColumn("nyxguard_app", "auth_bypass_enabled");
	if (!hasCol) {
		await knex.schema.alterTable("nyxguard_app", (table) => {
			table.boolean("auth_bypass_enabled").notNullable().defaultTo(true);
		});
		logger.info(`[${migrateName}] Added nyxguard_app.auth_bypass_enabled`);
	}
};

const down = async (knex) => {
	const hasApps = await knex.schema.hasTable("nyxguard_app");
	if (!hasApps) return;

	const hasCol = await knex.schema.hasColumn("nyxguard_app", "auth_bypass_enabled");
	if (hasCol) {
		await knex.schema.alterTable("nyxguard_app", (table) => {
			table.dropColumn("auth_bypass_enabled");
		});
		logger.info(`[${migrateName}] Dropped nyxguard_app.auth_bypass_enabled`);
	}
};

export { up, down };
