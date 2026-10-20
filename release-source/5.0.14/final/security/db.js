import knex from "knex";
import { configGet, configHas } from "./lib/config.js";

let instance = null;

const generateDbConfig = () => {
	if (!configHas("database")) {
		throw new Error(
			"Database config does not exist! Please read the instructions: https://nyxguardmanager.com/setup/",
		);
	}

	const cfg = configGet("database");

	if (cfg.engine === "knex-native") {
		return cfg.knex;
	}

	return {
		client: cfg.engine,
		connection: {
			...(cfg.engine === "mysql2" ? {jsonStrings: true} : {}),
			host: cfg.host,
			user: cfg.user,
			password: cfg.password,
			database: cfg.name,
			port: cfg.port,
			...(cfg.ssl ? { ssl: cfg.ssl } : {}),
		},
		migrations: {
			tableName: "migrations",
		},
	};
};

const getInstance = () => {
	if (!instance) {
		instance = knex(generateDbConfig());
	}
	return instance;
};

export default getInstance;
