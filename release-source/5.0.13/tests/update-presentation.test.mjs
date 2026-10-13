import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
const context=vm.createContext({});vm.runInContext(fs.readFileSync(new URL('../frontend/update-presentation.js',import.meta.url),'utf8'),context);
const now=Date.parse('2026-10-12T08:00:00Z');
const baseline={current:'5.0.13',latest:null,latestPublished:'5.0.13',lastCheckAt:'2026-10-12T08:00:00Z',lastCheckError:null,stage:'idle',updateAvailable:false,latestCompatible:true};
const display=(delta={},options={})=>context.NyxUpdatePresentation({...baseline,...delta},{now,...options});
for(const [name,data,state] of [
 ['equal',{},'current'],['newer patch',{latest:'5.0.14',latestPublished:'5.0.14',updateAvailable:true},'available'],
 ['older stable response',{latestPublished:'5.0.12'},'current'],['development current',{current:'5.0.13-dev'},'current'],
 ['prerelease discovery excluded',{latest:'5.0.14-rc.1',latestPublished:'5.0.14-rc.1',updateAvailable:true},'unknown'],
 ['missing release',{latestPublished:null},'unknown'],['missing timestamp',{lastCheckAt:null},'unknown'],
 ['failed network cached update',{latest:'5.0.14',latestPublished:'5.0.14',updateAvailable:true,lastCheckError:'unavailable'},'unknown'],
 ['stale cache',{lastCheckAt:'2026-10-11T19:59:00Z'},'unknown'],['future check time',{lastCheckAt:'2026-10-12T08:10:00Z'},'unknown'],
 ['checking stage',{stage:'checking'},'checking'],['inconsistent target',{latest:'5.0.14',updateAvailable:true},'unknown'],
 ['missing availability',{updateAvailable:undefined},'unknown'],['recovery requires attention',{recoveryRequired:true},'unknown']
])test(name,()=>assert.equal(display(data).state,state));
test('failed query cannot show stale availability',()=>assert.equal(display({}, {error:true}).state,'unknown'));
test('active manual check is represented',()=>assert.equal(display({}, {checking:true}).state,'checking'));
test('manual refresh replaces unknown with confirmed state',()=>{assert.equal(display({lastCheckError:'unavailable'}).state,'unknown');assert.equal(display().label,'Up to date')});
test('post upgrade consumes reconciled state',()=>{assert.equal(display({current:'5.0.12',latest:'5.0.13',updateAvailable:true}).available,true);assert.equal(display().available,false)});

test('unverified platform suppresses notification',()=>assert.equal(display({latest:'5.0.14',latestPublished:'5.0.14',updateAvailable:true,latestCompatible:undefined}).available,false));
test('incompatible platform suppresses notification',()=>assert.equal(display({latest:'5.0.14',latestPublished:'5.0.14',updateAvailable:true,latestCompatible:false}).available,false));
test('verified cache follows the existing twelve hour schedule',()=>assert.equal(display({latest:'5.0.14',latestPublished:'5.0.14',updateAvailable:true,lastCheckAt:'2026-10-11T21:00:00Z'}).available,true));
