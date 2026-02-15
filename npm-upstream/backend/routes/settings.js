import express from "express";
import db from "../db.js";
import internalSetting from "../internal/setting.js";
import pjson from "../package.json" with { type: "json" };
import jwtdecode from "../lib/express/jwt-decode.js";
import apiValidator from "../lib/validator/api.js";
import validator from "../lib/validator/index.js";
import { debug, express as logger } from "../logger.js";
import { getValidationSchema } from "../schema/index.js";

const router = express.Router({
	caseSensitive: true,
	strict: true,
	mergeParams: true,
});

const BACKUP_FILE_VERSION = ((process.env.NPM_BUILD_VERSION || pjson.version || "").toString().replace(/^v/i, "").split("-")[0]) || "0.0.0";
const BACKUP_EXCLUDE_TABLES = new Set(["migrations", "sqlite_sequence"]);

async function getDbTableNames(knex) {
	const client = String(knex.client.config.client || "").toLowerCase();

	if (client.includes("mysql")) {
		const raw = await knex.raw("SHOW TABLES");
		const rows = Array.isArray(raw) ? raw[0] : raw;
		if (!Array.isArray(rows)) return [];
		return rows
			.map((row) => {
				const key = Object.keys(row || {})[0];
				return key ? row[key] : null;
			})
			.filter((name) => typeof name === "string" && name.length > 0);
	}

	if (client.includes("sqlite")) {
		const rows = await knex("sqlite_master")
			.select("name")
			.where({ type: "table" })
			.whereNotLike("name", "sqlite_%");
		return rows.map((row) => row.name).filter(Boolean);
	}

	// postgres-like fallback
	const rows = await knex("information_schema.tables")
		.select("table_name")
		.where({ table_schema: "public" });
	return rows.map((row) => row.table_name).filter(Boolean);
}

function chunkRows(rows, size = 250) {
	const out = [];
	for (let i = 0; i < rows.length; i += size) {
		out.push(rows.slice(i, i + size));
	}
	return out;
}

/**
 * /api/settings
 */
router
	.route("/")
	.options((_, res) => {
		res.sendStatus(204);
	})
	.all(jwtdecode())

	/**
	 * GET /api/settings
	 *
	 * Retrieve all settings
	 */
	.get(async (req, res, next) => {
		try {
			const rows = await internalSetting.getAll(res.locals.access);
			res.status(200).send(rows);
		} catch (err) {
			debug(logger, `${req.method.toUpperCase()} ${req.path}: ${err}`);
			next(err);
		}
	});

/**
 * Backup export
 *
 * GET /api/settings/backup/export
 */
