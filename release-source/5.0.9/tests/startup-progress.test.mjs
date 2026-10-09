import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {assertProgress,progressLimit} from '/app/internal/startup-progress-check.mjs';
import policy from '/app/internal/release-policy.mjs';
const state=(change={})=>({format:1,attempt:'synthetic-attempt',startedAt:1000,progressAt:1000,phase:'migration-schema',units:0,total:0,failed:false,...change});
test('unreported schema work still fails the unchanged migration idle limit',()=>assert.throws(()=>assertProgress(state(),1000+policy.readiness.migrationIdleMs+1),/STARTUP_STALLED.*phase=migration-schema/));
test('completed schema operations keep progress within the same idle limit',()=>{for(let i=1;i<=4;i++){const now=1000+i*20000;assertProgress(state({phase:'migration-schema-operation-'+i,progressAt:now,total:600000}),now+1000);}});
test('a large declared inventory cannot conceal a stalled operation',()=>assert.throws(()=>assertProgress(state({total:600000}),1000+policy.readiness.migrationIdleMs+1),/STARTUP_STALLED/));
test('completed work cannot extend the absolute maximum budget',()=>{const now=1000+policy.readiness.maximumBudgetMs+1;assert.equal(progressLimit(state({total:600000})),policy.readiness.maximumBudgetMs);assert.throws(()=>assertProgress(state({total:600000,units:599999,progressAt:now}),now),/STARTUP_STALLED/);});
test('failed state remains refused',()=>assert.throws(()=>assertProgress(state({failed:true}),1000),/STARTUP_FAILED/));
test('repeated heartbeats do not refresh the stored progress clock',async()=>{
 const realNow=Date.now;let clock=10000;Date.now=()=>clock;
 try{
  const {advance,complete,progressFile}=await import('/app/internal/startup-progress.mjs');
  advance('migration-schema-counted',0,600000);const first=JSON.parse(fs.readFileSync(progressFile));clock+=30000;
  advance('migration-schema-counted',0,600000);assert.equal(JSON.parse(fs.readFileSync(progressFile)).progressAt,first.progressAt);
  clock+=10000;advance('migration-schema-columns',0,600000);assert.equal(JSON.parse(fs.readFileSync(progressFile)).progressAt,clock);
  complete();
 }finally{Date.now=realNow;}
});
