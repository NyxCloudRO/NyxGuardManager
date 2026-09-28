import { migrate as logger } from "../logger.js";

const up = async (knex) => {
	logger.info("[nyxcloud_professional_support] Preparing additive application state");
	if (!(await knex.schema.hasTable("nyxcloud_license_state"))) {
		await knex.schema.createTable("nyxcloud_license_state", (table) => {
			table.integer("id").primary();
			table.string("installation_id", 36).notNullable();
			table.text("sealed_state").nullable();
			table.bigInteger("revision_floor").notNullable().defaultTo(0);
			table.dateTime("updated_on").notNullable();
		});
	}
	if (!(await knex.schema.hasTable("nyxcloud_support_upload"))) {
		await knex.schema.createTable("nyxcloud_support_upload", (table) => {
			table.increments("id").primary();
			table.string("idempotency_key", 128).notNullable().unique();
			table.string("bundle_sha256", 64).notNullable();
			table.text("sealed_bundle", "longtext").notNullable();
			table.string("state", 16).notNullable();
			table.string("support_id", 64).nullable();
			table.dateTime("expires_at").nullable();
			table.dateTime("created_on").notNullable();
			table.dateTime("updated_on").notNullable();
		});
	}
};

// Operational rollback keeps customer licensing and pending upload state for reconciliation.
const down = async () => {};

export { up, down };
