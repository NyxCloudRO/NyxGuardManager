import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validateIntegrity, validateSourceRuntimePreservation } from '../internal/database-integrity.mjs';

const baseline = () => ({
  format: 'nyxguard-database-integrity-v1', migrations: 43, migrationLocked: false,
  activeAdmins: 1, orphanAuth: 0, orphanPermissions: 0, defaultSetting: true,
  tables: Object.fromEntries(['migrations', 'migrations_lock', 'user', 'auth',
    'user_permission', 'setting', 'proxy_host', 'certificate', 'access_list',
    'nyxguard_settings', 'nyxguard_traffic_stat', 'nyxguard_traffic_state', 'audit_log',
    'additional_product_table'].map(name => [name, { schema: 'a'.repeat(64), rows: 'b'.repeat(64), count: 1 }])),
});

test('an identical application snapshot passes', () => validateIntegrity(baseline(), baseline()));
test('migration count cannot conceal each missing critical table', () => {
  for (const table of ['user', 'setting', 'proxy_host', 'nyxguard_traffic_stat']) {
    const broken = baseline(); delete broken.tables[table];
    assert.throws(() => validateIntegrity(broken, baseline()), /critical table/);
  }
});
test('every baseline table is covered beyond the critical minimum', () => {
  const broken = baseline(); delete broken.tables.additional_product_table;
  assert.throws(() => validateIntegrity(broken, baseline()), /table coverage/);
});
test('equal row counts cannot conceal changed or missing data', () => {
  const broken = baseline(); broken.tables.proxy_host.rows = 'c'.repeat(64);
  assert.throws(() => validateIntegrity(broken, baseline()), /proxy_host/);
});
test('changed column/index schema is rejected', () => {
  const broken = baseline(); broken.tables.auth.schema = 'c'.repeat(64);
  assert.throws(() => validateIntegrity(broken, baseline()), /auth/);
});
test('authentication, settings and migration-lock violations fail closed', () => {
  for (const [key, value] of [['activeAdmins', 0], ['orphanAuth', 1],
    ['orphanPermissions', 1], ['defaultSetting', false], ['migrationLocked', true]]) {
    const broken = baseline(); broken[key] = value;
    assert.throws(() => validateIntegrity(broken));
  }
});

test('running-source cursor advancement is allowed only after full restore validation',()=>{
 const actual=baseline();actual.tables.nyxguard_traffic_state.rows='c'.repeat(64);
 validateSourceRuntimePreservation(actual,baseline());
 assert.throws(()=>validateIntegrity(actual,baseline()),/nyxguard_traffic_state/);
 actual.tables.proxy_host.rows='d'.repeat(64);
 assert.throws(()=>validateSourceRuntimePreservation(actual,baseline()),/proxy_host/);
});
test('running-source validation retains every table and schema',()=>{
 const actual=baseline();delete actual.tables.additional_product_table;
 assert.throws(()=>validateSourceRuntimePreservation(actual,baseline()),/coverage/);
 const changed=baseline();changed.tables.nyxguard_traffic_state.schema='c'.repeat(64);
 assert.throws(()=>validateSourceRuntimePreservation(changed,baseline()),/schema/);
});
