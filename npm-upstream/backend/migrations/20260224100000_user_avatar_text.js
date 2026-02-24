import { migrate as logger } from "../logger.js";

const migrateName = "user_avatar_text";

const isMySqlFamily = (client) => client === "mysql" || client === "mysql2" || client === "mariadb";

const up = async (knex) => {
	logger.info(`[${migrateName}] Migrating Up...`);
	const client = knex?.client?.config?.client;

	if (isMySqlFamily(client)) {
		await knex.raw("ALTER TABLE `user` MODIFY COLUMN `avatar` TEXT NOT NULL");
	} else if (client === "pg" || client === "postgres" || client === "postgresql") {
		await knex.raw('ALTER TABLE "user" ALTER COLUMN "avatar" TYPE TEXT');
	} else {
		// SQLite stores strings as TEXT affinity and doesn't enforce VARCHAR length.
		logger.info(`[${migrateName}] No-op for client ${client}`);
	}

	logger.info(`[${migrateName}] user.avatar updated to TEXT`);
};

const down = async (knex) => {
	logger.info(`[${migrateName}] Migrating Down...`);
	const client = knex?.client?.config?.client;

	if (isMySqlFamily(client)) {
		await knex.raw("ALTER TABLE `user` MODIFY COLUMN `avatar` VARCHAR(255) NOT NULL");
	} else if (client === "pg" || client === "postgres" || client === "postgresql") {
		await knex.raw('ALTER TABLE "user" ALTER COLUMN "avatar" TYPE VARCHAR(255)');
	} else {
		logger.info(`[${migrateName}] No-op for client ${client}`);
	}

	logger.info(`[${migrateName}] user.avatar reverted to VARCHAR(255)`);
};

export { down, up };
