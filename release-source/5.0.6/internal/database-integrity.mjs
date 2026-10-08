import releasePolicy from './release-policy.mjs';
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
  const excluded=new Set(['migrations','migrations_lock','audit_log','nyxguard_attack_event','web_threat_events','nyxguard_traffic_stat','nyxguard_traffic_state','nyxcloud_license_state','nyxguard_attack_state']);
  const exact=(await query('SELECT TABLE_NAME AS name FROM information_schema.TABLES WHERE TABLE_SCHEMA=?',[baseline])).map(x=>x.name).filter(name=>!excluded.has(name));
  const history = {audit_log:['id','created_on','action','object_type','object_id'],
    nyxguard_attack_event:['id','proxy_host_id','ip'],nyxguard_attack_state:['id','log_path']};
  for(const table of [...exact,...Object.keys(history)]) {
    if(exact.includes(table)){
      const [before]=await query(`SELECT COUNT(*) AS n FROM ${identifier(baseline)}.${identifier(table)}`);
      const [after]=await query(`SELECT COUNT(*) AS n FROM ${identifier(database)}.${identifier(table)}`);
      if(Number(before.n)!==Number(after.n))throw new Error(`Upgrade changed operational record coverage: ${table}`);
    }
    const columns=(await query('SELECT COLUMN_NAME AS name FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=? AND TABLE_NAME=? ORDER BY ORDINAL_POSITION',[baseline,table])).map(x=>x.name);
    if(!columns.length) continue;
    const primary=(await query("SELECT COLUMN_NAME AS name FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=? AND TABLE_NAME=? AND INDEX_NAME='PRIMARY' ORDER BY SEQ_IN_INDEX",[baseline,table])).map(x=>x.name);
    if(!primary.length) {
      const [oldCount]=await query(`SELECT COUNT(*) AS n FROM ${identifier(baseline)}.${identifier(table)}`);
      const [newCount]=await query(`SELECT COUNT(*) AS n FROM ${identifier(database)}.${identifier(table)}`);
      if(Number(oldCount.n)===0&&Number(newCount.n)===0)continue;
      throw new Error(`Preservation requires primary identity: ${table}`);
    }
    const chosen=history[table] ? history[table].filter(x=>columns.includes(x)) : columns;
    const same=chosen.map(c=>`n.${identifier(c)} <=> b.${identifier(c)}`).join(' AND ');
    const identity=primary.map(c=>`n.${identifier(c)} = b.${identifier(c)}`).join(' AND ');
    const [result]=await query(`SELECT COUNT(*) AS missing FROM ${identifier(baseline)}.${identifier(table)} b LEFT JOIN ${identifier(database)}.${identifier(table)} n ON ${identity} WHERE n.${identifier(primary[0])} IS NULL OR NOT (${same})`);
    if(Number(result.missing)!==0) throw new Error(`Upgrade lost or changed preserved application records: ${table}`);
  }
  const [lostHistory]=await query(`SELECT COUNT(*) AS n FROM ${identifier(baseline)}.web_threat_events b LEFT JOIN ${identifier(database)}.web_threat_events n ON n.id=b.id LEFT JOIN ${identifier(database)}.nyxguard_attack_event a ON a.legacy_web_threat_id=b.id WHERE n.id IS NULL AND NOT(b.category='inbound' AND b.rule_id IN ('inbound.bot','inbound.sqli','inbound.ddos','inbound.authfail') AND JSON_VALID(b.meta) AND JSON_UNQUOTE(JSON_EXTRACT(b.meta,'$.source'))='nyxguard_attack_monitor' AND a.id IS NOT NULL AND a.ip<=>b.src_ip AND a.created_on<=>b.ts)`);
  if(Number(lostHistory.n))throw new Error('Upgrade lost original threat history');
  await validateTelemetry(connection,database,baseline);
}

