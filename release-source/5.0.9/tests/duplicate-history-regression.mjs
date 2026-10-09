import assert from 'node:assert/strict';
import db from '/app/db.js';
import {backfillLegacyHistory} from '/app/internal/legacy-history.mjs';
import {complete} from '/app/internal/startup-progress.mjs';
import {spawnSync} from 'node:child_process';
if(process.env.NYXGUARD_DISPOSABLE_ACCEPTANCE!=='1'||process.env.DB_MYSQL_NAME!=='nyx_history_regression')throw new Error('Owned disposable regression database required');
const k=db();
await k.raw('CREATE TABLE audit_log (id INT PRIMARY KEY) ENGINE=Aria');
await k.raw('CREATE TABLE web_threat_events (id INT PRIMARY KEY, category VARCHAR(32), rule_id VARCHAR(32), meta TEXT, src_ip VARCHAR(64), ts DATETIME(3)) ENGINE=Aria');
await k.raw('CREATE TABLE nyxguard_attack_event (id INT AUTO_INCREMENT PRIMARY KEY, legacy_web_threat_id INT NULL UNIQUE, attack_type VARCHAR(32), ip VARCHAR(64), created_on DATETIME(3), host TEXT, method TEXT, uri TEXT, status INT, user_agent TEXT, referer TEXT) ENGINE=Aria');
const ts=new Date('2026-01-01T00:00:00.123Z');
await k('nyxguard_attack_event').insert({id:7,attack_type:'bot',ip:'192.0.2.5',created_on:ts});
await k('web_threat_events').insert([1,2].map(id=>({id,category:'inbound',rule_id:'inbound.bot',meta:JSON.stringify({source:'nyxguard_attack_monitor'}),src_ip:'192.0.2.5',ts})));
const result=await backfillLegacyHistory(k);assert.equal(result.removed,2);
const records=await k('nyxguard_attack_event').orderBy('legacy_web_threat_id');
console.log(JSON.stringify({canonicalRows:records.length,legacyIds:records.map(r=>r.legacy_web_threat_id),originalCanonicalPreserved:records.some(r=>r.id===7)}));
if(process.env.EXPECT_ORIGINAL_FAILURE==='1'){assert.equal(records.length,1);assert.deepEqual(records.map(r=>r.legacy_web_threat_id),[2]);console.log('Original reassignment bug reproduced');}
else {assert.equal(records.length,2);assert.deepEqual(records.map(r=>r.legacy_web_threat_id),[1,2]);assert.ok(records.some(r=>r.id===7));console.log('Distinct legacy identities preserved');}
if(process.env.EXPECT_ORIGINAL_FAILURE!=='1') {
  // Retry starts a new process and startup-progress attempt, as real recovery does.
  const retryMigration=async(interrupt=false)=>{
    const script=`import db from '/app/db.js';
import {backfillLegacyHistory} from '/app/internal/legacy-history.mjs';
import {complete} from '/app/internal/startup-progress.mjs';
const k=db();let failDelete=${interrupt};
const interrupted=table=>{const b=k(table);if(table==='web_threat_events'){const remove=b.delete.bind(b);b.delete=(...args)=>{if(failDelete){failDelete=false;throw new Error('Synthetic source-delete interruption');}return remove(...args);};}return b;};
try{const result=await backfillLegacyHistory(${interrupt?'interrupted':'k'});console.log('__RESULT__'+JSON.stringify(result));}finally{complete();await k.destroy();}`;
    const result=spawnSync(process.execPath,['--input-type=module','-e',script],{env:process.env,encoding:'utf8'});
    if(result.status!==0)throw new Error(result.stderr||'Migration subprocess failed');
    return JSON.parse(result.stdout.split('\n').find(line=>line.startsWith('__RESULT__')).slice(10));
  };
  const unchanged=await k('nyxguard_attack_event').orderBy('id');
  assert.deepEqual(await retryMigration(),{copied:0,removed:0});
  assert.deepEqual(await k('nyxguard_attack_event').orderBy('id'),unchanged);
  const legacy=(id,extra={})=>({id,category:'inbound',rule_id:'inbound.bot',meta:JSON.stringify({source:'nyxguard_attack_monitor'}),src_ip:'192.0.2.5',ts,...extra});
  // Replayed source identity reuses its own canonical association.
  await k('web_threat_events').insert(legacy(1));
  assert.deepEqual(await retryMigration(),{copied:0,removed:1});
  assert.deepEqual(await k('nyxguard_attack_event').orderBy('id'),unchanged);
  // Previously migrated duplicates cannot have their associations reassigned.
  await k('web_threat_events').insert([legacy(3),legacy(4)]);
  assert.deepEqual(await retryMigration(),{copied:2,removed:2});
  assert.equal((await k('nyxguard_attack_event').where('id',7).first()).legacy_web_threat_id,1);
  assert.deepEqual((await k('nyxguard_attack_event').orderBy('legacy_web_threat_id')).map(r=>r.legacy_web_threat_id),[1,2,3,4]);
  // A persisted association with changed context is rejected, never deleted.
  await k('web_threat_events').insert(legacy(1,{meta:JSON.stringify({source:'nyxguard_attack_monitor',uri:'/changed'})}));
  await assert.rejects(retryMigration(),/Canonical history verification failed/);
  assert.ok(await k('web_threat_events').where('id',1).first());
  assert.equal((await k('nyxguard_attack_event').where('id',7).first()).legacy_web_threat_id,1);
  await k('web_threat_events').where('id',1).delete();
  // Simulate an interrupted nontransactional migration after canonical insert.
  await k('web_threat_events').insert(legacy(5));
  await assert.rejects(retryMigration(true),/Synthetic source-delete interruption/);
  assert.ok(await k('web_threat_events').where('id',5).first());
  const partial=await k('nyxguard_attack_event').where('legacy_web_threat_id',5).first();assert.ok(partial);
  assert.deepEqual(await retryMigration(),{copied:0,removed:1});
  assert.equal((await k('nyxguard_attack_event').where('legacy_web_threat_id',5).first()).id,partial.id);
  // Unknown producers and malformed metadata remain untouched.
  await k('web_threat_events').insert([legacy(6,{meta:'invalid-json'}),legacy(7,{meta:JSON.stringify({source:'native'})})]);
  assert.deepEqual(await retryMigration(),{copied:0,removed:0});
  assert.deepEqual((await k('web_threat_events').orderBy('id')).map(r=>r.id),[6,7]);
  console.log('PASS: duplicates, canonical ownership, replay, idempotence, strict mismatch rejection and interrupted migration retry');
}
complete();await k.destroy();
