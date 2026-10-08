import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import vm from 'node:vm';
import {validateIntegrity} from '../internal/database-integrity.mjs';
import {runTransaction} from '../internal/handover-transaction.mjs';

const source=await fs.readFile(new URL('../internal/same-major-recovery.js',import.meta.url),'utf8');
const manifestStart=source.indexOf('async function manifest()'),manifestEnd=source.indexOf('\nfunction assertSourceSchema',manifestStart);
const schemaEnd=source.indexOf('\nasync function backup()',manifestEnd);
const verifyStart=source.indexOf("  else if(mode==='verify') {"),verifyEnd=source.indexOf("\n  else if(mode==='metadata')",verifyStart);
const verifyBody=source.slice(verifyStart,verifyEnd).replace(/^  else if\(mode==='verify'\) /,'');
const helper=await fs.readFile(new URL('../internal/update-handover.js',import.meta.url),'utf8');
const backupStart=helper.indexOf('    backup:async t=>{'),backupEnd=helper.indexOf('\n    startReplacement:',backupStart);
const backupBody=helper.slice(backupStart,backupEnd).trim().replace(/^backup:/,'').replace(/,$/,'');
const tables=['migrations','migrations_lock','user','auth','user_permission','setting','proxy_host','certificate','access_list','nyxguard_settings','nyxguard_traffic_stat','nyxguard_traffic_state','audit_log'];
const expected={format:'nyxguard-database-integrity-v1',migrations:42,migrationLocked:false,activeAdmins:0,
 orphanAuth:0,orphanPermissions:0,defaultSetting:true,
 tables:Object.fromEntries(tables.map(table=>[table,{schema:'a'.repeat(64),rows:'b'.repeat(64),count:0}]))};

async function fixture(kind) {
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'nyx-backup-state-'));
 const volumes=[{key:'data',name:'nyxguard_data'},{key:'letsencrypt',name:'nyxguard_letsencrypt'}];
 const hashes={};
 for(const file of ['database.sql','vault.key','data.tar','letsencrypt.tar']) {
  const bytes=Buffer.from(`synthetic ${file}`);await fs.writeFile(path.join(root,file),bytes);
  hashes[file]=crypto.createHash('sha256').update(bytes).digest('hex');
 }
 const snapshot={stage:'synthetic_stage',expected};
 const value={format:'nyxguard-same-major-v2',id:'synthetic-recovery',database:'synthetic',volumes,snapshot,hashes};
 if(kind==='incomplete-manifest')delete value.hashes['vault.key'];
 if(kind!=='missing-manifest')await fs.writeFile(path.join(root,'manifest.json'),JSON.stringify(value));
 if(kind==='checksum-mismatch')await fs.writeFile(path.join(root,'data.tar'),'corrupt');
 const state={phase:kind==='incomplete-state'?'backing_up':'protected',snapshot};
 if(kind==='snapshot-mismatch')state.snapshot={...snapshot,stage:'other_stage'};
 if(kind!=='missing-state')await fs.writeFile(path.join(root,'state.json'),JSON.stringify(state));
 const journal=path.join(root,'state.json');
 const actual=structuredClone(expected),stage=structuredClone(expected);
 if(kind==='stage-integrity-mismatch')stage.tables.proxy_host.rows='c'.repeat(64);
 if(kind==='source-integrity-mismatch')actual.tables.proxy_host.rows='c'.repeat(64);
 const context=vm.createContext({fs,path,root,volumes,id:'synthetic-recovery',database:'synthetic',journal,
  process:{env:{RECOVERY_MUTATION_POSSIBLE:'0',RECOVERY_SOURCE_VERSION:'5.0.1'}},connection:{},
  hash:async file=>crypto.createHash('sha256').update(await fs.readFile(file)).digest('hex'),
  validateIntegrity,captureIntegrity:async(_,database)=>database==='synthetic_stage'?stage:actual,
  validateUpgradePreservation:async()=>{throw Error('Post-migration verification must not run');}});
 vm.runInContext(source.slice(manifestStart,manifestEnd)+source.slice(manifestEnd,schemaEnd),context);
 const verify=()=>vm.runInContext(`(async()=>${verifyBody})()`,context);
 const backupContext=vm.createContext({hasVpn:false,stop:async()=>{},worker:async mode=>{
  if(mode==='backup') {
   if(kind==='worker-failure')throw Error('Same-major recovery backup failed with exit 17');
   if(kind==='worker-timeout')throw Object.assign(Error('Recovery worker deadline exceeded; worker still running'),{code:'WORKER_DEADLINE_EXCEEDED'});
   return; // Exit-zero injection: authoritative state is checked separately.
  }
  assert.equal(mode,'verify');await verify();
 }});
 const backup=vm.runInContext(`(${backupBody})`,backupContext);
 return {root,backup};
}
for(const kind of ['valid','missing-manifest','incomplete-manifest','checksum-mismatch','missing-state','incomplete-state','snapshot-mismatch','stage-integrity-mismatch','source-integrity-mismatch','worker-failure','worker-timeout']) {
 test(`protected backup gate: ${kind}`,async()=>{
  const f=await fixture(kind);let replacementStarts=0;const phases=[];
  const effects=Object.fromEntries(['verifySourcePair','prepareReplacement','verifyTargetData','commitMetadata','finishCommit','stopReplacement','restore','startSource','verifySourceData','recordRollback','finalizeRollback'].map(name=>[name,async()=>{}]));
  effects.backup=f.backup;effects.startReplacement=async()=>{replacementStarts++;};
  try {
   const result=await runTransaction({sequence:0,phase:'INITIALIZED',backupVerified:false,mutationPossible:false,committed:false,source:{id:'synthetic-source'},target:{}},effects,async t=>phases.push(t.phase));
   assert.equal(replacementStarts,kind==='valid'?1:0);
   assert.equal(phases.includes('BACKUP_VERIFIED'),kind==='valid');
   assert.equal(result.result,kind==='valid'?'committed':'rollback');
   if(kind!=='valid')assert.equal(result.transaction.mutationPossible,false);
  }finally{await fs.rm(f.root,{recursive:true,force:true});}
 });
}
