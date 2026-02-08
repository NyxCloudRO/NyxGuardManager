const up = async (knex) => {
	// IP rules: optional expiry
	const hasExpiresOn = await knex.schema.hasColumn("nyxguard_ip_rule", "expires_on");
	if (!hasExpiresOn) {
		await knex.schema.table("nyxguard_ip_rule", (table) => {
			table.dateTime("expires_on").nullable().defaultTo(null);
		});
	}

	// Country rules: allow/deny by ISO-3166 alpha-2 code
	const hasCountryTable = await knex.schema.hasTable("nyxguard_country_rule");
	if (!hasCountryTable) {
		await knex.schema.createTable("nyxguard_country_rule", (table) => {
			table.increments("id").primary();
			table.boolean("enabled").notNullable().defaultTo(true);
			table.enu("action", ["allow", "deny"]).notNullable().defaultTo("deny");
			table.string("country_code", 2).notNullable();
			table.string("note", 255).nullable().defaultTo(null);
			table.dateTime("expires_on").nullable().defaultTo(null);
			table.dateTime("created_on").notNullable().defaultTo(knex.fn.now());
			table.dateTime("modified_on").notNullable().defaultTo(knex.fn.now());
			table.index(["enabled", "action"], "idx_nyxguard_country_rule_enabled_action");
			table.index(["country_code"], "idx_nyxguard_country_rule_country_code");
		});
	}
};

const down = async (knex) => {
	await knex.schema.dropTableIfExists("nyxguard_country_rule");
	const hasExpiresOn = await knex.schema.hasColumn("nyxguard_ip_rule", "expires_on");
	if (hasExpiresOn) {
		await knex.schema.table("nyxguard_ip_rule", (table) => {
			table.dropColumn("expires_on");
		});
	}
};

export { up, down };
