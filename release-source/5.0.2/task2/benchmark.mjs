import {performance} from 'node:perf_hooks';
import assert from 'node:assert/strict';
import {keepRecent,newestFirst} from './traffic-selection.mjs';
const input=Array.from({length:200000},(_,id)=>({ts:id%31003,id}));
for(const limit of [50,1000]){
 const run=optimized=>{const rows=[],start=performance.now(),originalLimit=Math.min(5000,Math.max(200,limit*3));
  for(const row of input){if(optimized)keepRecent(rows,{...row},limit);else{rows.push({...row});if(rows.length>originalLimit){rows.sort((a,b)=>b.ts-a.ts);rows.splice(originalLimit);}}}
  rows.sort(optimized?newestFirst:(a,b)=>b.ts-a.ts);return {ms:performance.now()-start,ids:rows.slice(0,limit).map(row=>row.id)};
 };
 const before=run(false),after=run(true);assert.deepEqual(after.ids,before.ids);
 console.log(JSON.stringify({events:input.length,limit,beforeMs:before.ms,afterMs:after.ms,outputEqual:true}));
}
