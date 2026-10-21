import test from 'node:test';
import assert from 'node:assert/strict';
import {startLicenseRefresh}from '../license-refresh.mjs';
const NOW=Date.parse('2026-10-21T06:00:00Z');
function setup(status,refresh=async()=>{}){
 const timers=[],errors=[];let calls=0;
 const client={status:async()=>status,refresh:async()=>{calls++;return refresh()}};
 const scheduler=startLicenseRefresh({getClient:async()=>client,onError:error=>errors.push(error),now:()=>NOW,setTimer:(fn,delay)=>{const timer={fn,delay,unref(){}};timers.push(timer);return timer},clearTimer:()=>{}});
 return {scheduler,timers,errors,client,get calls(){return calls}};
}
test('active entitlement automatically checks authority after process restart',async()=>{
 const x=setup({state:'ACTIVE',authority:{configured:true,state:'NOT_CHECKED'}});
 assert.equal(x.timers[0].delay,2000);await x.scheduler.run();assert.equal(x.calls,1);assert.equal(x.timers.at(-1).delay,900000);x.scheduler.stop();
});
test('recent healthy authority is not called for every status check',async()=>{
 const x=setup({state:'ACTIVE',authority:{configured:true,state:'REACHABLE',last_checked_at:new Date(NOW-1000).toISOString()}});
 await x.scheduler.run();await x.scheduler.run();assert.equal(x.calls,0);x.scheduler.stop();
});
test('startup network failure retries with bounded backoff and recovers',async()=>{
 let online=false;const x=setup({state:'OFFLINE_GRACE',authority:{configured:true,state:'UNAVAILABLE'}},async()=>{if(!online)throw Error('offline fixture')});
 for(const delay of [30000,60000,120000,300000,900000,900000]){await x.scheduler.run();assert.equal(x.timers.at(-1).delay,delay)}
 online=true;await x.scheduler.run();assert.equal(x.timers.at(-1).delay,900000);online=false;await x.scheduler.run();assert.equal(x.timers.at(-1).delay,30000);x.scheduler.stop();
});
test('unconfigured revoked and invalid licenses never activate or refresh',async()=>{
 for(const state of ['NOT_CONFIGURED','REVOKED','INVALID']){
  const x=setup({state,authority:{configured:true,state:'NOT_CHECKED'}});await x.scheduler.run();assert.equal(x.calls,0);x.scheduler.stop();
 }
});
test('parallel timer triggers share one refresh',async()=>{
 let release;const done=new Promise(resolve=>release=resolve);const x=setup({state:'ACTIVE',authority:{configured:true,state:'NOT_CHECKED'}},()=>done);
 const first=x.scheduler.run(),second=x.scheduler.run();assert.equal(first,second);await Promise.resolve();await Promise.resolve();assert.equal(x.calls,1);release();await first;x.scheduler.stop();
});
test('startup database failure is retried; diagnostics failure cannot stop retries',async()=>{
 const timers=[];const scheduler=startLicenseRefresh({getClient:async()=>{throw Error('database starting')},onError:async()=>{throw Error('diagnostics not ready')},setTimer:(fn,delay)=>{timers.push(delay);return 1},clearTimer:()=>{}});
 await scheduler.run();assert.equal(timers.at(-1),30000);scheduler.stop();
});
