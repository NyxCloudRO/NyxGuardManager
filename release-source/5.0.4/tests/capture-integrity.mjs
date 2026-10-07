import fs from 'node:fs/promises';
import mysql from 'mysql2';
import { captureIntegrity } from '../internal/database-integrity.mjs';

process.umask(0o077);
const connection = mysql.createConnection({
  host: '127.0.0.1', user: 'root', password: process.env.MYSQL_ROOT_PASSWORD,
  database: process.env.MYSQL_DATABASE, dateStrings: true,
  supportBigNumbers: true, bigNumberStrings: true, connectTimeout: 5000,
});
try {
  const snapshot = await captureIntegrity(connection, process.env.MYSQL_DATABASE);
  if (process.env.NYXGUARD_INTEGRITY_OUTPUT)
    await fs.writeFile(process.env.NYXGUARD_INTEGRITY_OUTPUT, JSON.stringify(snapshot), { mode: 0o600 });
  console.log(JSON.stringify({ tables: Object.keys(snapshot.tables).length,
    migrations: snapshot.migrations, migrationLocked: snapshot.migrationLocked,
    activeAdmins: snapshot.activeAdmins, authenticationAndSettingsValid: true }));
} finally {
  await connection.promise().end();
}
