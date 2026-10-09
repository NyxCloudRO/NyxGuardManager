import test from 'node:test';
import assert from 'node:assert/strict';
import {sanitizedFailure} from '/app/internal/handover-transaction.mjs';
const message='STARTUP_STALLED: completed migration work stopped or bounded work budget expired (phase=migration-schema, completed=0/600000, idleMs=45001, elapsedMs=60000, budgetMs=1800000)';
test('controlled startup work counters survive durable failure sanitization',()=>{
 const result=sanitizedFailure(new Error(message),'REPLACEMENT_STARTING');assert.deepEqual(result.startup,{phase:'migration-schema',completed:0,total:600000,idleMs:45001,elapsedMs:60000,budgetMs:1800000});assert.equal(result.phase,'REPLACEMENT_STARTING');
});
test('untrusted contents cannot enter startup diagnostics',()=>{for(const text of [message+' password=secret',message.replace('migration-schema','https://private.invalid/secret'),message.replace('45001','secret')]){const result=sanitizedFailure(new Error(text),'REPLACEMENT_STARTING');assert.equal(result.startup,undefined);assert.equal(result.message,'Upgrade gate failed; inspect the retained worker logs and transaction phase');}});
