import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import mysql from 'mysql2';
import { captureIntegrity, validateIntegrity } from '../internal/database-integrity.mjs';
import { prepareDatabaseSnapshot, commitDatabaseSnapshot, undoDatabaseSwitch } from '../internal/recovery-database.mjs';
import { docker, runSqlHelper, sqlProgress } from '../internal/recovery-docker.mjs';

process.umask(0o077);
const dbId = process.env.NYXGUARD_TEST_DB;
const inspected = await docker('GET', `/containers/${dbId}/json`);
if (inspected.Config.Labels?.['nyxguard.test.purpose'] !== 'main1-recovery')
  throw new Error('Integration tests require an explicitly disposable recovery DB');
const database = process.env.MYSQL_DATABASE;
const connection = mysql.createConnection({ host: '127.0.0.1', user: 'root',
  password: process.env.MYSQL_ROOT_PASSWORD, database, dateStrings: true,
  supportBigNumbers: true, bigNumberStrings: true, connectTimeout: 5000 });
const results = [];
const receiptPrefix=process.env.NYXGUARD_TEST_RECEIPT_PREFIX||'database-proof';
if(!/^[A-Za-z0-9_-]+$/.test(receiptPrefix))throw new Error('Unsafe receipt prefix');
const query = async (sql, args=[]) => (await connection.promise().query(sql,args))[0];
const baseline = await captureIntegrity(connection, database);
const source = await fs.readFile('/proof/synthetic-original.sql', 'utf8');

async function importer({ database: stage, user, password }, suffix = '', idleMs = 300000) {
  const file = `import-${crypto.randomBytes(8).toString('hex')}.sql`;
  await fs.writeFile(`/proof/${file}`, source + '\n' + suffix, { mode: 0o600 });
  await runSqlHelper({ image: inspected.Image, dbId, recoveryId: 'main1-proof',
    env: [`MYSQL_PWD=${password}`, `STAGE_USER=${user}`, `STAGE_DATABASE=${stage}`],
    script: `exec mariadb -h 127.0.0.1 -u "$STAGE_USER" "$STAGE_DATABASE" < /proof/${file}`,
    binds: [`${process.env.NYXGUARD_TEST_EVIDENCE_HOST}:/proof:ro`], idleMs,
    progress: sqlProgress(connection,stage,user),
  });
}

async function scenario(name, fn) {
  const started = Date.now();
  await fn();
  const result = { name, result: 'PASS', elapsedMs: Date.now()-started };
  results.push(result); console.log(JSON.stringify(result));
  await fs.writeFile(`/proof/${receiptPrefix}${process.env.NYXGUARD_TEST_ONLY_SLOW === '1' ? '-slow' : ''}-results.json`, JSON.stringify(results, null, 2), { mode: 0o600 });
}

try {
  if (process.env.NYXGUARD_TEST_ONLY_SLOW !== '1') {
  await scenario('R1 validated full-schema restore and atomic switch', async () => {
    const snapshot = await prepareDatabaseSnapshot(connection, database, baseline, importer);
    await query("UPDATE setting SET value='candidate-write' WHERE id='default-site'");
    await commitDatabaseSnapshot(connection, database, snapshot);
    validateIntegrity(await captureIntegrity(connection, database), baseline);
    assert.equal((await query(`SELECT value FROM \`${snapshot.quarantine}\`.setting WHERE id='default-site'`))[0].value, 'candidate-write');
    // Exercise the reverse atomic operation and prove the original validated
    // rollback copy remains intact. Then restore the baseline for further cases.
    await undoDatabaseSwitch(connection, database, snapshot);
    validateIntegrity(await captureIntegrity(connection, snapshot.stage), baseline);
    await commitDatabaseSnapshot(connection, database, snapshot);
  });
  await scenario('R2 non-zero import cannot drop live schema', async () => {
    await assert.rejects(prepareDatabaseSnapshot(connection, database, baseline,
      credentials => importer(credentials, `DROP DATABASE \`${database}\`;`)), /Staged restore rejected/);
    validateIntegrity(await captureIntegrity(connection, database), baseline);
  });
  await scenario('R5 checksum-valid application-invalid restore rejected', async () => {
    await assert.rejects(prepareDatabaseSnapshot(connection, database, baseline,
      credentials => importer(credentials, "UPDATE setting SET value='invalid-data' WHERE id='default-site';")), /Staged restore rejected/);
    validateIntegrity(await captureIntegrity(connection, database), baseline);
  });
  await scenario('R6 migration history cannot conceal missing critical tables', async () => {
    await assert.rejects(prepareDatabaseSnapshot(connection, database, baseline,
      credentials => importer(credentials, 'DROP TABLE user, setting, proxy_host, nyxguard_traffic_stat;')), /Staged restore rejected/);
    validateIntegrity(await captureIntegrity(connection, database), baseline);
  });
  await scenario('R7 rejected switch preserves live and staged states', async () => {
    const snapshot = await prepareDatabaseSnapshot(connection, database, baseline, importer);
    await query(`CREATE DATABASE \`${snapshot.quarantine}\``);
    await query(`CREATE TABLE \`${snapshot.quarantine}\`.occupied (id INT) ENGINE=Aria`);
    await assert.rejects(commitDatabaseSnapshot(connection, database, snapshot), /quarantine/);
    validateIntegrity(await captureIntegrity(connection, database), baseline);
    validateIntegrity(await captureIntegrity(connection, snapshot.stage), baseline);
  });
  await scenario('R10 repeated attempt after failures uses a new isolated stage', async () => {
    const snapshot = await prepareDatabaseSnapshot(connection, database, baseline, importer);
    await commitDatabaseSnapshot(connection, database, snapshot);
    validateIntegrity(await captureIntegrity(connection, database), baseline);
  });
  }
  if (process.env.NYXGUARD_TEST_SLOW === '1') {
    await scenario('R3 stalled import exceeds incident window and fails without live changes', async () => {
      await assert.rejects(prepareDatabaseSnapshot(connection, database, baseline,
        credentials => importer(credentials, 'DO SLEEP(200);', 130000)), /Staged restore rejected/);
      validateIntegrity(await captureIntegrity(connection, database), baseline);
    });
    await scenario('R4 progressing import exceeds incident window and completes', async () => {
      const snapshot = await prepareDatabaseSnapshot(connection, database, baseline,
        credentials => importer(credentials, 'DO SLEEP(45) /* step one */; DO SLEEP(45) /* step two */; DO SLEEP(45) /* step three */;', 130000));
      validateIntegrity(await captureIntegrity(connection, snapshot.stage), baseline);
      validateIntegrity(await captureIntegrity(connection, database), baseline);
    });
  }
} finally {
  await connection.promise().end();
}
