import { migrate as logger } from "../logger.js";

const migrateName = "nyxguard_log_retention";

/**
 * @param   {Object}  knex
 * @returns {Promise}
 */
const up = async (knex) => {
	logger.info(`[${migrateName}] Migrating Up...`);
	const hasCol = await knex.schema.hasColumn("nyxguard_settings", "log_retention_days");
	if (!hasCol) {
		await knex.schema.alterTable("nyxguard_settings", (table) => {
			table.integer("log_retention_days").notNullable().defaultTo(30);
		});
		logger.info(`[${migrateName}] Added nyxguard_settings.log_retention_days`);
	}
};

/**
 * @param   {Object}  knex
 * @returns {Promise}
 */
const down = async (_knex) => {
	logger.warn(`[${migrateName}] Down migration not supported.`);
	return true;
};

export { up, down };

