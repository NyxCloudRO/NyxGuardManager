import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const mainSource = process.env.NYX_TASK2_RULES_MAIN;
const pageSource = process.env.NYX_TASK2_RULES_PAGE;
const script = new URL('./patch-page.mjs', import.meta.url).pathname;

test('Traffic Rules patch preserves exact asset contract and adds safe controls', { skip: !mainSource || !pageSource }, () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nyx-task2-rules-'));
  try {
    const assets = path.join(root, 'assets');
    fs.mkdirSync(assets);
    fs.copyFileSync(mainSource, path.join(assets, 'index-CTHAIRmi-409dev-4012certfix4-threatpagination3.js'));
    fs.copyFileSync(pageSource, path.join(assets, 'index-DHuZiE1T.js'));
    const result = spawnSync(process.execPath, [script, root], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    const main = fs.readFileSync(path.join(assets, 'index-CTHAIRmi-409dev-4012certfix4-threatpagination3.js'), 'utf8');
    const page = fs.readFileSync(path.join(assets, 'index-DHuZiE1T-task2.js'), 'utf8');
    assert.match(main, /index-DHuZiE1T-task2\.js/);
    assert.match(page, /Delete this IP rule\?/);
    assert.match(page, /Delete this country rule\?/);
    assert.match(page, /Unable to edit IP rule/);
    assert.match(page, /Unable to change country rule/);
    assert.match(page, /Save Changes/);
    assert.match(page, /setEditing\(\{id:t\.id,type:"ip"\}\)/);
    assert.match(page, /setEditing\(\{id:t\.id,type:"country"\}\)/);
    assert.equal(spawnSync(process.execPath, ['--check', path.join(assets, 'index-DHuZiE1T-task2.js')]).status, 0);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('Traffic Rules patch rejects an unexpected compiled page without writing output', { skip: !mainSource }, () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nyx-task2-rules-'));
  try {
    const assets = path.join(root, 'assets');
    fs.mkdirSync(assets);
    const mainPath = path.join(assets, 'index-CTHAIRmi-409dev-4012certfix4-threatpagination3.js');
    fs.copyFileSync(mainSource, mainPath);
    fs.writeFileSync(path.join(assets, 'index-DHuZiE1T.js'), 'unexpected page');
    const original = fs.readFileSync(mainPath);
    const result = spawnSync(process.execPath, [script, root], { encoding: 'utf8' });
    assert.notEqual(result.status, 0);
    assert.deepEqual(fs.readFileSync(mainPath), original);
    assert.equal(fs.existsSync(path.join(assets, 'index-DHuZiE1T-task2.js')), false);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
