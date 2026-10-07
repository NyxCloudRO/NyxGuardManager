import crypto from 'node:crypto';

// Verified against application models, startup setup and the public Aria schema.
// The complete baseline table inventory and column/index definitions are also
// captured dynamically, so this minimum list cannot conceal lost extra tables.
const criticalTables = [
  'migrations', 'migrations_lock', 'user', 'auth', 'user_permission',
  'setting', 'proxy_host', 'certificate', 'access_list', 'nyxguard_settings',
  'nyxguard_traffic_stat', 'nyxguard_traffic_state', 'audit_log',
];
const digest = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const identifier = value => {
  if (!/^[A-Za-z0-9_]+$/.test(value)) throw new Error('Unsupported database identifier');
  return `\`${value}\``;
};

// Forward migrations may add columns/indexes and append history. Existing
// identity, configuration and historical records must still be identifiable.
// Compare source columns directly in SQL; record values never enter logs.
export async function validateUpgradePreservation(connection, database, baseline) {
  const query = async (sql,args=[]) => (await connection.promise().query(sql,args))[0];
  const exact = ['user','auth','user_permission','setting','proxy_host','certificate','access_list',
    'access_list_auth','access_list_client','nyxguard_settings','nyxguard_traffic_stat'];
  const history = {audit_log:['id','created_on','action','object_type','object_id'],
    nyxguard_attack_event:['id','proxy_host_id','ip']};
  for(const table of [...exact,...Object.keys(history)]) {
    const columns=(await query('SELECT COLUMN_NAME AS name FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=? AND TABLE_NAME=? ORDER BY ORDINAL_POSITION',[baseline,table])).map(x=>x.name);
    if(!columns.length) continue;
    const primary=(await query("SELECT COLUMN_NAME AS name FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=? AND TABLE_NAME=? AND INDEX_NAME='PRIMARY' ORDER BY SEQ_IN_INDEX",[baseline,table])).map(x=>x.name);
    if(!primary.length) throw new Error(`Preservation requires primary identity: ${table}`);
    const chosen=history[table] ? history[table].filter(x=>columns.includes(x)) : columns;
    const same=chosen.map(c=>`n.${identifier(c)} <=> b.${identifier(c)}`).join(' AND ');
    const identity=primary.map(c=>`n.${identifier(c)} = b.${identifier(c)}`).join(' AND ');
    const [result]=await query(`SELECT COUNT(*) AS missing FROM ${identifier(baseline)}.${identifier(table)} b LEFT JOIN ${identifier(database)}.${identifier(table)} n ON ${identity} WHERE n.${identifier(primary[0])} IS NULL OR NOT (${same})`);
    if(Number(result.missing)!==0) throw new Error(`Upgrade lost or changed preserved application records: ${table}`);
  }
}

export function validateIntegrity(snapshot, baseline = null) {
  if (snapshot?.format !== 'nyxguard-database-integrity-v1' || !snapshot.tables ||
      ![42, 43, 45].includes(snapshot.migrations) || snapshot.migrationLocked !== false)
    throw new Error('Invalid application schema or migration state');
  for (const table of criticalTables) {
    const actual = snapshot.tables[table];
    if (!actual || !/^[a-f0-9]{64}$/.test(actual.schema) || !/^[a-f0-9]{64}$/.test(actual.rows) ||
        !Number.isSafeInteger(actual.count) || actual.count < 0)
      throw new Error(`Missing or invalid critical table: ${table}`);
  }
  // A fresh installation can legitimately be awaiting its setup wizard.
  if (!Number.isSafeInteger(snapshot.activeAdmins) || snapshot.activeAdmins < 0 ||
      (snapshot.tables.user.count > 0 && snapshot.activeAdmins < 1) ||
      snapshot.orphanAuth !== 0 || snapshot.orphanPermissions !== 0 || snapshot.defaultSetting !== true)
    throw new Error('Invalid authentication or settings prerequisites');
  if (!baseline) return;
  validateIntegrity(baseline);
  if (snapshot.migrations !== baseline.migrations ||
      JSON.stringify(Object.keys(snapshot.tables).sort()) !== JSON.stringify(Object.keys(baseline.tables).sort()))
    throw new Error('Restored application table coverage or migration identity differs');
  for (const [table, expected] of Object.entries(baseline.tables)) {
    const actual = snapshot.tables[table];
    if (actual.schema !== expected.schema || actual.count !== expected.count || actual.rows !== expected.rows)
      throw new Error(`Restored application integrity differs: ${table}`);
  }
}

