import test from 'node:test';
import assert from 'node:assert/strict';
import {accessDecision} from '../internal/access-audit.mjs';
import {auditFields,sanitizeContext} from '../internal/audit-policy.mjs';
import {retentionDays} from '../internal/audit-retention.mjs';
import {normalizeScope} from '../internal/event-store.mjs';
const req={headers:{host:'fixture.invalid','x-real-ip':'192.0.2.1','user-agent':'SyntheticMonitor'},socket:{remoteAddress:'127.0.0.1'},query:{}};
test('no-session decisions aggregate per five-minute source/resource bucket, retaining actor and count',()=>{
 const a=accessDecision(req,'token_unverified',{listId:5},600000);
 assert.equal(a.object_id,5);assert.equal(a.user_id,0);assert.equal(a.actor_kind,'unauthenticated');assert.equal(a.event_count,1);
 assert.equal(a.noise_key,accessDecision(req,'token_unverified',{listId:5},601000).noise_key);
 assert.notEqual(a.noise_key,accessDecision(req,'token_unverified',{listId:5},900000).noise_key);
 assert.notEqual(a.noise_key,accessDecision(req,'token_unverified',{listId:6},600000).noise_key);
 assert.equal(JSON.parse(a.meta).reason_code,'session_absent');
});
test('any supplied credentials and security-relevant denial reasons remain individual',()=>{
 for(const input of [{query:{token:'synthetic'}},{headers:{...req.headers,cookie:'nyxguard_access=synthetic'}},{headers:{...req.headers,cookie:'__Host-nyxguard_access=synthetic'}},{headers:{...req.headers,'x-nyxguard-access-token':'synthetic'}}])
  assert.equal(accessDecision({...req,...input},'token_unverified',{listId:5}).noise_key,null);
 for(const reason of ['user_missing','hash_mismatch','check_exception']) assert.equal(accessDecision(req,reason,{parsedList:5}).noise_key,null);
});
test('source/actor attribution rejects client impersonation and untrusted forwarded identity',()=>{
 const row=accessDecision({...req,socket:{remoteAddress:'192.0.2.2'}},'token_unverified',{listId:5,user_id:123});
 assert.equal(JSON.parse(row.meta).source_ip,'192.0.2.2');assert.equal(row.user_id,0);
 assert.equal(auditFields({token:{getUserId:()=>1}},{user_id:123,actor_kind:'system',action:'updated',object_type:'user'}).user_id,1);
 assert.throws(()=>auditFields({token:{getUserId:()=>0}},{action:'updated'}),/actor/);
});
test('context allows safe structured fields without credentials, bodies or URL queries',()=>{
 assert.deepEqual(sanitizeContext({source_ip:'192.0.2.1',resource:'/safe/resource',password:'synthetic',token:'synthetic',cookie:'synthetic',api_key:'synthetic',body:{secret:'synthetic'},correlation_id:'audit-1'}),{source_ip:'192.0.2.1',resource:'/safe/resource',correlation_id:'audit-1'});
 assert.deepEqual(sanitizeContext({resource:'/path?token=synthetic',source_ip:'not an IP',correlation_id:'contains spaces'}),{});
});
test('retention preserves explicit policy and bounds invalid configuration',()=>{
 assert.equal(retentionDays(undefined),180);assert.equal(retentionDays('180'),180);assert.equal(retentionDays('0'),0);
 for(const value of ['invalid',-1,1.5,36501])assert.equal(retentionDays(value),180);
});
test('actor-kind and result scope validate identically for list and physical clear',()=>{
 const s=normalizeScope({actorKind:'unauthenticated',result:'denied',category:'access'});
 assert.equal(s.actorKind,'unauthenticated');assert.equal(s.result,'denied');
 assert.throws(()=>normalizeScope({actorKind:'admin'}));assert.throws(()=>normalizeScope({result:'pretend'}));
});

test('safe human targets retain object identity without copying credential-bearing object fields',()=>{
 const row=auditFields({token:{getUserId:()=>1}},{action:'created',object_type:'proxy-host',object_id:17,meta:{domain_names:['example.invalid'],forward_host:'private-upstream',password:'synthetic'}});
 assert.deepEqual(row.meta,{name:'example.invalid'});assert.equal(row.object_id,17);
});
