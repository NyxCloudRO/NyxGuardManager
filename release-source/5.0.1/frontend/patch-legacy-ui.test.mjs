import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const script = fileURLToPath(new URL('./patch-legacy-ui.mjs', import.meta.url));
const mainName = 'index-CTHAIRmi-409dev-4012certfix4-threatpagination3.js';
const certName = 'index-BfJf9XXp-4012certfix4.js';
const vpnName = 'vpn-client-4014.js';
const vpnBefore = [
  'var summary = currentData.summary || {};\n\t\treturn \'<span><strong>\' + Number(summary.connected || 0) + \'</strong> connected</span><span><strong>\' + Number(summary.total || 0) + \'</strong> configured</span>\';',
  'if (!sites.length) return \'<div class="nyx-vpn-empty-list"><span>No VPN sites yet</span><small>Add a client profile to begin.</small></div>\';',
  'var route = (site.allowedIps || []).join(", ") || "No routes";',
  'function detailMarkup(site, preservedTarget) {\n\t\tvar warnings = site.warnings && site.warnings.length',
  'currentData = await api("/sites");\n\t\t\tcurrentData.loaded = true;',
  'if (currentData.loaded && !sites.length) adding = true;',
  'if (!quiet) message(panel, error.message, "error");\n\t\t\treturn null;',
].join('\n');

test('patches both form controls and numeric certificate ordering', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nyx-ui-patch-'));
  try {
    fs.mkdirSync(path.join(root, 'assets'));
    const anchor = 'g.jsx("a",{role:"button",className:"btn btn-ghost btn-danger p-0"';
    fs.writeFileSync(path.join(root, 'assets', mainName), `${anchor}${anchor}`);
    fs.writeFileSync(path.join(root, 'assets', certName), 'e.sort(),t.sort(),r.sort(),n.sort()');
    fs.writeFileSync(path.join(root, 'assets', vpnName), vpnBefore);
    execFileSync(process.execPath, [script, root]);
    const main = fs.readFileSync(path.join(root, 'assets', mainName), 'utf8');
    const cert = fs.readFileSync(path.join(root, 'assets', certName), 'utf8');
    assert.equal(main.includes(anchor), false);
    assert.equal(main.split('g.jsx("button",{type:"button",className:"btn btn-ghost btn-danger p-0"').length - 1, 2);
    assert.equal(cert.split('.sort((a,b)=>a.id-b.id)').length - 1, 4);
    const vpn = fs.readFileSync(path.join(root, 'assets', vpnName), 'utf8');
    assert.match(vpn, /if \(!site\) return/);
    assert.match(vpn, /VPN site response is unavailable/);
    assert.match(vpn, /VPN Agent unavailable\. Refresh to retry/);
    assert.match(vpn, /VPN sites unavailable/);
    assert.match(vpn, /agentAvailable: false, sites: \[\], summary: \{\}, error: error\.message/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('rejects changed compiled assets instead of silently skipping a fix', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nyx-ui-patch-'));
  try {
    fs.mkdirSync(path.join(root, 'assets'));
    fs.writeFileSync(path.join(root, 'assets', mainName), 'unexpected frontend');
    fs.writeFileSync(path.join(root, 'assets', certName), 'e.sort(),t.sort(),r.sort(),n.sort()');
    fs.writeFileSync(path.join(root, 'assets', vpnName), vpnBefore);
    assert.throws(() => execFileSync(process.execPath, [script, root], { stdio: 'pipe' }));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('leaves both assets untouched when the second asset does not match', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nyx-ui-patch-'));
  try {
    fs.mkdirSync(path.join(root, 'assets'));
    const main = path.join(root, 'assets', mainName);
    const cert = path.join(root, 'assets', certName);
    const anchor = 'g.jsx("a",{role:"button",className:"btn btn-ghost btn-danger p-0"';
    fs.writeFileSync(main, `${anchor}${anchor}`);
    fs.writeFileSync(cert, 'unexpected certificate asset');
    fs.writeFileSync(path.join(root, 'assets', vpnName), vpnBefore);
    assert.throws(() => execFileSync(process.execPath, [script, root], { stdio: 'pipe' }));
    assert.equal(fs.readFileSync(main, 'utf8'), `${anchor}${anchor}`);
    assert.equal(fs.readFileSync(cert, 'utf8'), 'unexpected certificate asset');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
