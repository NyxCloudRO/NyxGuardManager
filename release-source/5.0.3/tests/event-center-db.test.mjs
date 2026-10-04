// Run only against the isolated synthetic MariaDB fixture established by 5.0.2
// integrity tests. Refuses the DEV/PROD database identity.
import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import db from '/app/db.js';
import {up} from '/app/migrations/20261004000000_event_center_v2.js';
import {listEvents,clearEvents} from '/app/internal/event-store.mjs';
import {retainAuditHistory} from '/app/internal/audit-retention.mjs';
import {recordAccessDecision} from '/app/internal/access-audit.mjs';
import audit from '/app/internal/audit-log.js';
const k=db();let server,base,token;
async function api(route,method='GET',body,headers={}) {
 const response=await fetch(base+route,{method,headers:{...(token?{Authorization:'Bearer '+token}:{}),'Content-Type':'application/json',...headers},body:body?JSON.stringify(body):undefined});
 return {status:response.status,data:response.status===204?null:await response.json().catch(()=>null)};
}
before(async()=>{
 assert.equal(k.client.config.connection.host,'nyxguard-task1-db');assert.equal(k.client.config.connection.database,'task1_fixture');
 await up(k);await up(k);await (await import('/app/schema/index.js')).getCompiledSchema();
 const t=(await import('/app/models/token.js')).default();token=(await t.create({iss:'api',attrs:{id:1},scope:['user','admin'],expiresIn:'1h'})).token;
 server=(await import('/app/app.js')).default.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));base=`http://127.0.0.1:${server.address().port}/api`;
 await k('audit_log').delete();
});
after(async()=>{await new Promise(r=>server.close(r));await k.destroy();});
test('real access checks aggregate absent sessions while supplied invalid sessions stay individual',async()=>{
 const threatBefore=await k('nyxguard_attack_event').count({n:'*'}).first();
 for(let i=0;i<30;i++) assert.equal((await api('/nginx/access-portal/check?list=5','GET',null,{'X-NyxGuard-Original-Host':'audit-fixture.invalid','User-Agent':'SyntheticMonitor','X-Real-IP':'192.0.2.50'})).status,401);
 await new Promise(r=>setTimeout(r,200));
 const buckets=await k('audit_log').where('object_type','access-check');
 assert.equal(buckets.length,1);assert.equal(Number(buckets[0].event_count),30);assert.equal(buckets[0].object_id,5);
 const meta=JSON.parse(buckets[0].meta);assert.equal(meta.reason_code,'session_absent');assert.equal(meta.source_ip,'192.0.2.50');
 for(let i=0;i<3;i++)await api('/nginx/access-portal/check?list=5&token=invalid-synthetic-session','GET',null,{'X-NyxGuard-Original-Host':'audit-fixture.invalid'});
 await new Promise(r=>setTimeout(r,200));
 assert.equal((await k('audit_log').where('object_type','access-check').whereNull('noise_key')).length,3);
 assert.deepEqual(await k('nyxguard_attack_event').count({n:'*'}).first(),threatBefore);
});
test('concurrent grouping is durable and exact; different resource/source is separate',async()=>{
 const request={headers:{host:'race-fixture.invalid','x-real-ip':'192.0.2.90','user-agent':'Synthetic'},socket:{remoteAddress:'127.0.0.1'},query:{}};
 await Promise.all(Array.from({length:100},()=>recordAccessDecision(k,request,'token_unverified',{listId:7})));
 const rows=await k('audit_log').where('object_id',7);assert.equal(rows.length,1);assert.equal(Number(rows[0].event_count),100);
 await recordAccessDecision(k,{...request,headers:{...request.headers,'x-real-ip':'192.0.2.91'}},'token_unverified',{listId:7});
 assert.equal((await k('audit_log').where('object_id',7)).length,2);
});
test('normal refresh produces no audit write; explicit scoped issuance and logout remain meaningful',async()=>{
 const before=await k('audit_log').count({n:'*'}).first();
 assert.equal((await api('/tokens')).status,200);assert.deepEqual(await k('audit_log').count({n:'*'}).first(),before);
 assert.equal((await api('/tokens?scope=worker')).status,200);
 const issued=await k('audit_log').where('action','token_issued').first();assert.equal(issued.user_id,1);
 assert.equal((await api('/tokens/logout','POST')).status,204);
 assert.equal((await k('audit_log').where('action','logout').first()).user_id,1);
 // Successful login remains an individually attributed event.
 const {default:authModel}=await import('/app/models/auth.js');
 await k('auth').where('user_id',1).where('type','password').delete();
 await authModel.query().insert({user_id:1,type:'password',secret:'valid-synthetic-password',meta:{}});
 assert.equal((await api('/tokens','POST',{identity:'fixture@example.invalid',secret:'valid-synthetic-password'})).status,200);
 assert.equal((await k('audit_log').where('action','login_success').first()).user_id,1);
 assert.equal((await api('/users/me')).status,200);
 // Invalid credentials remain individual failed-login rows.
 assert.equal((await api('/tokens','POST',{identity:'fixture@example.invalid',secret:'invalid-synthetic-password'})).status,400);
 assert.ok(await k('audit_log').where('action','login_failed').first());
});
test('actor spoofing is rejected; system attribution stays distinct and context excludes secrets',async()=>{
 await audit.add({token:{getUserId:()=>1}},{user_id:999,actor_kind:'system',action:'audit_fixture',object_type:'user',object_id:1,meta:{name:'Synthetic administrator',token:'secret-fixture',password:'secret-fixture',body:{secret:'secret-fixture'}}});
 const row=await k('audit_log').where('action','audit_fixture').first();assert.equal(row.user_id,1);assert.equal(row.actor_kind,'user');assert.doesNotMatch(row.meta,/secret-fixture/);
 await assert.rejects(audit.add({token:{getUserId:()=>0}},{user_id:1,action:'spoofed',object_type:'user'}));
 await audit.addSystem(null,{action:'system_fixture',object_type:'certificate',object_id:2,meta:{}});
 assert.equal((await listEvents(k,{hours:0,actorKind:'system',action:'system_fixture'})).items[0].actor,'System');
});
test('clear uses every selected filter and occurrence counters, preserving outside scope and threat telemetry',async()=>{
 const beforeThreat=await k('nyxguard_attack_event').count({n:'*'}).first();
 const scope={category:'access',actor:0,actorKind:'unauthenticated',action:'deny',result:'denied',search:'audit-fixture.invalid',hours:24};
 const selected=await listEvents(k,scope);assert.equal(selected.total,4);assert.equal(selected.occurrences,33);
 const outside=await k('audit_log').whereNotIn('id',selected.items.map(r=>r.id)).pluck('id');
 const cleared=await api('/event-center/clear','POST',{...scope,confirm:true,user_id:999});assert.equal(cleared.status,200);assert.equal(cleared.data.deleted,4);
 assert.equal((await listEvents(k,scope)).total,0);assert.equal((await listEvents(k,scope)).occurrences,0);
 assert.deepEqual(await k('audit_log').orderBy('id').pluck('id'),outside.sort((a,b)=>a-b));
 assert.deepEqual(await k('nyxguard_attack_event').count({n:'*'}).first(),beforeThreat);
 assert.equal((await api('/event-center/clear','POST',{...scope,confirm:false})).status,400);
 assert.equal((await api('/event-center/events?actorKind=admin')).status,400);
});
test('bounded retention deletes only old audit rows and leaves Threat Activity and new rows intact',async()=>{
 await k('setting').where('id','audit-log-retention-days').update({value:'180'});
 const beforeThreat=await k('nyxguard_attack_event').count({n:'*'}).first();
 const old={user_id:0,object_type:'maintenance-fixture',object_id:0,category:'application',actor_kind:'system',action:'retention_fixture',result:'success',meta:'{}',created_on:new Date(Date.now()-181*86400000),modified_on:k.fn.now()};
 for(let i=0;i<11;i++)await k('audit_log').insert(Array.from({length:100},()=>({...old})));
 const recentId=(await k('audit_log').insert({...old,created_on:k.fn.now()}))[0];
 const result=await retainAuditHistory(k);assert.equal(result.deleted,1000);
 assert.equal(Number((await k('audit_log').where('action','retention_fixture').count({n:'*'}).first()).n),101);
 await retainAuditHistory(k);assert.ok(await k('audit_log').where('id',recentId).first());
 assert.deepEqual(await k('nyxguard_attack_event').count({n:'*'}).first(),beforeThreat);
});
