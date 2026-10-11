import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {validateTransaction,loadTransaction,persistTransaction} from '/app/internal/handover-transaction.mjs';
const fixture=version=>({format:'nyxguard-handover-v1',id:'a'.repeat(12),sequence:9,phase:'ROLLBACK_COMPLETE',recoveryId:'nyx-same-'+'a'.repeat(12),backupVerified:false,mutationPossible:false,committed:false,source:{id:'b'.repeat(64),image:'sha256:'+'c'.repeat(64),version:'5.0.0',schema:42,name:'fixture-manager',installDir:'/opt/nyxguardmanager',volumes:[{key:'data',name:'fixture_data'},{key:'letsencrypt',name:'fixture_tls'}]},target:{id:'d'.repeat(64),originalId:'d'.repeat(64),image:'sha256:'+'e'.repeat(64),version}});
for(let patch=4;patch<=12;patch++)test(`completed 5.0.${patch} ledger remains readable without rewriting evidence`,async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'nyx-ledger-'));const file=path.join(dir,'ledger.json');
 try{
  await persistTransaction(file,fixture(`5.0.${patch}`));const before=await fs.readFile(file);
  assert.equal((await loadTransaction(file)).target.version,`5.0.${patch}`);
  assert.deepEqual(await fs.readFile(file),before);
  const broken=JSON.parse(before);broken.transaction.sequence++;await fs.writeFile(file,JSON.stringify(broken));
  await assert.rejects(loadTransaction(file),/checksum/);
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
test('compatibility preserves unsupported-version, identity and mutation rejection',()=>{
 for(const version of ['5.0.3','5.0.13','6.0.0'])assert.throws(()=>validateTransaction(fixture(version)),/Invalid/);
 const t=fixture('5.0.10');assert.throws(()=>validateTransaction({...t,phase:'REPLACEMENT_READY'}),/Contradictory/);
 assert.throws(()=>validateTransaction({...t,mutationPossible:true}),/Invalid/);
 assert.throws(()=>validateTransaction(t,{id:'f'.repeat(12)}),/identity mismatch/);
 assert.throws(()=>validateTransaction({...t,source:{...t.source,schema:45}}),/Invalid/);
});
test('new target schema does not rewrite historical recovery source identities',()=>{
 const schemas={'5.0.0':42,'5.0.1':42,'5.0.2':43,'5.0.3':45,'5.0.4':45,'5.0.5':45,'5.0.6':45,'5.0.7':45,'5.0.8':45,'5.0.9':45,'5.0.10':45,'5.0.11':46};
 for(const [version,schema] of Object.entries(schemas)){
  const t=fixture('5.0.12');t.source={...t.source,version,schema};
  assert.doesNotThrow(()=>validateTransaction(t),version);
  assert.throws(()=>validateTransaction({...t,source:{...t.source,schema:schema+1}}),/Invalid/,version);
 }
});
