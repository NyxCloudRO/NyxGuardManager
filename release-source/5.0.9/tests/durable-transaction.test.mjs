import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {runTransaction,persistTransaction,loadTransaction} from '/app/internal/handover-transaction.mjs';
const id='a'.repeat(12),sourceId='b'.repeat(64),targetId='c'.repeat(64);
const initial=()=>({format:'nyxguard-handover-v1',id,sequence:0,phase:'INITIALIZED',recoveryId:`nyx-same-${id}`,
 backupVerified:false,mutationPossible:false,committed:false,
 source:{id:sourceId,image:'sha256:'+'d'.repeat(64),version:'5.0.2',schema:43,name:'nyxguard-manager',installDir:'/opt/nyxguardmanager',volumes:[{key:'data',name:'nyxguard_data'},{key:'letsencrypt',name:'nyxguard_letsencrypt'}]},
 target:{id:targetId,originalId:targetId,image:'sha256:'+'e'.repeat(64),version:'5.0.4'}});
const identity={id,sourceId,sourceVersion:'5.0.2',targetId,targetImage:initial().target.image,targetVersion:'5.0.4'};
function installation() {
 let runtime='old',schema=43,rows=7,files='old',backups=0,restores=0;
 const effects={verifySourcePair:async()=>{assert.equal(schema,43);},prepareReplacement:async()=>({}),
 backup:async()=>{assert.equal(schema,43);runtime='stopped';backups++;},
 startReplacement:async()=>{schema=45;files='new';runtime='new';},verifyTargetData:async()=>{assert.equal(rows,7);},
 commitMetadata:async()=>{},verifyCommitted:async()=>{assert.equal(runtime,'new');assert.equal(schema,45);assert.equal(rows,7);},finishCommit:async()=>{},
 stopReplacement:async()=>{if(runtime==='new')runtime='stopped';},restore:async()=>{schema=43;rows=7;files='old';runtime='stopped';restores++;},
 startSource:async()=>{assert.equal(schema,43);assert.equal(files,'old');runtime='old';},
 verifySourceData:async()=>{assert.equal(rows,7);assert.equal(runtime,'old');},recordRollback:async()=>{},finalizeRollback:async()=>{}};
 return {effects,damage:()=>{rows=0;},snapshot:()=>({runtime,schema,rows,files,backups,restores})};
}
for(const phase of ['SOURCE_VERIFIED','REPLACEMENT_PREPARED','BACKUP_STARTING','BACKUP_VERIFIED','REPLACEMENT_STARTING','REPLACEMENT_READY','APPLICATION_DATA_VERIFIED','COMMITTING','COMMITTED']) {
 test(`durable restart at ${phase} converges and repeated restart is idempotent`,async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'nyx-journal-')),file=path.join(root,'transaction.json'),host=installation();
  try {
   await persistTransaction(file,initial());
   host.effects.boundary=async current=>{if(current===phase)throw new Error('Simulated death');};
   // Model abrupt death by preventing the normal catch from starting rollback.
   const save=async t=>{await persistTransaction(file,t);};
   host.effects.stopReplacement=async()=>{throw new Error('Dead process cannot recover');};
   await runTransaction(initial(),host.effects,save).catch(()=>undefined);
   const tx=await loadTransaction(file,identity);
   delete host.effects.boundary;
   host.effects.stopReplacement=async()=>{};
   if(tx.phase!=='COMMITTED'&&tx.mutationPossible)host.damage();
   const result=await runTransaction(tx,host.effects,save,true);
   const state=host.snapshot();assert.equal(state.rows,7);assert.equal(state.schema,result.result==='committed'?45:43);
   assert.equal(state.runtime,result.result==='committed'?'new':'old');
   const final=await loadTransaction(file,identity);await runTransaction(final,host.effects,save,true);
   assert.deepEqual(host.snapshot(),state);
  }finally{await fs.rm(root,{recursive:true,force:true});}
 });
}
for(const phase of ['ROLLBACK_REQUIRED','REPLACEMENT_STOPPED','RESTORE_STARTING','RESTORE_VERIFIED','OLD_RUNTIME_STARTING','OLD_RUNTIME_READY','OLD_APPLICATION_DATA_VERIFIED','ROLLBACK_COMPLETE']){
 test(`interrupted rollback ${phase} resumes original source`,async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'nyx-journal-')),file=path.join(root,'transaction.json'),host=installation();
  try{
   const tx={...initial(),phase:'REPLACEMENT_STARTING',backupVerified:true,mutationPossible:true};
   await host.effects.startReplacement(tx);host.damage();await persistTransaction(file,tx);
   host.effects.boundary=async current=>{if(current===phase)throw new Error('Simulated death');};
   await assert.rejects(runTransaction(tx,host.effects,t=>persistTransaction(file,t),true));
   delete host.effects.boundary;
   await runTransaction(await loadTransaction(file,identity),host.effects,t=>persistTransaction(file,t),true);
   assert.deepEqual({...host.snapshot(),restores:0},{runtime:'old',schema:43,rows:7,files:'old',backups:0,restores:0});
  }finally{await fs.rm(root,{recursive:true,force:true});}
 });
}
test('corrupt/incomplete/cross-transaction state fails closed',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'nyx-journal-')),file=path.join(root,'transaction.json');
 try{
  await fs.writeFile(file,'{');await assert.rejects(loadTransaction(file,identity));
  await persistTransaction(file,initial());await assert.rejects(loadTransaction(file,{...identity,sourceId:'f'.repeat(64)}));
  const raw=JSON.parse(await fs.readFile(file));raw.transaction.mutationPossible=true;await fs.writeFile(file,JSON.stringify(raw));await assert.rejects(loadTransaction(file,identity));
  await assert.rejects(persistTransaction(file,{...initial(),source:{...initial().source,schema:45}}));
 }finally{await fs.rm(root,{recursive:true,force:true});}
});

