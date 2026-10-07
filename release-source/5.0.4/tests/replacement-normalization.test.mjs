import fs from 'node:fs/promises';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {test} from 'node:test';

const source=await fs.readFile(new URL('../internal/update-handover.js',import.meta.url),'utf8');
const start=source.indexOf('async function normalizeReplacement()');
const end=source.indexOf('\nasync function ',start+1);
const normalizer=source.slice(start,end);

test('legacy VPN replacement inherits Manager hostname while keeping its new namespace',async()=>{
  const health={Test:['CMD','node','/app/internal/readiness-probe.mjs']};
  const manager={Name:'/manager',Image:'new-image',State:{Running:false},Config:{Hostname:'old-manager-host',Healthcheck:{Test:['CMD','curl']},Labels:{}},HostConfig:{NetworkMode:'bridge'},NetworkSettings:{Networks:{bridge:{Aliases:[]}}}};
  const vpn={Name:'/vpn',Image:'vpn-image',State:{Running:false},Config:{Hostname:'generated-vpn-host',Env:['KEEP=1']},HostConfig:{NetworkMode:'container:old-manager',CapAdd:['NET_ADMIN']}};
  const created=[];const env={NEW_MANAGER_ID:'old-manager',NEW_VPN_ID:'old-vpn'};
  const context=vm.createContext({env,dockerHealthcheck:()=>health,encodeURIComponent,fs:{readFile:async()=>{const e=new Error();e.code='ENOENT';throw e;}},api:async(method,path,body)=>{
    if(method==='GET')return path.includes('old-manager')?manager:vpn;
    if(method==='DELETE')return {};
    assert.equal(method,'POST');
    // Docker rejects hostname with container network mode; independently reproduced against the real daemon.
    if(body.HostConfig.NetworkMode.startsWith('container:')&&body.Hostname)throw new Error('conflicting options: hostname and the network mode');
    created.push(body);return {Id:created.length===1?'new-manager':'new-vpn'};
  }});
  await vm.runInContext(normalizer+'; normalizeReplacement()',context);
  assert.equal(created.length,2);
  assert.equal(created[1].Hostname,'');
  assert.equal(created[1].HostConfig.NetworkMode,'container:new-manager');
  assert.equal(created[1].Env[0],'KEEP=1');
  assert.equal(created[1].HostConfig.CapAdd[0],'NET_ADMIN');
  assert.equal(env.NEW_MANAGER_ID,'new-manager');assert.equal(env.NEW_VPN_ID,'new-vpn');
});
