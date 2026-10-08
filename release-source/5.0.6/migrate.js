import {advance} from './internal/startup-progress.mjs';
import db from "./db.js";
import { migrate as logger } from "./logger.js";

const migrateUp = async () => {
	const version = await db().migrate.currentVersion();
	logger.info("Current database version:", version);
	advance("migration-schema");
	const result=await db().migrate.latest({
		tableName: "migrations",
		directory: "migrations",
	});
  advance("migration-complete");
  return result;
};

export { migrateUp };
