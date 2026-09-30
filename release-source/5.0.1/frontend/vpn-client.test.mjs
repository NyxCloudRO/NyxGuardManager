import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const file = process.env.NYX_TASK2_VPN_ASSET || '/app/frontend/assets/vpn-client-4014.js';
const source = fs.readFileSync(file, 'utf8');
function section(start, end) {
  const a = source.indexOf(start);
  const b = source.indexOf(end, a);
  assert.ok(a >= 0 && b > a, `missing VPN source section: ${start}`);
  return source.slice(a, b);
}
const escapeHtml = (value) => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;');
function viewContext(currentData) {
  const context = { currentData, renaming: false, selectedId: null, adding: false, escapeHtml,
    fact: (label, value) => `${label}: ${value}`,
    stateLabel: (state) => state === 'disconnected' ? 'Disconnected' : 'Unknown',
    formatHandshake: () => 'No handshake yet', formatBytes: () => '0 B' };
  vm.createContext(context);
  vm.runInContext(section('function summaryMarkup(', 'function addFormMarkup(') +
    section('function detailMarkup(', 'function render('), context);
  return context;
}

test('initial null site renders a loading state without throwing', () => {
  const context = viewContext({ loaded: false, sites: [] });
  assert.match(vm.runInContext('detailMarkup(null, "")', context), /Loading VPN sites/);
});

test('API failure and loaded empty data show truthful states', () => {
  const failed = viewContext({ loaded: true, error: 'VPN service unavailable', sites: [] });
  assert.match(vm.runInContext('detailMarkup(null, "")', failed), /VPN service unavailable/);
  const empty = viewContext({ loaded: true, sites: [] });
  assert.match(vm.runInContext('detailMarkup(null, "")', empty), /Select a VPN site/);
});

test('populated disconnected site and partial site render safely', () => {
  const context = viewContext({ loaded: true, sites: [] });
  const site = { id: 'sample', name: 'Test site', state: 'disconnected', interface: 'wg-test',
    interfaceUp: false, allowedIps: ['10.0.0.0/24'], addresses: ['10.1.0.2/32'],
    endpoints: [], warnings: [] };
  context.site = site;
  assert.match(vm.runInContext('detailMarkup(site, "")', context), /Disconnected/);
  assert.match(vm.runInContext('detailMarkup(site, "")', context), /Test site/);
  context.site = { id: 'partial', name: 'Partial', state: 'disconnected', allowedIps: 'invalid', warnings: null };
  assert.match(vm.runInContext('detailMarkup(site, "")', context), /Partial/);
  context.currentData = { sites: [context.site] };
  assert.match(vm.runInContext('siteListMarkup()', context), /No routes/);
});

test('failed initial fetch renders error without an unhandled exception', async () => {
  const events = [];
  const context = { currentData: { loaded: false, sites: [], summary: {} },
    api: async () => { throw new Error('VPN API offline'); },
    render: () => events.push('render'), message: (_panel, text) => events.push(text) };
  vm.createContext(context);
  vm.runInContext(section('async function refresh(', 'async function runAction('), context);
  assert.equal(await context.refresh({}, false), null);
  assert.equal(context.currentData.loaded, true);
  assert.equal(context.currentData.error, 'VPN API offline');
  assert.deepEqual(events, ['render', 'VPN API offline']);
});

test('HTTP 200 Agent failure is unavailable rather than an empty site list', async () => {
  const events = [];
  const context = { currentData: { loaded: false, sites: [{ id: 'stale' }], summary: { total: 1 } },
    selectedId: 'stale', adding: false, renaming: false,
    api: async () => ({ agentAvailable: false, sites: [], summary: { total: 0 }, error: 'Agent offline' }),
    render: () => events.push('render'), message: (_panel, text) => events.push(text) };
  vm.createContext(context);
  vm.runInContext(section('async function refresh(', 'async function runAction('), context);
  assert.equal(await context.refresh({}, false), null);
  assert.equal(context.currentData.agentAvailable, false);
  assert.equal(context.currentData.sites.length, 0);
  assert.equal(context.selectedId, null);
  assert.equal(context.adding, false);
  const view = viewContext(context.currentData);
  assert.match(vm.runInContext('summaryMarkup()', view), /Unavailable/);
  assert.match(vm.runInContext('siteListMarkup()', view), /VPN sites unavailable/);
  assert.doesNotMatch(vm.runInContext('siteListMarkup()', view), /No VPN sites yet/);
  assert.deepEqual(events, ['render', 'VPN Agent unavailable. Refresh to retry.']);
});
