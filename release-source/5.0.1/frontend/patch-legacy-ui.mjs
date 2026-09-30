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

for (const { asset, patched } of patches) fs.writeFileSync(asset, patched);
