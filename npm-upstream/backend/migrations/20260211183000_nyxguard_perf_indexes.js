import { migrate as logger } from "../logger.js";

const migrateName = "nyxguard_perf_indexes";

const isDuplicateIndexError = (err) => {
	const msg = String(err?.message ?? "").toLowerCase();
	return msg.includes("duplicate key name") || msg.includes("already exists") || msg.includes("duplicate index");
};

const createIndexSafe = async (knex, tableName, columns, indexName) => {
	try {
		await knex.schema.alterTable(tableName, (table) => {
			table.index(columns, indexName);
		});
		logger.info(`[${migrateName}] created index ${indexName}`);
	} catch (err) {
		if (isDuplicateIndexError(err)) {
			logger.info(`[${migrateName}] index ${indexName} already exists, skipping`);
			return;
		}
		throw err;
	}
};

const dropIndexSafe = async (knex, tableName, columns, indexName) => {
	try {
		await knex.schema.alterTable(tableName, (table) => {
			table.dropIndex(columns, indexName);
		});
	} catch (err) {
		const msg = String(err?.message ?? "").toLowerCase();
		if (msg.includes("check that column/key exists") || msg.includes("does not exist") || msg.includes("no such index")) {
			return;
		}
		throw err;
	}
};

const up = async (knex) => {
	logger.info(`[${migrateName}] Migrating Up...`);

	const hasIpRuleTable = await knex.schema.hasTable("nyxguard_ip_rule");
	if (hasIpRuleTable) {
		// Speeds up deny/allow rule lookups by IP in attacks endpoints and auto-ban flow.
		await createIndexSafe(knex, "nyxguard_ip_rule", ["ip_cidr", "action"], "idx_nyxguard_ip_rule_ip_action");
		// Speeds up queries fetching latest deny row per IP.
		await createIndexSafe(knex, "nyxguard_ip_rule", ["action", "ip_cidr", "id"], "idx_nyxguard_ip_rule_action_ip_id");
	}
};

const down = async (knex) => {
	logger.warn(`[${migrateName}] Migrating Down...`);
	await dropIndexSafe(knex, "nyxguard_ip_rule", ["action", "ip_cidr", "id"], "idx_nyxguard_ip_rule_action_ip_id");
	await dropIndexSafe(knex, "nyxguard_ip_rule", ["ip_cidr", "action"], "idx_nyxguard_ip_rule_ip_action");
};

export { up, down };
