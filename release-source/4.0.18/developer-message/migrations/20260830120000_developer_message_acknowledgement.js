import { migrate as logger } from "../logger.js";

const migrateName = "developer_message_acknowledgement";
const columnName = "developer_message_acknowledged_on";

const up = async (knex) => {
	logger.info(`[${migrateName}] Migrating Up...`);
	if (!(await knex.schema.hasColumn("user", columnName))) {
		await knex.schema.alterTable("user", (table) => {
			table.dateTime(columnName).nullable().defaultTo(null);
		});
	}
	logger.info(`[${migrateName}] Per-user acknowledgement state is ready`);
};

const down = async (knex) => {
	logger.info(`[${migrateName}] Migrating Down...`);
	if (await knex.schema.hasColumn("user", columnName)) {
		await knex.schema.alterTable("user", (table) => {
			table.dropColumn(columnName);
		});
	}
};

export { down, up };
