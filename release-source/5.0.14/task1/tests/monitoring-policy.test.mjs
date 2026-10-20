import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {isMonitoring,LEGACY_FIELDS,READ_ROUTES,READ_PERMISSIONS,monitoringOperation,redactMonitoring} from '../internal/monitoring-policy.mjs';
import {sessionRevocations} from '../internal/revoked-session.mjs';
import {registeredDefinition,reviewedDefinition} from '../internal/monitoring-routes.mjs';
import {createRequire} from 'node:module';

test('explicit role remains read-only with forged/manage permissions and ambiguous historic roles',()=>{
  assert.equal(isMonitoring({roles:['nyxagent'],permissions:{proxy_hosts:'manage'}}),true);
  assert.equal(isMonitoring({roles:['admin','nyxagent']}),true);
  assert.equal(isMonitoring({roles:['admin']}),false);
});
test('legacy preset recognized; ordinary scoped users retain identity',()=>{
  const permissions={visibility:'all',...Object.fromEntries(LEGACY_FIELDS.map(key=>[key,'view']))};
  assert.equal(isMonitoring({roles:[],permissions}),true);
  assert.equal(isMonitoring({roles:['admin'],permissions}),false);
  assert.equal(isMonitoring({roles:[],permissions:{...permissions,visibility:'user'}}),false);
});
test('all reviewed reads deny every mutation method and alternate mount',()=>{
  const reads=['/_nyxguard/lan-access/check','/users','/users/me','/users/2','/settings','/settings/sso','/nyxguard/rules/ip','/event-center/events','/vpn-client/sites/site-1','/professional-support/status','/professional-support/diagnostics','/update-manager/status','/nginx/certificates/2'];
  for(const route of reads)for(const prefix of ['','/api']){
    assert.equal(monitoringOperation('GET',prefix+route),true,route);
    for(const method of ['POST','PUT','PATCH','DELETE','HEAD','TRACE'])assert.equal(monitoringOperation(method,prefix+route),false,method+route);
  }
});
test('side-effecting GETs, secret exports, unknown routes and ambiguous paths fail closed',()=>{
  for(const route of ['/professional-support/bundle','/professional-support/bundle/abcd/download','/nginx/certificates/2/export','/nginx/certificates/test-http','/users/me/2fa','/new-monitoring-repair','/nyxguard/apps/2','/api//settings','/api/nyxguard/%61pps'])assert.equal(monitoringOperation('GET',route),false,route);
});
test('only same-scope refresh and logout session operations allowed',()=>{
  assert.equal(monitoringOperation('GET','/tokens',{scope:'user'}),true);
  for(const scope of ['admin','worker','job-board','2fa-challenge'])assert.equal(monitoringOperation('GET','/tokens',{scope}),false);
  assert.equal(monitoringOperation('POST','/tokens/logout'),true);
  assert.equal(monitoringOperation('POST','/developer-message'),true);
  assert.equal(monitoringOperation('POST','/tokens/recovery-reset'),false);
});
test('read permission list excludes mutation aliases and account administrative operations',()=>{
  for(const permission of ['settings:manage','settings:update','users:password','users:permissions','users:loginas','nyxguard:manage','proxy_hosts:manage','certificates:update'])assert.equal(READ_PERMISSIONS.has(permission),false);
  assert.equal(READ_PERMISSIONS.has('auditlog:list'),true);
});
test('nested and opaque credential values redacted without dropping state/order',()=>{
  const source={id:'api_token',value:'sensitive',enabled:false,clients:[{directive:'deny',address:'1.2.3.4'},{directive:'allow',address:'all'}],meta:JSON.stringify({password:'sensitive'}),config:{apiKey:'sensitive',certificate_key:'sensitive',smtpPassword:'sensitive',webhookUrl:'https://discord.com/api/webhooks/1/sensitive'},private_key:'sensitive',botUaTokens:'curl',certificate:['-----BEGIN','PRIVATE KEY-----sensitive'].join(' ')};
  const result=redactMonitoring(source);
  assert.equal(JSON.stringify(result).includes('sensitive'),false);
  assert.deepEqual(JSON.parse(JSON.stringify(result.clients)),source.clients);
  assert.equal(result.enabled,false);assert.equal(result.botUaTokens,'curl');
  assert.equal(source.private_key,'sensitive');
  assert.equal(redactMonitoring(new Date('2026-01-01T00:00:00Z')),'2026-01-01T00:00:00.000Z');
});
test('revocation survives a new reader, expires correctly and serializes concurrent logout',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'nyx-session-test-'));
  try{
    const file=path.join(dir,'revoked.json'),store=sessionRevocations(file);
    assert.equal(await store.revoked('one'),false);
    await Promise.all([store.revoke('one',Date.now()/1000+60),store.revoke('two',Date.now()/1000+60),store.revoke('expired',1)]);
    const fresh=sessionRevocations(file);
    assert.equal(await fresh.revoked('one'),true);assert.equal(await fresh.revoked('two'),true);assert.equal(await fresh.revoked('expired'),false);
    assert.equal((await fs.stat(file)).mode&0o077,0);
    const data=await fs.readFile(file,'utf8');assert.equal(data.includes('one'),false);
  }finally{await fs.rm(dir,{recursive:true,force:true});}
});

test('new GET actions cannot inherit permission from an overlapping dynamic read URL',()=>{
  const {Router}=createRequire('/app/package.json')('express');
  const root=Router(), settings=Router();let invoked=0;
  settings.get('/restart',()=>{invoked++;});
  settings.get('/:setting_id',()=>{invoked++;});
  root.use('/settings',settings);
  assert.equal(monitoringOperation('GET','/settings/restart'),true);
  assert.equal(reviewedDefinition('GET',registeredDefinition(root,'GET','/settings/restart')),false);
  assert.equal(reviewedDefinition('GET',registeredDefinition(root,'GET','/settings/default-site')),true);
  assert.equal(reviewedDefinition('GET',registeredDefinition(root,'GET','/new-operation')),false);
  assert.equal(invoked,0);
});
