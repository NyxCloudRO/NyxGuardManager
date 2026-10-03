import test from 'node:test';
import assert from 'node:assert/strict';
import {keepRecent,newestFirst} from '../traffic-selection.mjs';
import {managerProcessDuration as duration} from '../manager-duration.mjs';
test('bounded newest-event selection equals stable full sort for timestamps, ties and late pages',()=>{
 let seed=31;const random=()=>((seed=(seed*1664525+1013904223)>>>0)%300);
 const input=Array.from({length:22000},(_,id)=>({ts:random(),id}));
 for(const [offset,limit] of [[0,5],[0,50],[100,100],[6000,100],[21000,1000]]){
  const heap=[];for(const row of input)keepRecent(heap,{...row},offset+limit);
  assert.ok(heap.length<=offset+limit);
  assert.deepEqual(heap.sort(newestFirst).slice(offset,offset+limit).map(e=>e.id),input.slice().sort((a,b)=>b.ts-a.ts).slice(offset,offset+limit).map(e=>e.id));
 }
});
test('Manager process duration boundaries do not conflate days, hours and minutes',()=>{
 for(const [seconds,expected] of [[0,'Less than a minute'],[59,'Less than a minute'],[60,'1 minute'],[3540,'59 minutes'],[3600,'1 hour'],[3660,'1 hour 1 minute'],[86340,'23 hours 59 minutes'],[86400,'1 day'],[90000,'1 day 1 hour'],[194400,'2 days 6 hours'],[1220400,'14 days 3 hours'],[864000000,'10000 days'],[-1,'Unavailable'],[NaN,'Unavailable']])assert.equal(duration(seconds),expected);
});
