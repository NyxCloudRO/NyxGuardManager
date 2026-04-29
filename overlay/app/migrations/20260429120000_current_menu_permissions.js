import { migrate as logger } from "../logger.js";

const migrateName = "current_menu_permissions";
const columns = [
	"nyxguard",
	"web_controls",
	"users",
	"auditlog",
	"settings",
];

const isMySqlFamily = (client) => client === "mysql" || client === "mysql2" || client === "mariadb";

const up = async (knex) => {
	logger.info(`[${migrateName}] Migrating Up...`);

	for (const column of columns) {
		const exists = await knex.schema.hasColumn("user_permission", column);
		if (!exists) {
			await knex.schema.alterTable("user_permission", (table) => {
				table.string(column).notNullable().defaultTo("hidden");
			});
		}
	}

	const client = knex?.client?.config?.client;
	if (isMySqlFamily(client)) {
		await knex.raw(`
			UPDATE user_permission up
			JOIN user u ON u.id = up.user_id
			SET
				up.nyxguard = IF(JSON_CONTAINS(u.roles, '"admin"'), 'manage', 'view'),
				up.web_controls = IF(JSON_CONTAINS(u.roles, '"admin"'), 'manage', 'view'),
				up.users = IF(JSON_CONTAINS(u.roles, '"admin"'), 'manage', 'view'),
				up.auditlog = IF(JSON_CONTAINS(u.roles, '"admin"'), 'manage', 'view'),
				up.settings = IF(JSON_CONTAINS(u.roles, '"admin"'), 'manage', 'view')
		`);
	} else if (client === "pg" || client === "postgres" || client === "postgresql") {
		await knex.raw(`
			UPDATE user_permission up
			SET
				nyxguard = CASE WHEN u.roles::jsonb ? 'admin' THEN 'manage' ELSE 'view' END,
				web_controls = CASE WHEN u.roles::jsonb ? 'admin' THEN 'manage' ELSE 'view' END,
				users = CASE WHEN u.roles::jsonb ? 'admin' THEN 'manage' ELSE 'view' END,
				auditlog = CASE WHEN u.roles::jsonb ? 'admin' THEN 'manage' ELSE 'view' END,
				settings = CASE WHEN u.roles::jsonb ? 'admin' THEN 'manage' ELSE 'view' END
			FROM "user" u
			WHERE u.id = up.user_id
		`);
	} else {
		const rows = await knex("user").select("id", "roles");
		for (const user of rows) {
			let roles = user.roles;
			if (typeof roles === "string") {
				try {
					roles = JSON.parse(roles);
				} catch {
					roles = [];
				}
			}
			const value = Array.isArray(roles) && roles.includes("admin") ? "manage" : "view";
			await knex("user_permission").where("user_id", user.id).update({
				nyxguard: value,
				web_controls: value,
				users: value,
				auditlog: value,
				settings: value,
			});
		}
	}

	logger.info(`[${migrateName}] current menu permission columns ready`);
};

const down = async (knex) => {
	logger.info(`[${migrateName}] Migrating Down...`);
	for (const column of columns) {
		const exists = await knex.schema.hasColumn("user_permission", column);
		if (exists) {
			await knex.schema.alterTable("user_permission", (table) => {
				table.dropColumn(column);
			});
		}
	}
};

export { down, up };