// Restored quiesced data is checked in full before old startup. The running
// application legitimately advances traffic cursors and appends audit events;
// retain exact schema and stable identity/config/history-bucket fingerprints.
export function validateSourceRuntimePreservation(actual, baseline) {
  validateIntegrity(actual);validateIntegrity(baseline);
  if(actual.migrations!==baseline.migrations||JSON.stringify(Object.keys(actual.tables).sort())!==JSON.stringify(Object.keys(baseline.tables).sort()))
    throw new Error('Source runtime table coverage differs');
  for(const table of Object.keys(baseline.tables))if(actual.tables[table].schema!==baseline.tables[table].schema)
    throw new Error(`Source runtime schema differs: ${table}`);
  for(const table of ['user','auth','user_permission','setting','proxy_host','certificate','access_list','access_list_auth',
    'access_list_client','nyxguard_settings','nyxguard_traffic_stat']) {
    if(!baseline.tables[table])continue;
    if(actual.tables[table].count!==baseline.tables[table].count||actual.tables[table].rows!==baseline.tables[table].rows)
      throw new Error(`Source runtime lost or changed protected data: ${table}`);
  }
}

// connection is a mysql2 connection with dateStrings and supportBigNumbers
// enabled. Do not collect raw records in reports or manifests. Fingerprint rows
// as a multiset to avoid ordering/physical Aria-layout dependence and bounded
// memory consumption even for large traffic/history tables.
export async function captureIntegrity(connection, database) {
  const query = async (sql, args = []) => (await connection.promise().query(sql, args))[0];
  const inventory = await query(`SELECT TABLE_NAME AS name, ENGINE AS engine, TABLE_TYPE AS type
    FROM information_schema.TABLES WHERE TABLE_SCHEMA=? ORDER BY TABLE_NAME`, [database]);
  const tables = Object.create(null);
  for (const table of inventory) {
    if (table.type !== 'BASE TABLE' || table.engine !== 'Aria')
      throw new Error('Recovery requires the verified Aria base-table architecture');
    const columns = await query(`SELECT COLUMN_NAME, ORDINAL_POSITION, COLUMN_DEFAULT,
      IS_NULLABLE, COLUMN_TYPE, CHARACTER_SET_NAME, COLLATION_NAME, EXTRA
      FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=? AND TABLE_NAME=? ORDER BY ORDINAL_POSITION`, [database, table.name]);
    const indexes = await query(`SELECT INDEX_NAME, NON_UNIQUE, SEQ_IN_INDEX, COLUMN_NAME,
      COLLATION, SUB_PART, INDEX_TYPE FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA=? AND TABLE_NAME=? ORDER BY INDEX_NAME, SEQ_IN_INDEX`, [database, table.name]);
    let count = 0, sum = 0n;
    for await (const row of connection.query(`SELECT * FROM ${identifier(database)}.${identifier(table.name)}`)
      .stream({ highWaterMark: 32 })) {
      const values = columns.map(column => row[column.COLUMN_NAME]);
      sum = BigInt.asUintN(256, sum + BigInt(`0x${digest(values)}`));
      count++;
    }
    tables[table.name] = { schema: digest({ engine: table.engine, columns, indexes }),
      count, rows: sum.toString(16).padStart(64, '0') };
  }
  const db = identifier(database);
  const scalar = async sql => Object.values((await query(sql))[0])[0];
  const snapshot = {
    format: 'nyxguard-database-integrity-v1', tables,
    migrations: Number(await scalar(`SELECT COUNT(*) FROM ${db}.migrations`)),
    migrationLocked: Number(await scalar(`SELECT COALESCE(MAX(is_locked),1) FROM ${db}.migrations_lock`)) !== 0,
    activeAdmins: Number(await scalar(`SELECT COUNT(*) FROM ${db}.user u WHERE u.is_deleted=0
      AND JSON_CONTAINS(u.roles, '"admin"') AND EXISTS (SELECT 1 FROM ${db}.auth a
      WHERE a.user_id=u.id AND a.type='password' AND LENGTH(a.secret)>0)`)),
    orphanAuth: Number(await scalar(`SELECT COUNT(*) FROM ${db}.auth a LEFT JOIN ${db}.user u ON u.id=a.user_id WHERE u.id IS NULL`)),
    orphanPermissions: Number(await scalar(`SELECT COUNT(*) FROM ${db}.user_permission p LEFT JOIN ${db}.user u ON u.id=p.user_id WHERE u.id IS NULL`)),
    defaultSetting: Number(await scalar(`SELECT COUNT(*) FROM ${db}.setting WHERE id='default-site'`)) === 1,
  };
  validateIntegrity(snapshot);
  return snapshot;
}
