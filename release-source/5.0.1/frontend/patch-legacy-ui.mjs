#!/usr/bin/env node

// Carry forward two fixes from the pre-4.0.18 React source into the validated
// compiled frontend base until a complete native frontend build is available.
import fs from 'node:fs';
import path from 'node:path';

const root = process.argv[2];
if (!root) throw new Error('Usage: node patch-legacy-ui.mjs FRONTEND_ROOT');

function preparePatch(name, oldText, newText, expectedCount) {
  const asset = path.join(root, 'assets', name);
  const original = fs.readFileSync(asset, 'utf8');
  const count = original.split(oldText).length - 1;
  if (count !== expectedCount) {
    throw new Error(`${name}: expected ${expectedCount} source matches; found ${count}`);
  }
  return { asset, patched: original.replaceAll(oldText, newText) };
}

function preparePatches(name, changes) {
  const asset = path.join(root, 'assets', name);
  let patched = fs.readFileSync(asset, 'utf8');
  for (const [oldText, newText] of changes) {
    const count = patched.split(oldText).length - 1;
    if (count !== 1) throw new Error(`${name}: expected one source match; found ${count}`);
    patched = patched.replace(oldText, newText);
  }
  return { asset, patched };
}

const patches = [];
patches.push(preparePatch(
  'index-CTHAIRmi-409dev-4012certfix4-threatpagination3.js',
  'g.jsx("a",{role:"button",className:"btn btn-ghost btn-danger p-0"',
  'g.jsx("button",{type:"button",className:"btn btn-ghost btn-danger p-0"',
  2,
));

patches.push(preparePatch(
  'index-BfJf9XXp-4012certfix4.js',
  'e.sort(),t.sort(),r.sort(),n.sort()',
  'e.sort((a,b)=>a.id-b.id),t.sort((a,b)=>a.id-b.id),r.sort((a,b)=>a.id-b.id),n.sort((a,b)=>a.id-b.id)',
  1,
));

patches.push(preparePatches('vpn-client-4014.js', [
  [
    'var route = (site.allowedIps || []).join(", ") || "No routes";',
    'var route = (Array.isArray(site.allowedIps) ? site.allowedIps.join(", ") : "") || "No routes";',
  ],
  [
    'function detailMarkup(site, preservedTarget) {\n\t\tvar warnings = site.warnings && site.warnings.length',
    'function detailMarkup(site, preservedTarget) {\n\t\tif (!site) return \'<section class="nyx-vpn-detail-card"><p>\' + escapeHtml(currentData.error || (currentData.loaded ? "Select a VPN site." : "Loading VPN sites…")) + \'</p></section>\';\n\t\tsite = Object.assign({ warnings: [], addresses: [], allowedIps: [], endpoints: [] }, site);\n\t\t["warnings", "addresses", "allowedIps", "endpoints"].forEach(function (key) { if (!Array.isArray(site[key])) site[key] = []; });\n\t\tvar warnings = site.warnings && site.warnings.length',
  ],
  [
    'currentData = await api("/sites");\n\t\t\tcurrentData.loaded = true;',
    'var nextData = await api("/sites");\n\t\t\tif (!nextData || !Array.isArray(nextData.sites)) throw new Error("VPN site response is unavailable.");\n\t\t\tcurrentData = Object.assign({}, nextData, { sites: nextData.sites.filter(function (site) { return site && typeof site === "object"; }), loaded: true, error: null });',
  ],
  [
    'if (!quiet) message(panel, error.message, "error");\n\t\t\treturn null;',
    'currentData.error = error.message;\n\t\t\tcurrentData.loaded = true;\n\t\t\trender(panel);\n\t\t\tif (!quiet) message(panel, error.message, "error");\n\t\t\treturn null;',
  ],
]));

for (const { asset, patched } of patches) fs.writeFileSync(asset, patched);
