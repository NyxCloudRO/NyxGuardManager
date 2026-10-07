import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs/promises';
import vm from 'node:vm';

// Run against the patched, verified public prerequisite. This checks startup
// ordering with controlled dependencies; it is not whole-image acceptance.
const sourceRoot = process.env.NYXGUARD_PATCHED_SOURCE;
if (!sourceRoot) throw new Error('NYXGUARD_PATCHED_SOURCE is required');
const source = await fs.readFile(`${sourceRoot}/index.js`, 'utf8');

test('a stalled optional refresh starts after offline config and listener', async () => {
  const calls = [];
  const context = vm.createContext({
    process: { env: {}, pid: 1, on() {}, exit() {} }, setTimeout, clearTimeout,
  });
  const logger = { info() {}, warn() {}, error() {}, fatal() {} };
  const timer = { initTimer: () => calls.push('timer') };
  const deps = {
    './app.js': { default: { listen: (_port, ready) => {
      calls.push('listen'); ready(); return { close() {} };
    } } },
    './db.js': { default: () => ({}) },
    './internal/nyxguard.js': { default: { nginx: { apply: async () => calls.push('nginx') } } },
    './internal/ip_ranges.js': { default: {
      ...timer,
      prepareOffline: async () => calls.push('offline'),
      fetch: () => { calls.push('fetch'); return new Promise(() => {}); },
    } },
    './internal/update-manager.js': { default: { initTimer: async () => calls.push('updates') } },
    './logger.js': { global: logger },
    './migrate.js': { migrateUp: async () => calls.push('migrations') },
    './schema/index.js': { getCompiledSchema: async () => calls.push('schema') },
    './setup.js': { default: async () => calls.push('setup'), setupExternal: async()=>calls.push('external') },
    './internal/readiness.mjs': { markInitialized:()=>calls.push('initialized') },
    './internal/readiness-policy.mjs': { policy:{startupDeadlineMs:120000} },
  };
  const entry = new vm.SourceTextModule(source, { context });
  await entry.link(async name => {
    const exports = deps[name] || { default: timer };
    return new vm.SyntheticModule(Object.keys(exports), function () {
      for (const [key, value] of Object.entries(exports)) this.setExport(key, value);
    }, { context });
  });
  await entry.evaluate();
  await new Promise(resolve => setImmediate(resolve));
  assert.ok(calls.includes('listen'), 'startup must finish while refresh remains stalled');
  assert.ok(calls.indexOf('offline') < calls.indexOf('listen'));
  assert.ok(calls.indexOf('listen') < calls.indexOf('fetch'));
  assert.ok(calls.indexOf('listen') < calls.indexOf('external'));
});
