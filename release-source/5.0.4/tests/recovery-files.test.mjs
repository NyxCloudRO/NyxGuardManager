import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import { makeFilePlan, prepareFilePlan, sealFilePlan, switchFiles, undoFileSwitch, treeFingerprint } from '../internal/recovery-files.mjs';

async function fixture(fn) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'nyx-recovery-files-'));
  try {
    const source = path.join(root, 'data'); await fs.mkdir(source);
    await fs.writeFile(path.join(source, 'shared'), 'previous-live');
    await fs.writeFile(path.join(source, 'old-only'), 'previous-only');
    const original = await treeFingerprint(source);
    const plan = await makeFilePlan('test_recovery_files', [{ source }]);
    await fs.writeFile(path.join(plan.entries[0].stage, 'new', 'shared'), 'restored');
    await fs.writeFile(path.join(plan.entries[0].stage, 'new', 'new-only'), 'restored-only');
    const journal = path.join(root, 'journal.json');
    await sealFilePlan(plan, journal);
    await fn({ root, source, original, plan, journal });
  } finally { await fs.rm(root, { recursive: true, force: true }); }
}

test('filesystem switch retains previous live contents and can reverse', async () => fixture(async ({ source, original, plan, journal }) => {
  await switchFiles(plan, journal);
  assert.equal(await fs.readFile(path.join(source, 'shared'), 'utf8'), 'restored');
  assert.equal(await fs.readFile(path.join(plan.entries[0].stage, 'old', 'shared'), 'utf8'), 'previous-live');
  await undoFileSwitch(plan, journal);
  assert.equal(await treeFingerprint(source), original);
}));

test('interruption at every rename boundary can resume or reverse deterministically', async () => {
  for (const interruptAt of [1, 2, 3, 4]) await fixture(async ({ source, original, plan, journal }) => {
    let moves = 0;
    await assert.rejects(switchFiles(plan, journal, async () => {
      if (++moves === interruptAt) throw new Error('injected process interruption');
    }), /interruption/);
    const durable = JSON.parse(await fs.readFile(journal, 'utf8'));
    await undoFileSwitch(durable, journal);
    assert.equal(await treeFingerprint(source), original);
    await switchFiles(durable, journal);
    assert.equal(await fs.readFile(path.join(source, 'shared'), 'utf8'), 'restored');
    await undoFileSwitch(durable, journal);
    assert.equal(await treeFingerprint(source), original);
  });
});

test('SIGKILL during preparation leaves live files intact and journal permits extraction retry', async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'nyx-recovery-kill-'));
  try {
    const source=path.join(root,'data'),journal=path.join(root,'journal.json');
    await fs.mkdir(source);await fs.writeFile(path.join(source,'original'),'known-good');
    const before=await treeFingerprint(source);
    const runner=path.join(root,'kill.mjs');
    await fs.writeFile(runner,`import fs from 'node:fs/promises';
      import {makeFilePlan} from ${JSON.stringify(new URL('../internal/recovery-files.mjs',import.meta.url).href)};
      const plan=await makeFilePlan('test_killed_preparation',[{source:${JSON.stringify(source)}}],${JSON.stringify(journal)});
      await fs.writeFile(plan.entries[0].stage+'/new/partial','unfinished');process.kill(process.pid,'SIGKILL');`);
    const signal=await new Promise((resolve,reject)=>{const child=spawn(process.execPath,[runner],{stdio:'ignore'});child.on('error',reject);child.on('exit',(_,signal)=>resolve(signal));});
    assert.equal(signal,'SIGKILL');
    const plan=JSON.parse(await fs.readFile(journal,'utf8'));
    assert.equal(await treeFingerprint(source),before);
    await prepareFilePlan(plan);
    assert.deepEqual(await fs.readdir(path.join(plan.entries[0].stage,'new')),[]);
    assert.equal(await treeFingerprint(source),before);
  }finally{await fs.rm(root,{recursive:true,force:true});}
});

test('SIGKILL at each durable rename boundary can be reversed on a new process', async()=>{
  for(const interruptAt of [1,2,3,4]) await fixture(async({root,source,original,plan,journal})=>{
    const runner=path.join(root,'kill.mjs');
    await fs.writeFile(runner,`import fs from 'node:fs/promises';
      import {switchFiles} from ${JSON.stringify(new URL('../internal/recovery-files.mjs',import.meta.url).href)};
      const journal=${JSON.stringify(journal)};const plan=JSON.parse(await fs.readFile(journal,'utf8'));let moves=0;
      await switchFiles(plan,journal,async()=>{if(++moves===${interruptAt})process.kill(process.pid,'SIGKILL');});`);
    const signal=await new Promise((resolve,reject)=>{const child=spawn(process.execPath,[runner],{stdio:'ignore'});child.on('error',reject);child.on('exit',(_,signal)=>resolve(signal));});
    assert.equal(signal,'SIGKILL');
    await undoFileSwitch(JSON.parse(await fs.readFile(journal,'utf8')),journal);
    assert.equal(await treeFingerprint(source),original);
  });
});