export function validateIntegrity(snapshot, baseline = null) {
  if (snapshot?.format !== 'nyxguard-database-integrity-v1' || !snapshot.tables ||
      !new Set(Object.values(releasePolicy.sources)).has(snapshot.migrations) || snapshot.migrationLocked !== false)
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
  const volatile=new Set(['audit_log','nyxguard_attack_event','web_threat_events','nyxguard_traffic_state','nyxguard_traffic_stat','nyxcloud_license_state','nyxguard_attack_state']);
  for(const table of Object.keys(baseline.tables).filter(name=>!volatile.has(name))){
    if(actual.tables[table].count!==baseline.tables[table].count||actual.tables[table].rows!==baseline.tables[table].rows)throw new Error(`Source runtime lost or changed protected data: ${table}`);
  }
  const a=actual.tables.nyxguard_attack_state,b=baseline.tables.nyxguard_attack_state;
  if(a&&b&&(a.count!==b.count||a.stableRows!==b.stableRows))throw new Error('Attack log cursor identity changed');
  for(const table of Object.keys(baseline.history||{})){
    if(actual.history?.[table]?.count!==baseline.history[table].count||actual.history?.[table]?.rows!==baseline.history[table].rows)throw new Error('Restored original audit or attack history changed');
  }
}

// connection is a mysql2 connection with dateStrings and supportBigNumbers
// enabled. Do not collect raw records in reports or manifests. Fingerprint rows
// as a multiset to avoid ordering/physical Aria-layout dependence and bounded
// memory consumption even for large traffic/history tables.
export async function captureIntegrity(connection, database, historyLimits={}) {
  const query = async (sql, args = []) => (await connection.promise().query(sql, args))[0];
  const inventory = await query(`SELECT TABLE_NAME AS name, ENGINE AS engine, TABLE_TYPE AS type
    FROM information_schema.TABLES WHERE TABLE_SCHEMA=? ORDER BY TABLE_NAME`, [database]);
  const tables = Object.create(null),history=Object.create(null);
  const historyColumns={audit_log:['id','created_on','action','object_type','object_id'],nyxguard_attack_event:['id','proxy_host_id','ip']};
  for (const table of inventory) {
    if (table.type !== 'BASE TABLE' || table.engine !== 'Aria')
      throw new Error('Recovery requires the verified Aria base-table architecture');
    const columns = await query(`SELECT COLUMN_NAME, ORDINAL_POSITION, COLUMN_DEFAULT,
      IS_NULLABLE, COLUMN_TYPE, CHARACTER_SET_NAME, COLLATION_NAME, EXTRA
      FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=? AND TABLE_NAME=? ORDER BY ORDINAL_POSITION`, [database, table.name]);
    const indexes = await query(`SELECT INDEX_NAME, NON_UNIQUE, SEQ_IN_INDEX, COLUMN_NAME,
      COLLATION, SUB_PART, INDEX_TYPE FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA=? AND TABLE_NAME=? ORDER BY INDEX_NAME, SEQ_IN_INDEX`, [database, table.name]);
    let count = 0, sum = 0n, stableSum=0n, historySum=0n,historyCount=0,historyMax=0;
    for await (const row of connection.query(`SELECT * FROM ${identifier(database)}.${identifier(table.name)}`)
      .stream({ highWaterMark: 32 })) {
      const values = columns.map(column => row[column.COLUMN_NAME]);
      sum = BigInt.asUintN(256, sum + BigInt(`0x${digest(values)}`));
      if(historyColumns[table.name]&&Number(row.id)<=(historyLimits[table.name]??Number.MAX_SAFE_INTEGER)){historySum=BigInt.asUintN(256,historySum+BigInt(`0x${digest(historyColumns[table.name].map(c=>row[c]))}`));historyCount++;historyMax=Math.max(historyMax,Number(row.id));}
      if(table.name==='nyxguard_attack_state')stableSum=BigInt.asUintN(256,stableSum+BigInt(`0x${digest([row.id,row.log_path])}`));
      count++;
    }
    if(historyColumns[table.name])history[table.name]={max:historyLimits[table.name]??historyMax,count:historyCount,rows:historySum.toString(16).padStart(64,'0')};
    tables[table.name] = { schema: digest({ engine: table.engine, columns, indexes }),
      count, rows: sum.toString(16).padStart(64, '0'),...(table.name==='nyxguard_attack_state'?{stableRows:stableSum.toString(16).padStart(64,'0')}:{}) };
  }
  const [invalidCursor]=await query(`SELECT COUNT(*) AS n FROM ${identifier(database)}.nyxguard_attack_state WHERE inode<0 OR ${identifier('offset')}<0 OR log_path NOT LIKE '/data/%'`);
  if(Number(invalidCursor.n))throw new Error('Attack monitor cursor invalid or outside protected data');
  await validateTelemetry(connection,database);
  const db = identifier(database);
  const scalar = async sql => Object.values((await query(sql))[0])[0];
  const snapshot = {
    format: 'nyxguard-database-integrity-v1', tables,history,
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

// Only the reviewed five-minute traffic counter table is volatile. A cold
// backup/restore still compares its exact bytes; a running runtime permits
// expired buckets and monotonic increments, never corruption or changed identity.
export async function validateTelemetry(connection,database,baseline=null){
  const query=async(sql,args=[]) => (await connection.promise().query(sql,args))[0];
  const table=identifier(database)+'.nyxguard_traffic_stat';
  const columns=(await query('SELECT COLUMN_NAME AS name FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=? AND TABLE_NAME=? ORDER BY ORDINAL_POSITION',[database,'nyxguard_traffic_stat'])).map(x=>x.name);
  if(JSON.stringify(columns)!==JSON.stringify(['id','proxy_host_id','bucket','requests','bytes_in','bytes_out','status_2xx','status_3xx','status_4xx','status_5xx']))throw new Error('Traffic telemetry schema changed; review dependencies before accepting volatility');
  const deps=await query("SELECT CONSTRAINT_NAME FROM information_schema.KEY_COLUMN_USAGE WHERE (TABLE_SCHEMA=? AND TABLE_NAME='nyxguard_traffic_stat' AND REFERENCED_TABLE_NAME IS NOT NULL) OR (REFERENCED_TABLE_SCHEMA=? AND REFERENCED_TABLE_NAME='nyxguard_traffic_stat')",[database,database]);
  if(deps.length)throw new Error('Traffic telemetry has operational dependencies');
  const checks=await query('CHECK TABLE '+table);
  if(!checks.some(x=>x.Msg_type==='status'&&x.Msg_text==='OK'))throw new Error('Traffic telemetry table corruption');
  const metrics=['requests','bytes_in','bytes_out','status_2xx','status_3xx','status_4xx','status_5xx'];
  const [invalid]=await query(`SELECT COUNT(*) AS n FROM ${table} WHERE ${metrics.map(x=>identifier(x)+'<0').join(' OR ')} OR status_2xx+status_3xx+status_4xx+status_5xx>requests OR MOD(UNIX_TIMESTAMP(bucket),300)<>0 OR bucket>UTC_TIMESTAMP()+INTERVAL 1 DAY`);
  if(Number(invalid.n))throw new Error('Traffic telemetry counters or bucket timestamps invalid');
  if(baseline){
    // Bind the same Date cutoff as the actual traffic monitor/driver, including
    // deployments whose local timezone differs from their TZ environment.
    const cutoff=new Date(Date.now()-90*24*60*60*1000);
    const [bad]=await query(`SELECT COUNT(*) AS n FROM ${identifier(baseline)}.nyxguard_traffic_stat b LEFT JOIN ${table} n ON n.id=b.id WHERE (n.id IS NULL AND b.bucket>=?) OR (n.id IS NOT NULL AND (NOT(n.proxy_host_id<=>b.proxy_host_id) OR NOT(n.bucket<=>b.bucket) OR ${metrics.map(x=>'n.'+identifier(x)+'<b.'+identifier(x)).join(' OR ')}))`,[cutoff]);
    if(Number(bad.n))throw new Error('Traffic telemetry changed outside retention or live counter increments');
  }
}
