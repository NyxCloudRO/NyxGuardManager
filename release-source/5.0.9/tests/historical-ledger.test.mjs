import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {validateTransaction,loadTransaction,persistTransaction,runTransaction} from '/app/internal/handover-transaction.mjs';
// Synthetic identifiers; no installation data is embedded in this fixture.
const initial=version=>({format:'nyxguard-handover-v1',id:'a'.repeat(12),sequence:9,phase:'ROLLBACK_COMPLETE',recoveryId:'nyx-same-'+'a'.repeat(12),backupVerified:false,mutationPossible:false,committed:false,source:{id:'b'.repeat(64),image:'sha256:'+'c'.repeat(64),version:'5.0.0',schema:42,name:'nyxguard-manager',installDir:'/opt/nyxguardmanager',volumes:[{key:'data',name:'fixture_data'},{key:'letsencrypt',name:'fixture_tls'}]},target:{id:'d'.repeat(64),originalId:'d'.repeat(64),image:'sha256:'+'e'.repeat(64),version}});
for(const version of ['5.0.4','5.0.5','5.0.6','5.0.7','5.0.8','5.0.9']) test(`checksummed completed ${version} ledger remains readable`,async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'nyx-ledger-')); const file=path.join(dir,'ledger.json');
 try{await persistTransaction(file,initial(version));assert.equal((await loadTransaction(file)).target.version,version);
 const original=await fs.readFile(file);const broken=JSON.parse(original);broken.transaction.sequence++;await fs.writeFile(file,JSON.stringify(broken));await assert.rejects(loadTransaction(file),/checksum/);
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
test('version compatibility does not weaken identity or mutation gates',()=>{
 for(const version of ['5.0.3','5.0.10','6.0.0'])assert.throws(()=>validateTransaction(initial(version)),/Invalid/);
 const t=initial('5.0.6');assert.throws(()=>validateTransaction({...t,phase:'REPLACEMENT_READY'}),/Contradictory/);
 assert.throws(()=>validateTransaction({...t,mutationPossible:true}),/Invalid/);
 assert.throws(()=>validateTransaction(t,{id:'f'.repeat(12)}),/identity mismatch/);
 assert.throws(()=>validateTransaction({...t,source:{...t.source,schema:45}}),/Invalid/);
});
test('read-only historical check never rewrites retained evidence',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'nyx-ledger-'));const file=path.join(dir,'ledger.json');
 try{await persistTransaction(file,initial('5.0.6'));const before=await fs.readFile(file);await loadTransaction(file);assert.deepEqual(await fs.readFile(file),before);}finally{await fs.rm(dir,{recursive:true,force:true});}
});
test('all supported same-major source versions retain their schema contract',async()=>{
 const {default:policy,supportedTransition}=await import('/app/internal/release-policy.mjs');
 for(let patch=0;patch<=8;patch++){
  const source=`5.0.${patch}`;assert.equal(supportedTransition(source,policy.version),true);
  assert.equal(policy.sources[source],patch<2?42:patch===2?43:45);
 }
 assert.equal(policy.agent,'5.0.1');assert.equal(supportedTransition('4.0.18',policy.version),false);
});
