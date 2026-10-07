import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {safetyGate} from './safety-gate.mjs';
import {dockerHealthcheck} from '../internal/readiness-policy.mjs';
const identity={format:'nyxguard-safety-evidence-v1',phase:'private-main1',candidateImageId:`sha256:${'a'.repeat(64)}`,
  sourceTreeSha256:'b'.repeat(64),imageHealthcheck:dockerHealthcheck(),cases:[]};
test('passing focused tests cannot substitute for required real upgrade proofs',async()=>{
  await assert.rejects(safetyGate(identity,'/unused'),/Mandatory safety proof missing: R1/);
});
test('a more forgiving effective image policy is rejected',async()=>{
  await assert.rejects(safetyGate({...identity,imageHealthcheck:{...dockerHealthcheck(),Retries:30}},'/unused'),/readiness policy differs/);
});
test('receipts from another candidate are rejected',async()=>{
  await assert.rejects(safetyGate({...identity,cases:[{id:'R1',status:'PASS',candidateImageId:`sha256:${'c'.repeat(64)}`}]},'/unused'),/exact-candidate proof/);
});
test('changed evidence cannot silently retain PASS',async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'nyx-safety-gate-'));
  try {
    await fs.writeFile(path.join(root,'proof'),'changed bytes');
    const receipt={id:'R1',status:'PASS',candidateImageId:identity.candidateImageId,
      artifacts:[{file:'proof',sha256:crypto.createHash('sha256').update('accepted bytes').digest('hex')}]};
    await assert.rejects(safetyGate({...identity,cases:[receipt]},root),/Evidence bytes differ/);
  }finally{await fs.rm(root,{recursive:true,force:true});}
});

test('private scoped reuse checks every unchanged transaction dependency',async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'nyx-reuse-'));
  try {
    const previousId=`sha256:${'c'.repeat(64)}`;
    const modules=['handover-transaction.mjs','update-handover.js','same-major-recovery.js','recovery-database.mjs','recovery-files.mjs','recovery-docker.mjs','database-integrity.mjs','readiness.mjs','readiness-probe.mjs','readiness-policy.mjs','readiness-policy.json','update-manager.js','update-contract.mjs','bounded-process.mjs'];
    const hashes=Object.fromEntries(modules.map(name=>[name,'d'.repeat(64)]));
    const binding={previousImageId:previousId,currentImageId:identity.candidateImageId,scopes:{transaction:{previous:hashes,current:{...hashes}}}};
    const write=async()=>{const raw=JSON.stringify(binding);await fs.writeFile(path.join(root,'binding'),raw);return crypto.createHash('sha256').update(raw).digest('hex');};
    await fs.writeFile(path.join(root,'proof'),'original receipt');
    const receipt={id:'R1',status:'PASS',candidateImageId:previousId,reuse:{file:'binding',scope:'transaction',sha256:await write()},artifacts:[{file:'proof',sha256:crypto.createHash('sha256').update('original receipt').digest('hex')}]};
    await assert.rejects(safetyGate({...identity,cases:[receipt]},root),/Mandatory safety proof missing: R2/);
    await assert.rejects(safetyGate({...identity,phase:'public',cases:[receipt]},root),/exact-candidate proof/);
    await assert.rejects(safetyGate({...identity,cases:[{...receipt,id:'U4'}]},root),/exact-candidate proof/);
    binding.scopes.transaction.current['update-handover.js']='e'.repeat(64);receipt.reuse.sha256=await write();
    await assert.rejects(safetyGate({...identity,cases:[receipt]},root),/Reused dependency differs/);
  }finally{await fs.rm(root,{recursive:true,force:true});}
});
