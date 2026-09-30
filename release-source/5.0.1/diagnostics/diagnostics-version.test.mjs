import assert from 'node:assert/strict';
import test from 'node:test';
import { systemDiagnostics } from './diagnostics.mjs';

test('development version is a valid observed application version', () => {
  const check = systemDiagnostics({ version: '5.0.1-dev' }).find((item) => item.check === 'application_version');
  assert.equal(check.state, 'PASS');
});

test('unavailable or malformed versions remain unverified', () => {
  for (const version of [undefined, '', 'latest', '5.0.1-dev-secret']) {
    const check = systemDiagnostics({ version }).find((item) => item.check === 'application_version');
    assert.equal(check.state, 'SKIPPED');
  }
});
