import test from 'node:test';
import assert from 'node:assert/strict';
import {effectiveLevel,moduleOperation,operationGroup,GROUPS} from '../internal/module-policy.mjs';
import {personalOperation,monitoringOperation,redactMonitoring} from '../internal/monitoring-policy.mjs';
const member=(level)=>({id:12,roles:[],permissions:Object.fromEntries(GROUPS.map(group=>[group,level]))});
test('effective roles override stored module fields predictably',()=>{
  for(const group of GROUPS){
    assert.equal(effectiveLevel({...member('hidden'),roles:['admin']},group),'manage');
    assert.equal(effectiveLevel({...member('manage'),roles:['nyxagent']},group),'view');
    assert.equal(effectiveLevel({...member('manage'),roles:['admin','nyxagent']},group),'view');
  }
  assert.equal(effectiveLevel({roles:[],permissions:{}},'settings'),'hidden');
});
test('each current module has a backend group; view allows reads and hidden rejects them',()=>{
  const routes={'/nyxguard/summary':'nyxguard','/nyxguard/rules/ip':'nyxguard','/nyxguard/apps':'nyxguard','/web-threat/effective':'web_controls','/nginx/proxy-hosts':'proxy_hosts','/nginx/access-lists':'access_lists','/nginx/certificates':'certificates','/users':'users','/event-center/events':'auditlog','/settings':'settings','/vpn-client/sites':'settings','/professional-support/status':'settings','/update-manager/status':'settings'};
  for(const [path,group]of Object.entries(routes)){
    assert.equal(operationGroup(path),group);
    const view=member('hidden');view.permissions[group]='view';
    assert.equal(moduleOperation(view,'GET',path),true,path);
    assert.equal(moduleOperation(view,'POST',path),false,path);
    assert.equal(moduleOperation(member('hidden'),'GET',path),false,path);
  }
});
test('manage remains limited by role and sensitive-operation boundaries',()=>{
  const user=member('hidden');user.permissions.nyxguard='manage';user.permissions.settings='manage';
  assert.equal(moduleOperation(user,'POST','/nyxguard/rules/ip'),true);
  assert.equal(moduleOperation(user,'POST','/notifications'),true);
  assert.equal(moduleOperation(user,'POST','/vpn-client/sites'),true);
  for(const [method,path]of [['POST','/update-manager/apply'],['POST','/professional-support/activate'],['POST','/settings/backup/import'],['GET','/settings/backup/export'],['PUT','/users/12/permissions'],['PUT','/settings/sso-client-secret']])assert.equal(moduleOperation(user,method,path),false,path);
  assert.equal(moduleOperation(user,'POST','/web-threat/policy-sets/1/activate'),false);
});
test('personal writes require exact ownership and an explicit operation',()=>{
  const user={...member('hidden'),roles:['nyxagent']};
  for(const owner of ['me','12'])for(const [method,suffix]of [['PUT',''],['PUT','/auth'],['POST','/avatar'],['DELETE','/avatar']]){
    const path='/users/'+owner+suffix;
    assert.equal(personalOperation(12,method,path),true,path);
    assert.equal(monitoringOperation(method,path,{},12),true,path);
    assert.equal(moduleOperation(user,method,path),true,path);
    assert.equal(monitoringOperation(method,path,{},13),owner==='me',path);
  }
  for(const path of ['/users/13','/users/13/auth','/users/13/avatar','/users/me/permissions','/users/me/2fa','/users/12/login'])for(const method of ['POST','PUT','DELETE'])assert.equal(personalOperation(12,method,path),false,path);
});
test('hidden accounts retain identity/session metadata but no module data',()=>{
  const user=member('hidden');
  assert.equal(moduleOperation(user,'GET','/users/me'),true);
  assert.equal(moduleOperation(user,'GET','/users/13'),false);
  assert.equal(moduleOperation(user,'GET','/tokens',{scope:'admin'}),false);
  assert.equal(moduleOperation(user,'POST','/tokens/logout'),true);
  assert.equal(moduleOperation(user,'GET','/unknown'),false);
});
test('non-secret cookie policy remains structured while nested credentials are redacted',()=>{
  const result=redactMonitoring({cookieFlags:{secure:true,httpOnly:true,secret:'synthetic'},botUaTokens:'curl',sessionTimeoutSeconds:60,tokenConfigured:true,password:1234});
  assert.equal(result.cookieFlags.secure,true);
  assert.equal(result.cookieFlags.httpOnly,true);
  assert.equal(result.cookieFlags.secret,'[REDACTED]');
  assert.equal(result.botUaTokens,'curl');
  assert.equal(result.sessionTimeoutSeconds,60);
  assert.equal(result.tokenConfigured,true);
  assert.equal(result.password,'[REDACTED]');
});
