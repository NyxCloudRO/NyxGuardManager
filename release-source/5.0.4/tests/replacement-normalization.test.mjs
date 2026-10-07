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
  const manager={Name:'/manager',Image:'new-image',State:{Running:false},Config:{Hostname:'old-manager-host',Healthcheck:{Test:['CMD','curl']},Labels:{'com.docker.compose.project':'test','com.docker.compose.service':'nyxguard-manager','com.docker.compose.project.config_files':'/opt/test/docker-compose.yml'}},HostConfig:{NetworkMode:'bridge'},NetworkSettings:{Networks:{bridge:{Aliases:[]}}}};
  const vpn={Name:'/vpn',Image:'vpn-image',State:{Running:false},Config:{Hostname:'generated-vpn-host',Env:['KEEP=1'],Labels:{'com.docker.compose.project':'test','com.docker.compose.service':'vpn-client-agent','com.docker.compose.project.config_files':'/opt/test/docker-compose.yml'}},HostConfig:{NetworkMode:'container:old-manager',CapAdd:['NET_ADMIN']}};
  const created=[];const env={NEW_MANAGER_ID:'old-manager',NEW_VPN_ID:'old-vpn',OLD_MANAGER_ID:'source-manager',OLD_VPN_ID:'source-vpn'};
  const context=vm.createContext({env,dockerHealthcheck:()=>health,encodeURIComponent,fs:{readFile:async()=>{const e=new Error();e.code='ENOENT';throw e;}},api:async(method,path,body)=>{
    if(method==='GET'){if(path.includes('source-')){const c=path.includes('source-manager')?manager:vpn;return {...c,Config:{...c.Config,Labels:{...c.Config.Labels,'com.docker.compose.config-hash':'a'.repeat(64)}}};}return path.includes('old-manager')?manager:vpn;}
    if(method==='DELETE')return {};
    assert.equal(method,'POST');
    // Docker rejects hostname with container network mode; independently reproduced against the real daemon.
    if(body.HostConfig.NetworkMode.startsWith('container:')&&body.Hostname)throw new Error('conflicting options: hostname and the network mode');
    created.push(body);return {Id:created.length===1?'new-manager':'new-vpn'};
  }});
  await vm.runInContext(normalizer+'; normalizeReplacement()',context);
  assert.equal(created.length,2);
  for(const c of created)assert.equal(c.Labels['com.docker.compose.config-hash'],'a'.repeat(64));
  assert.equal(created[1].Hostname,'');
  assert.equal(created[1].HostConfig.NetworkMode,'container:new-manager');
  assert.equal(created[1].Env[0],'KEEP=1');
  assert.equal(created[1].HostConfig.CapAdd[0],'NET_ADMIN');
  assert.equal(env.NEW_MANAGER_ID,'new-manager');assert.equal(env.NEW_VPN_ID,'new-vpn');
});


test('verified Compose-issued identity survives normalization without an unconditional recreation',async()=>{
  const health={Test:['CMD','node','/app/internal/readiness-probe.mjs']};
  const manager={Image:'target',Config:{Healthcheck:health,Labels:{'com.docker.compose.image':'target','com.docker.compose.config-hash':'b'.repeat(64)}}};
  const calls=[];const context=vm.createContext({env:{NEW_MANAGER_ID:'target'},dockerHealthcheck:()=>health,api:async(method,path)=>{calls.push([method,path]);return manager;}});
  await vm.runInContext(normalizer+'; normalizeReplacement()',context);
  assert.deepEqual(calls,[['GET','/containers/target/json']]);
});

test('missing hash is recovered only from the actual same-project/source-service identity before mutation',async()=>{
  const labels={'com.docker.compose.project':'test','com.docker.compose.service':'nyxguard-manager','com.docker.compose.project.config_files':'/opt/test/docker-compose.yml'};
  for(const broken of [{'com.docker.compose.project':'other'},{'com.docker.compose.service':'db'},{'com.docker.compose.project.config_files':'/opt/other/docker-compose.yml'},{'com.docker.compose.config-hash':''}]) {
    const calls=[];const manager={Config:{Labels:labels}};
    const old={Config:{Labels:{...labels,'com.docker.compose.config-hash':'c'.repeat(64),...broken}}};
    const context=vm.createContext({env:{NEW_MANAGER_ID:'target',OLD_MANAGER_ID:'source'},api:async(method,path)=>{calls.push(method);return path.includes('target')?manager:old;}});
    await assert.rejects(vm.runInContext(normalizer+'; normalizeReplacement()',context),/Compose (identity|config identity)/);
    assert.ok(calls.every(x=>x==='GET'));
  }
});

test('CLI handover carries actual Compose hash/project/service while replacing image provenance',async()=>{
  const cli=await fs.readFile(new URL('../../../upgrade/same-major-bootstrap.mjs',import.meta.url),'utf8');
  const begin=cli.indexOf('const safeLabels =');const end=cli.indexOf('\n\tconst managerConfig',begin);
  const context=vm.createContext({input:{'com.docker.compose.config-hash':'d'.repeat(64),'com.docker.compose.project':'test','com.docker.compose.service':'vpn-client-agent','com.docker.compose.image':'old-image','org.opencontainers.image.version':'5.0.1'}});
  const labels=vm.runInContext(cli.slice(begin,end)+'; safeLabels(input)',context);
  assert.equal(labels['com.docker.compose.config-hash'],'d'.repeat(64));assert.equal(labels['com.docker.compose.project'],'test');assert.equal(labels['com.docker.compose.service'],'vpn-client-agent');assert.equal(labels['com.docker.compose.image'],undefined);
});
