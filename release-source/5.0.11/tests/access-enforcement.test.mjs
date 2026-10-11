import {test} from 'node:test';
import assert from 'node:assert/strict';
import {activated, createAcknowledgedReload} from '../internal/nginx-reload.mjs';
const worker = (identity, shuttingDown = false, listeners = ['100']) => ({identity, shuttingDown, listeners, sockets:listeners.map(() => ({port:80,listening:!shuttingDown}))});
const before = {master: 10, workers: [worker('11:1')]};
test('signal delivery and overlapping listeners do not imply activation', () => {
  assert.equal(activated(before, before), false);
  assert.equal(activated(before, {master:10,workers:[worker('11:1',true),worker('12:2')]}), false);
  assert.equal(activated(before, {master:10,workers:[worker('11:1',false,[]),worker('12:2')]}), false);
});
test('replacement requires a listening new worker and old proxy sockets drained', () => {
  assert.equal(activated(before, {master:10,workers:[worker('11:1',true,[]),worker('12:2')]}), true);
  assert.equal(activated(before, {master:10,workers:[worker('12:2')]}), true);
  assert.equal(activated(before, {master:20,workers:[worker('12:2')]}), false);
  assert.equal(activated(before, {master:10,workers:[]}), false);
});
test('success waits for observed enforcement; concurrent reloads serialize', async () => {
  let generation = 1, signals = 0, waits = 0;
  const reload = createAcknowledgedReload({observe:async()=>({master:10,workers:[worker('11:'+generation)]}),pause:async()=>{waits++;generation++;}});
  await Promise.all([reload(async()=>{signals++;}),reload(async()=>{signals++;})]);
  assert.equal(signals,2);assert.equal(waits,2);
});
test('deadline reports uncertain partial application; failure does not poison queue', async () => {
  let now = 0;
  const reload = createAcknowledgedReload({observe:async()=>before,pause:async()=>{now+=10;},clock:()=>now,timeoutMs:20});
  await assert.rejects(reload(async()=>{}),error=>error.code==='NGINX_RELOAD_ACTIVATION_TIMEOUT' && error.outcome==='partially_completed');
  await assert.rejects(reload(async()=>{throw new Error('signal failure');}),/signal failure/);
});

// Real admin requests are themselves served by a retiring Nginx worker.
// Permit only drained proxy sockets; an old listener or client is unsafe.
test('admin response can drain only after old proxy listeners and clients close', () => {
  const old = {master:10, workers:[{...worker('11:1'),sockets:[{port:80,listening:true},{port:443,listening:true},{port:8443,listening:true}]}]};
  const next = {master:10,workers:[{...worker('11:1',true),sockets:[{port:8443,listening:false},{port:3000,listening:false}]},worker('12:2')]};
  assert.equal(activated(old,next),true);
  next.workers[0].sockets.push({port:80,listening:true});
  assert.equal(activated(old,next),false);
  next.workers[0].sockets.at(-1).listening=false;
  assert.equal(activated(old,next),false,'active old proxy connection prevents success');
  next.workers[0].sockets.pop();next.workers[0].shuttingDown=false;
  assert.equal(activated(old,next),false);
});

test('unreadable sockets or an unready replacement cannot confirm enforcement', () => {
  assert.equal(activated(before,{master:10,workers:[{...worker('12:2'),sockets:[]}]}),false);
  assert.equal(activated(before,{master:10,workers:[{...worker('12:2'),sockets:[{port:'unknown',listening:true}]}]}),false);
  assert.equal(activated({master:10,workers:[{...worker('11:1'),sockets:[{port:'unknown',listening:true}]}]},
    {master:10,workers:[worker('12:2')]}),false);
});

test('unreadable baseline blocks signal delivery with truthful failed outcome', async () => {
  let now=0,signals=0;
  const reload=createAcknowledgedReload({observe:async()=>({master:10,workers:[{...worker('11:1'),sockets:[{port:'unknown',listening:true}]}]}),pause:async()=>{now+=10;},clock:()=>now,timeoutMs:20});
  await assert.rejects(reload(async()=>{signals++;}),error=>error.code==='NGINX_RELOAD_ACTIVATION_TIMEOUT' && error.outcome==='failed');
  assert.equal(signals,0);
});
