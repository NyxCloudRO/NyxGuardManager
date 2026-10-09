import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {retentionAllowed} from '/app/internal/retention-guard.mjs';
import {persistTransaction} from '/app/internal/handover-transaction.mjs';
const id='a'.repeat(12);
const transaction=phase=>({format:'nyxguard-handover-v1',id,sequence:9,phase,recoveryId:'nyx-same-'+id,backupVerified:true,mutationPossible:true,committed:phase==='COMMITTED',source:{id:'b'.repeat(64),image:'sha256:'+'c'.repeat(64),version:'5.0.0',schema:42,name:'fixture_manager',installDir:'/opt/nyxguardmanager',volumes:[{key:'data',name:'fixture_data'},{key:'letsencrypt',name:'fixture_tls'}]},target:{id:'d'.repeat(64),originalId:'d'.repeat(64),image:'sha256:'+'e'.repeat(64),version:'5.0.9'}});
async function fixture(run){const root=await fs.mkdtemp(path.join(os.tmpdir(),'nyx-retention-'));try{await run(root);}finally{await fs.rm(root,{recursive:true,force:true});}}
test('ordinary installations retain the existing retention policy',()=>fixture(async root=>assert.equal(await retentionAllowed(root),true)));
test('retention waits throughout migration, verification, commit and recovery',()=>fixture(async root=>{

 for(const phase of ['REPLACEMENT_STARTING','REPLACEMENT_READY','APPLICATION_DATA_VERIFIED','COMMITTING','ROLLBACK_REQUIRED','RESTORE_STARTING','RESTORE_VERIFIED','OLD_RUNTIME_READY']){
  await persistTransaction(path.join(root,'.nyx-handover',id+'.json'),transaction(phase));assert.equal(await retentionAllowed(root),false,phase);
 }
}));
test('checksummed commit and completed rollback re-enable retention',()=>fixture(async root=>{

 for(const phase of ['COMMITTED','ROLLBACK_COMPLETE']){await persistTransaction(path.join(root,'.nyx-handover',id+'.json'),transaction(phase));assert.equal(await retentionAllowed(root),true,phase);}
}));
test('missing or corrupt status defers deletion; ledgers remain private',()=>fixture(async root=>{
 const dir=path.join(root,'.nyx-handover'),status=path.join(dir,'retention.json'),ledger=path.join(dir,id+'.json');
 await fs.mkdir(dir);assert.equal(await retentionAllowed(root),false);
 for(const value of ['{',JSON.stringify({phase:'COMMITTED'}),JSON.stringify({format:'nyxguard-retention-v1',phase:'UNKNOWN'})]){await fs.writeFile(status,value);assert.equal(await retentionAllowed(root),false);}
 await persistTransaction(ledger,transaction('COMMITTED'));assert.equal(await retentionAllowed(root),true);
 assert.equal((await fs.stat(ledger)).mode&0o777,0o600);
 assert.equal((await fs.stat(dir)).mode&0o777,0o711);
 assert.equal((await fs.stat(status)).mode&0o777,0o644);
 const state=JSON.parse(await fs.readFile(status));assert.deepEqual(Object.keys(state).sort(),['format','phase']);
 await fs.unlink(status);assert.equal(await retentionAllowed(root),false);
}));
test('application user reads completion without gaining access to the ledger',()=>fixture(async root=>{
 await fs.chmod(root,0o755);
 const ledger=path.join(root,'.nyx-handover',id+'.json');
 await persistTransaction(ledger,transaction('COMMITTED'));
 const script=`import assert from 'node:assert/strict';import fs from 'node:fs/promises';import {retentionAllowed} from '/app/internal/retention-guard.mjs';assert.equal(await retentionAllowed(${JSON.stringify(root)}),true);await assert.rejects(fs.readFile(${JSON.stringify(ledger)}),{code:'EACCES'});`;
 const result=spawnSync(process.execPath,['--input-type=module','-e',script],{uid:1000,gid:1000,encoding:'utf8'});
 assert.equal(result.status,0,result.stderr);
}));
