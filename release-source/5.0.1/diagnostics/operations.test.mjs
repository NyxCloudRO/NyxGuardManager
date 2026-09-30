import assert from 'node:assert/strict';
import test from 'node:test';
import { operationalSnapshot } from './operations.mjs';
import { buildSupportBundle } from './bundle.mjs';
import { redact } from '../../5.0.0/professional-support/redaction.mjs';

const base = { version: '5.0.1-dev', revision: 'a'.repeat(40), uptimeSeconds: 120,
  databaseReachable: true, migrationsCurrent: true, appliedMigrations: 42, expectedMigrations: 42,
  updateStatus: { current: '5.0.1-dev', stage: 'success', downloadedVersion: null,
    pendingVersion: null, restartPending: false, recoveryRequired: false, recoveryCleanupPending: null },
  manager: { id: 'manager-id', running: true, health: 'healthy' },
  vpn: { id: 'vpn-id', running: true, health: 'healthy', networkMode: 'container:manager-id' },
  vpnReachable: true };

test('operational diagnostics preserve runtime, database, update, and VPN truth', async () => {
  const actual = await operationalSnapshot(base);
  assert.equal(actual.manager.version, '5.0.1-dev');
  assert.equal(actual.manager.health, 'healthy');
  assert.equal(actual.manager.uptimeScope, 'manager_process');
  assert.deepEqual([actual.database.appliedMigrations, actual.database.expectedMigrations], [42, 42]);
  assert.equal(actual.update.stage, 'success');
  assert.equal(actual.update.interventionRequired, false);
  assert.equal(actual.vpn.topology, 'manager_namespace');
  assert.equal(JSON.stringify(redact(actual)), JSON.stringify(actual));
});

test('missing VPN and unavailable sources remain distinct', async () => {
  const absent = await operationalSnapshot({ ...base, vpn: { missing: true } });
  assert.deepEqual(absent.vpn, { installed: false, health: 'not_installed', topology: 'not_installed' });
  const unknown = await operationalSnapshot({ ...base, vpn: null, manager: null, updateStatus: null,
    databaseReachable: false, appliedMigrations: null, expectedMigrations: null });
  assert.deepEqual(unknown.vpn, { installed: null, health: 'unknown', topology: 'unknown' });
  assert.equal(unknown.update.stage, 'unavailable');
  assert.equal(unknown.database.appliedMigrations, null);
});

test('unexpected VPN namespace and recovery state are visible without identifiers', async () => {
  const actual = await operationalSnapshot({ ...base,
    updateStatus: { ...base.updateStatus, stage: 'recovery_required', recoveryRequired: true },
    vpn: { ...base.vpn, networkMode: 'bridge' } });
  assert.equal(actual.vpn.topology, 'unexpected');
  assert.equal(actual.update.interventionRequired, true);
  assert.equal(JSON.stringify(actual).includes('vpn-id'), false);
});

test('running Agent in a stale network namespace is unavailable', async () => {
  const actual = await operationalSnapshot({ ...base, vpnReachable: false });
  assert.equal(actual.vpn.installed, true);
  assert.equal(actual.vpn.health, 'unavailable');
  assert.equal(actual.vpn.topology, 'agent_unreachable');
  const absent = await operationalSnapshot({ ...base, vpn: { missing: true }, vpnReachable: false });
  assert.equal(absent.vpn.health, 'not_installed');
});

test('support bundle keeps the development version and rejects secret fields', () => {
  const { bundle, bytes } = buildSupportBundle({ version: '5.0.1-dev',
    buildRevision: 'b'.repeat(40), installationId: '123e4567-e89b-42d3-a456-426614174000',
    now: new Date(), systemSnapshot: { uptimeSeconds: 120, databasePassword: 'synthetic-never-export' },
    system: [{ check: 'uptime', state: 'PASS', evidence: { seconds: 120 } }] });
  assert.equal(bundle.application.version, '5.0.1-dev');
  assert.equal(bundle.application.revision, 'b'.repeat(40));
  assert.equal(bundle.system_snapshot.uptime_seconds, 120);
  assert.equal(bundle.system_snapshot.uptime_scope, 'manager_process');
  assert.equal(bundle.diagnostics.system[0].reason, 'Manager process uptime was observed.');
  assert.equal(bytes.includes('synthetic-never-export'), false);
});