router
	.route("/backup/export")
	.options((_, res) => {
		res.sendStatus(204);
	})
	.all(jwtdecode())
	.get(async (req, res, next) => {
		try {
			await res.locals.access.can("settings:list");
			const knex = db();
			const allTables = await getDbTableNames(knex);
			const tableNames = allTables.filter((name) => !BACKUP_EXCLUDE_TABLES.has(name));

			const tables = {};
			for (const tableName of tableNames) {
				// eslint-disable-next-line no-await-in-loop
				tables[tableName] = await knex(tableName).select("*");
			}

			const payload = {
				version: BACKUP_FILE_VERSION,
				exported_at: new Date().toISOString(),
				tables,
			};

			const fileName = `nyxguard-backup-v${BACKUP_FILE_VERSION}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
			res.setHeader("Content-Type", "application/json; charset=utf-8");
			res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
			res.status(200).send(JSON.stringify(payload, null, 2));
		} catch (err) {
			debug(logger, `${req.method.toUpperCase()} ${req.path}: ${err}`);
			next(err);
		}
	});

/**
 * Backup import
 *
 * POST /api/settings/backup/import
 */
router
	.route("/backup/import")
	.options((_, res) => {
		res.sendStatus(204);
	})
	.all(jwtdecode())
	.post(async (req, res, next) => {
		try {
			await res.locals.access.can("settings:update", "default-site");

			const uploaded = req.files?.backup || req.files?.file || null;
			if (!uploaded) {
				throw new Error("Backup file is required.");
			}

			const file = Array.isArray(uploaded) ? uploaded[0] : uploaded;
			const raw = file?.data?.toString("utf8");
			if (!raw) {
				throw new Error("Backup file is empty or invalid.");
			}

			let payload;
			try {
				payload = JSON.parse(raw);
			} catch {
				throw new Error("Backup file is not valid JSON.");
			}

			if (!payload?.version || payload.version !== BACKUP_FILE_VERSION) {
				throw new Error(
					`Backup version mismatch. This app is v${BACKUP_FILE_VERSION} and only accepts backups from the same version.`,
				);
			}

			const backupTables = payload?.tables && typeof payload.tables === "object" ? payload.tables : null;
			if (!backupTables) {
				throw new Error("Backup file has no tables section.");
			}

			const knex = db();
			const allTables = await getDbTableNames(knex);
			const tableNames = allTables.filter((name) => !BACKUP_EXCLUDE_TABLES.has(name));

			const client = String(knex.client.config.client || "").toLowerCase();

			await knex.transaction(async (trx) => {
				if (client.includes("mysql")) {
					await trx.raw("SET FOREIGN_KEY_CHECKS = 0");
				}
				if (client.includes("sqlite")) {
					await trx.raw("PRAGMA foreign_keys = OFF");
				}

				for (const tableName of tableNames) {
					// eslint-disable-next-line no-await-in-loop
					await trx(tableName).del();
				}

				for (const tableName of tableNames) {
					const rows = Array.isArray(backupTables[tableName]) ? backupTables[tableName] : [];
					if (!rows.length) continue;
					const chunks = chunkRows(rows, 200);
					for (const chunk of chunks) {
						// eslint-disable-next-line no-await-in-loop
						await trx.batchInsert(tableName, chunk, 200);
					}
				}

				if (client.includes("mysql")) {
					await trx.raw("SET FOREIGN_KEY_CHECKS = 1");
				}
				if (client.includes("sqlite")) {
					await trx.raw("PRAGMA foreign_keys = ON");
				}
			});

			res.status(200).send({
				success: true,
				version: BACKUP_FILE_VERSION,
				message: "Configuration import completed. Reboot is required for all changes to take effect.",
			});
		} catch (err) {
			debug(logger, `${req.method.toUpperCase()} ${req.path}: ${err}`);
			next(err);
		}
	});

/**
 * Reboot trigger after restore
 *
 * POST /api/settings/backup/reboot
 */
router
	.route("/backup/reboot")
	.options((_, res) => {
		res.sendStatus(204);
	})
	.all(jwtdecode())
	.post(async (req, res, next) => {
		try {
			await res.locals.access.can("settings:update", "default-site");
			res.status(200).send({ success: true, rebooting: true });
			setTimeout(() => {
				process.exit(0);
			}, 350);
		} catch (err) {
			debug(logger, `${req.method.toUpperCase()} ${req.path}: ${err}`);
			next(err);
		}
	});

/**
 * Specific setting
 *
 * /api/settings/something
 */
router
	.route("/:setting_id")
	.options((_, res) => {
		res.sendStatus(204);
	})
	.all(jwtdecode())

	/**
	 * GET /settings/something
	 *
	 * Retrieve a specific setting
	 */
	.get(async (req, res, next) => {
		try {
			const data = await validator(
				{
					required: ["setting_id"],
					additionalProperties: false,
					properties: {
						setting_id: {
							type: "string",
							minLength: 1,
						},
					},
				},
				{
					setting_id: req.params.setting_id,
				},
			);
			const row = await internalSetting.get(res.locals.access, {
				id: data.setting_id,
			});
			res.status(200).send(row);
		} catch (err) {
			debug(logger, `${req.method.toUpperCase()} ${req.path}: ${err}`);
			next(err);
		}
	})

	/**
	 * PUT /api/settings/something
	 *
	 * Update and existing setting
	 */
	.put(async (req, res, next) => {
		try {
			const payload = await apiValidator(getValidationSchema("/settings/{settingID}", "put"), req.body);
			payload.id = req.params.setting_id;
			const result = await internalSetting.update(res.locals.access, payload);
			res.status(200).send(result);
		} catch (err) {
			debug(logger, `${req.method.toUpperCase()} ${req.path}: ${err}`);
			next(err);
		}
	});

export default router;