test('first failure survives successful rollback and repeated resume without private text',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'nyx-first-failure-')),file=path.join(root,'transaction.json'),host=installation();
 try {
  host.effects.backup=async()=>{throw Object.assign(new TypeError('token=PRIVATE_SENTINEL https://user:password@private.invalid'),{code:'ECONNRESET'});};
  const result=await runTransaction(initial(),host.effects,t=>persistTransaction(file,t));
  assert.equal(result.result,'rollback');
  assert.deepEqual(result.transaction.failure,{category:'TypeError',code:'ECONNRESET',message:'Upgrade gate failed; inspect the retained worker logs and transaction phase',phase:'BACKUP_STARTING'});
  assert.ok(!(await fs.readFile(file,'utf8')).includes('PRIVATE_SENTINEL'));
  const saved=await loadTransaction(file,identity);
  const resumed=await runTransaction(saved,host.effects,t=>persistTransaction(file,t),true);
  assert.deepEqual(resumed.transaction.failure,saved.failure);
 } finally {await fs.rm(root,{recursive:true,force:true});}
});

test('worker timeout blocks rollback before source start and preserves both errors',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'nyx-worker-refusal-')),file=path.join(root,'transaction.json'),host=installation();
 try {
  let starts=0;
  host.effects.backup=async()=>{throw new Error('Docker API deadline exceeded');};
  host.effects.stopReplacement=async()=>{throw Object.assign(new Error('Recovery worker deadline exceeded; worker still running'),{code:'WORKER_DEADLINE_EXCEEDED'});};
  host.effects.startSource=async()=>{starts++;};
  await assert.rejects(runTransaction(initial(),host.effects,t=>persistTransaction(file,t)),error=>{
   assert.equal(error.handoverFailure.message,'Docker API deadline exceeded');
   assert.equal(error.handoverRecoveryFailure.code,'WORKER_DEADLINE_EXCEEDED');return true;
  });
  const saved=await loadTransaction(file,identity);
  assert.equal(saved.phase,'ROLLBACK_REQUIRED');assert.equal(starts,0);
  assert.equal(saved.failure.phase,'BACKUP_STARTING');
  assert.equal(saved.recoveryFailure.code,'WORKER_DEADLINE_EXCEEDED');
 } finally {await fs.rm(root,{recursive:true,force:true});}
});
