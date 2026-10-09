import crypto from 'node:crypto';
import { captureIntegrity, validateIntegrity } from './database-integrity.mjs';

export function sqlIdentifier(value) {
  if (!/^[A-Za-z0-9_]{1,64}$/.test(value)) throw new Error('Unsafe recovery database identifier');
  return `\`${value}\``;
}
const query = async (connection, sql, args = []) => (await connection.promise().query(sql, args))[0];

export async function assertAtomicArchitecture(connection, database) {
  sqlIdentifier(database);
  const [{ version }] = await query(connection, 'SELECT VERSION() AS version');
  const match = /^(\d+)\.(\d+)\.(\d+).*MariaDB/.exec(version);
  if (!match || Number(match[1]) < 10 || (Number(match[1]) === 10 &&
    (Number(match[2]) < 6 || (Number(match[2]) === 6 && Number(match[3]) < 1))))
    throw new Error('Atomic Aria recovery requires MariaDB >= 10.6.1');
  const unsupported = await query(connection, `SELECT TABLE_NAME FROM information_schema.TABLES
    WHERE TABLE_SCHEMA=? AND (TABLE_TYPE<>'BASE TABLE' OR ENGINE<>'Aria')`, [database]);
  const objects = await query(connection, `SELECT TRIGGER_NAME AS name FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=?
    UNION ALL SELECT ROUTINE_NAME FROM information_schema.ROUTINES WHERE ROUTINE_SCHEMA=?
    UNION ALL SELECT EVENT_NAME FROM information_schema.EVENTS WHERE EVENT_SCHEMA=?`, [database, database, database]);
  if (unsupported.length || objects.length)
    throw new Error('Recovery requires Aria base tables without triggers, routines, events or views');
}

export async function tableNames(connection, database) {
  const rows = await query(connection, 'SELECT TABLE_NAME AS name FROM information_schema.TABLES WHERE TABLE_SCHEMA=? ORDER BY TABLE_NAME', [database]);
  return rows.map(row => { sqlIdentifier(row.name); return row.name; });
}

// The importer receives credentials with privileges ONLY on the new schema.
// It never receives root credentials or privileges on the installed database.
// Failed imports remove only their newly allocated schema; no live DDL runs.
export async function prepareDatabaseSnapshot(connection, database, expected, importSql) {
  await assertAtomicArchitecture(connection, database);
  validateIntegrity(expected);
  const suffix = crypto.randomBytes(12).toString('hex');
  const stage = `nyx_stage_${suffix}`, user = `nyx_import_${suffix}`;
  const password = crypto.randomBytes(32).toString('hex');
  const [{ charset, collation }] = await query(connection, `SELECT DEFAULT_CHARACTER_SET_NAME AS charset,
    DEFAULT_COLLATION_NAME AS collation FROM information_schema.SCHEMATA WHERE SCHEMA_NAME=?`, [database]);
  await query(connection, `CREATE DATABASE ${sqlIdentifier(stage)} CHARACTER SET ${sqlIdentifier(charset)} COLLATE ${sqlIdentifier(collation)}`);
  let verified = false;
  try {
    await query(connection, 'CREATE USER ?@\'%\' IDENTIFIED BY ?', [user, password]);
    await query(connection, `GRANT ALL PRIVILEGES ON ${sqlIdentifier(stage)}.* TO ?@'%'`, [user]);
    await importSql({ database: stage, user, password });
    await assertAtomicArchitecture(connection, stage);
    validateIntegrity(await captureIntegrity(connection, stage), expected);
    verified = true;
    return { stage, quarantine: `nyx_prior_${suffix}`, expected };
  } catch (error) {
    // Error text excludes SQL/client output, which can contain record values.
    throw new Error(`Staged restore rejected; live database unchanged (${stage})`, { cause: error });
  } finally {
    const sessions = await query(connection, 'SELECT ID FROM information_schema.PROCESSLIST WHERE USER=?', [user]);
    for (const { ID } of sessions) {
      if (!Number.isSafeInteger(Number(ID))) throw new Error('Invalid import connection ID');
      await query(connection, `KILL CONNECTION ${Number(ID)}`).catch(() => undefined);
    }
    await query(connection, 'DROP USER IF EXISTS ?@\'%\'', [user]);
    if (!verified) await query(connection, `DROP DATABASE IF EXISTS ${sqlIdentifier(stage)}`);
  }
}

export async function commitDatabaseSnapshot(connection, database, snapshot) {
  await assertAtomicArchitecture(connection, database);
  await assertAtomicArchitecture(connection, snapshot.stage);
  validateIntegrity(await captureIntegrity(connection, snapshot.stage), snapshot.expected);
  const live = await tableNames(connection, database);
  if ((await tableNames(connection, snapshot.quarantine)).length)
    throw new Error('Recovery quarantine is already populated; resume validation required');
  await query(connection, `CREATE DATABASE IF NOT EXISTS ${sqlIdentifier(snapshot.quarantine)}`);
  const moves = [
    ...live.map(name => `${sqlIdentifier(database)}.${sqlIdentifier(name)} TO ${sqlIdentifier(snapshot.quarantine)}.${sqlIdentifier(name)}`),
    ...Object.keys(snapshot.expected.tables).sort().map(name => `${sqlIdentifier(snapshot.stage)}.${sqlIdentifier(name)} TO ${sqlIdentifier(database)}.${sqlIdentifier(name)}`),
  ];
  // ONE crash-atomic Aria DDL statement, not a loop of DROP/CREATE/import.
  await query(connection, `RENAME TABLE ${moves.join(', ')}`);
  validateIntegrity(await captureIntegrity(connection, database), snapshot.expected);
}

export async function undoDatabaseSwitch(connection, database, snapshot) {
  if ((await tableNames(connection, snapshot.stage)).length)
    throw new Error('Cannot undo database switch into a populated staging schema');
  const live = await tableNames(connection, database);
  const previous = await tableNames(connection, snapshot.quarantine);
  if (!previous.length) throw new Error('Previous database is not present in quarantine');
  await assertAtomicArchitecture(connection, database);
  await assertAtomicArchitecture(connection, snapshot.quarantine);
  await query(connection, `RENAME TABLE ${[
    ...live.map(name => `${sqlIdentifier(database)}.${sqlIdentifier(name)} TO ${sqlIdentifier(snapshot.stage)}.${sqlIdentifier(name)}`),
    ...previous.map(name => `${sqlIdentifier(snapshot.quarantine)}.${sqlIdentifier(name)} TO ${sqlIdentifier(database)}.${sqlIdentifier(name)}`),
  ].join(', ')}`);
}
