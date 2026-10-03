import {test, before, after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import db from '/app/db.js';
import {up} from '/app/migrations/20261003000000_event_integrity.js';
import {backfillLegacyHistory} from '/app/internal/legacy-history.mjs';
import {auditFields, sanitizeContext, systemAuditFields} from '/app/internal/audit-policy.mjs';
import {listEvents, clearEvents, normalizeScope} from '/app/internal/event-store.mjs';
import {expireSecurityState, retainHistory} from '/app/internal/security-lifecycle.mjs';
const k=db();
const source=Date.UTC(2026,3,27,7,3,40,123);
const legacy = (id,type,producer='nyxguard_attack_monitor')=>({id,ts:new Date(source+id),category:'inbound',rule_id:'inbound.'+type,action:'block',reason:'fixture',src_ip:'192.0.2.'+id,meta:JSON.stringify({source:producer,method:'GET',host:'fixture.invalid',uri:'/fixture',status:403})});
let initialIds=[];
before(async()=>{
  assert.equal(process.env.DB_MYSQL_HOST,'nyxguard-task1-db','Fixture refuses any other database host');
  assert.equal(k.client.config.connection.host,'nyxguard-task1-db','Validate effective connection, not just environment');
  assert.equal(k.client.config.connection.database,'task1_fixture','Fixture refuses any other database');
  const schema=JSON.parse(await fs.readFile('/app/fixture-schema.json','utf8'));
  for(const ddl of schema) await k.schema.dropTableIfExists(ddl.match(/CREATE TABLE `([^`]+)`/)[1]);
  for (const ddl of schema) await k.raw(ddl.replace(/AUTO_INCREMENT=\d+/g,''));
  await k('user').insert({id:1,name:'Fixture administrator',nickname:'Fixture',email:'fixture@example.invalid',roles:'["admin"]',avatar:'',is_deleted:0,created_on:k.fn.now(),modified_on:k.fn.now()});
  await (await import('/app/models/user_permission.js')).default.query().insert({user_id:1,visibility:'all',proxy_hosts:'manage',redirection_hosts:'manage',dead_hosts:'manage',streams:'manage',access_lists:'manage',certificates:'manage',nyxguard:'manage',web_controls:'manage',users:'manage',auditlog:'manage',settings:'manage'});
  await k('web_threat_events').insert([legacy(1,'bot'),legacy(2,'bot'),legacy(3,'bot'),legacy(4,'sqli'),legacy(5,'bot','native_fixture')]);
  await up(k);
});
after(async()=>{await k.destroy();});
test('legacy history: types, millisecond timestamp, verification, native preservation and rerun',async()=>{
 const rows=await k('nyxguard_attack_event').orderBy('legacy_web_threat_id');
 assert.equal(rows.length,4);assert.deepEqual(rows.map(r=>r.attack_type),['bot','bot','bot','sqli']);
 assert.equal(new Date(rows[0].created_on).getTime(),source+1);
 assert.equal(rows[0].method,'GET');assert.equal(rows[0].ban_rule_id,null);
 assert.equal((await k('web_threat_events').select('*')).length,1);
 assert.deepEqual(await backfillLegacyHistory(k),{copied:0,removed:0});await up(k);
 assert.equal(Number((await k('nyxguard_attack_event').count({n:'*'}))[0].n),4);
 await retainHistory(k);assert.equal(Number((await k('nyxguard_attack_event').count({n:'*'}))[0].n),4);
});
test('failed canonical verification cannot delete source; existing equivalent is adopted',async()=>{
 await k('web_threat_events').insert(legacy(6,'sqli'));
 const [id]=await k('nyxguard_attack_event').insert({legacy_web_threat_id:6,attack_type:'bot',ip:'192.0.2.6',created_on:new Date(source+6)});
 await assert.rejects(backfillLegacyHistory(k),/verification failed/);
 assert.ok(await k('web_threat_events').where('id',6).first());
 await k('nyxguard_attack_event').where('id',id).delete();
 await k('nyxguard_attack_event').insert({attack_type:'sqli',ip:'192.0.2.6',created_on:new Date(source+6),host:'fixture.invalid',method:'GET',uri:'/fixture',status:403});
 assert.deepEqual(await backfillLegacyHistory(k),{copied:0,removed:1});
});
test('server actor wins over spoof; persistence excludes secrets and arbitrary nested context',async()=>{
 const access={token:{getUserId:()=>1}};
 const row=auditFields(access,{user_id:999,action:'created',object_type:'user',object_id:2,meta:{name:'Fixture user',password:'sensitive-fixture',password_hash:'sensitive-fixture',token:'sensitive-fixture',cookies:'sensitive-fixture',private_key:'sensitive-fixture',nested:{secret:'sensitive-fixture'},webhook_secret:'sensitive-fixture'}});
 assert.equal(row.user_id,1);assert.equal(row.category,'users');assert.deepEqual(row.meta,{name:'Fixture user'});
 assert.throws(()=>auditFields({token:{getUserId:()=>0}},{action:'created'}),/actor/);
 const [id]=await k('audit_log').insert({...row,meta:JSON.stringify(row.meta),created_on:k.fn.now(),modified_on:k.fn.now()});
 assert.doesNotMatch((await k('audit_log').where('id',id).first()).meta,/sensitive-fixture/);
 assert.equal(systemAuditFields({action:'created',object_type:'user',object_id:2}).actor_kind,'system');
 assert.equal(systemAuditFields({action:'created',object_type:'user',user_id:999}).user_id,0);
 assert.deepEqual(sanitizeContext({password:'x',enabled:false,id:3,request:{secret:'x'}}),{enabled:false,id:3});
});
test('actor/action/category and 24h/7d filters; physical scoped clear and unrelated histories',async()=>{
 await k('audit_log').delete();
 for (const [category,action,hours] of [['users','created',1],['users','updated',48],['users','deleted',192],['configuration','created',1],['access','deny',1]]) {
  const [id]=await k('audit_log').insert({user_id:1,object_id:1,object_type:category==='users'?'user':'proxy-host',category,action,result:'success',meta:'{}',created_on:new Date(Date.now()-hours*3600000),modified_on:k.fn.now()});initialIds.push(id);
 }
 assert.equal((await listEvents(k,{category:'users',actor:1,hours:24})).total,1);
 assert.equal((await listEvents(k,{category:'users',search:'Fixture administrator',hours:24})).total,1);
 assert.equal((await listEvents(k,{category:'users',actor:1,hours:168})).total,2);
 assert.equal((await listEvents(k,{category:'users',actor:1,hours:168,action:'updated'})).total,1);
 const beforeThreat=Number((await k('nyxguard_attack_event').count({n:'*'}))[0].n), beforeWeb=Number((await k('web_threat_events').count({n:'*'}))[0].n);
 assert.equal((await clearEvents(k,{category:'users',actor:1,hours:24,action:'created'})).deleted,1);
 assert.equal(await k('audit_log').where('id',initialIds[0]).first(),undefined);
 assert.equal((await listEvents(k,{hours:0})).total,4);
 assert.equal((await clearEvents(k,{category:'all',hours:0})).deleted,4);
 assert.equal(Number((await k('audit_log').count({n:'*'}))[0].n),0);
 assert.equal(Number((await k('nyxguard_attack_event').count({n:'*'}))[0].n),beforeThreat);
 assert.equal(Number((await k('web_threat_events').count({n:'*'}))[0].n),beforeWeb);
 assert.throws(()=>normalizeScope({hours:12}),/window/);
});
test('different Manager/database clocks: real Date expiry and exact database audit windows',async()=>{
 const now=Date.now(), [expired]=await k('nyxguard_ip_rule').insert({rule_origin:'automatic_ban',enabled:1,action:'deny',ip_cidr:'192.0.2.90',expires_on:new Date(now-1000),created_on:k.fn.now(),modified_on:k.fn.now()});
 const [active]=await k('nyxguard_ip_rule').insert({rule_origin:'automatic_ban',enabled:1,action:'deny',ip_cidr:'192.0.2.91',expires_on:new Date(now+60000),created_on:k.fn.now(),modified_on:k.fn.now()});
 await expireSecurityState(k,now);assert.equal(await k('nyxguard_ip_rule').where('id',expired).first(),undefined);assert.ok(await k('nyxguard_ip_rule').where('id',active).first());
 await k('nyxguard_ip_rule').where('id',active).delete();
 for (const hours of [23,25,167,169])await k('audit_log').insert({user_id:1,object_id:90,object_type:'user',category:'users',action:'timezone_probe',result:'success',meta:'{}',created_on:k.raw('DATE_SUB(NOW(), INTERVAL ? HOUR)',[hours]),modified_on:k.fn.now()});
 assert.equal((await listEvents(k,{action:'timezone_probe',hours:24})).total,1);
 assert.equal((await listEvents(k,{action:'timezone_probe',hours:168})).total,3);
 const event=(await listEvents(k,{action:'timezone_probe',hours:24})).items[0];assert.ok(Math.abs(Date.parse(event.timestamp)-(Date.now()-23*3600000))<5000);
 await k('audit_log').where('action','timezone_probe').delete();
 const [recent]=await k('audit_log').insert({user_id:1,object_id:90,object_type:'user',category:'users',action:'retention_probe',result:'success',meta:'{}',created_on:k.raw('DATE_SUB(NOW(), INTERVAL ? HOUR)',[180*24-1]),modified_on:k.fn.now()});
 const [old]=await k('audit_log').insert({user_id:1,object_id:90,object_type:'user',category:'users',action:'retention_probe',result:'success',meta:'{}',created_on:k.raw('DATE_SUB(NOW(), INTERVAL ? HOUR)',[180*24+1]),modified_on:k.fn.now()});
 await retainHistory(k);assert.ok(await k('audit_log').where('id',recent).first());assert.equal(await k('audit_log').where('id',old).first(),undefined);
 await k('audit_log').where('id',recent).delete();
});
test('automatic expiry exact boundary; manual/disabled/permanent remain; crawler expiry',async()=>{
 await k('nyxguard_ip_rule').delete();
 const insert=async(origin,enabled,expiry,action='deny')=>{const [id]=await k('nyxguard_ip_rule').insert({rule_origin:origin,enabled,expires_on:expiry,action,ip_cidr:'192.0.2.10',created_on:k.fn.now(),modified_on:k.fn.now(),note:origin==='manual'?'Manual ban (Attacks)':'fixture'});return id;};
 const expired=await insert('automatic_ban',1,k.fn.now()),crawler=await insert('verified_crawler',1,k.fn.now(),'allow');
 const active=await insert('automatic_ban',1,new Date(Date.now()+60000));
 const manual=await insert('manual',1,k.fn.now()),disabled=await insert('manual',0,k.fn.now()),permanent=await insert('manual',1,null),autoPermanent=await insert('automatic_ban',1,null);
 assert.equal(await expireSecurityState(k),2);assert.equal(await expireSecurityState(k),0);
 assert.equal(await k('nyxguard_ip_rule').where('id',expired).first(),undefined);assert.equal(await k('nyxguard_ip_rule').where('id',crawler).first(),undefined);
 assert.deepEqual((await k('nyxguard_ip_rule').orderBy('id').pluck('id')),[active,manual,disabled,permanent,autoPermanent]);
});
test('actual monitor: missing/unchanged/empty logs still expire; detections have one canonical store',async()=>{
 const {runPollOnce,upsertAutoBanRule,upsertVerifiedCrawlerAllowRule}=await import('/app/internal/attack-monitor.js');
 await fs.mkdir('/data/logs',{recursive:true});
 const [id]=await k('nyxguard_ip_rule').insert({rule_origin:'automatic_ban',enabled:1,action:'deny',ip_cidr:'192.0.2.20',expires_on:k.fn.now(),created_on:k.fn.now(),modified_on:k.fn.now()});
 await fs.rm('/data/logs/nyxguard_attacks.log',{force:true});await runPollOnce();assert.equal(await k('nyxguard_ip_rule').where('id',id).first(),undefined);
 const manual=await k('nyxguard_ip_rule').where('rule_origin','manual').first();
 await upsertAutoBanRule(k,manual.ip_cidr,'bot',new Date(Date.now()+86400000),'fixture.invalid');
 assert.equal((await k('nyxguard_ip_rule').where('id',manual.id).first()).rule_origin,'manual');
 await fs.writeFile('/data/logs/nyxguard_attacks.log','');
 const made=await upsertAutoBanRule(k,'192.0.2.25','bot',new Date(Date.now()+60000),'fixture.invalid');assert.equal(made.changed,true);
 assert.ok(await k('nyxguard_ip_rule').where('id',made.id).first());
 await k('nyxguard_ip_rule').where('id',made.id).update({expires_on:k.fn.now()});await runPollOnce();assert.equal(await k('nyxguard_ip_rule').where('id',made.id).first(),undefined);
 const crawler=await upsertVerifiedCrawlerAllowRule(k,'192.0.2.26','google',new Date(Date.now()+60000));
 await k('nyxguard_ip_rule').where('id',crawler.id).update({expires_on:k.fn.now()});await runPollOnce();assert.equal(await k('nyxguard_ip_rule').where('id',crawler.id).first(),undefined);
 const webBefore=Number((await k('web_threat_events').count({n:'*'}))[0].n);
 await fs.writeFile('/data/logs/nyxguard_attacks.log',['bot','sqli','ddos'].map((type,i)=>JSON.stringify({type,ip:'192.0.2.'+(40+i),ts:new Date().toISOString(),host:'fixture.invalid',method:'GET',uri:'/fixture',status:403,auth:true})).join('\n')+'\n');
 await runPollOnce();
 assert.equal((await k('nyxguard_attack_event').whereIn('ip',['192.0.2.40','192.0.2.41','192.0.2.42'])).length,3);
 assert.equal(Number((await k('web_threat_events').count({n:'*'}))[0].n),webBefore);
 const audit = await import('/app/internal/audit-log.js');
 const access={token:{getUserId:()=>1}};
 for(const action of ['created','updated','deleted']) await audit.default.add(access,{user_id:999,action,object_type:'ip-rule',object_id:42,meta:{password:'sensitive-fixture'}});
 const rows=await k('audit_log').select('*');assert.equal(rows.length,3);assert.ok(rows.every(r=>r.user_id===1&&r.category==='security'&&r.result==='success'&&r.meta==='{}'));
});
test('authenticated APIs: audit filters/clear preserve threat and native stats; manual list lifecycle',async()=>{
 const Token=(await import('/app/models/token.js')).default();
 const {token}=await Token.create({iss:'api',attrs:{id:1},scope:['user'],expiresIn:'1h'});
 const app=(await import('/app/app.js')).default;
 const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
 const base=`http://127.0.0.1:${server.address().port}/api`;
 async function api(route,method='GET',body) {const r=await fetch(base+route,{method,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});return {status:r.status,data:r.status===204?null:await r.json()};}
 try {
  assert.equal((await api('/event-center/events?hours=168&category=security&actor=1')).data.total,3);
  const webCount=Number((await k('web_threat_events').count({n:'*'}))[0].n),threatCount=Number((await k('nyxguard_attack_event').count({n:'*'}))[0].n);
  assert.equal((await api('/event-center/clear','POST',{category:'all',hours:0})).status,400);
  assert.equal((await api('/event-center/clear','POST',{category:'security',hours:168,actor:1,confirm:true})).data.deleted,3);
  assert.equal(Number((await k('audit_log').count({n:'*'}))[0].n),0);
  assert.equal(Number((await k('web_threat_events').count({n:'*'}))[0].n),webCount);
  assert.equal(Number((await k('nyxguard_attack_event').count({n:'*'}))[0].n),threatCount);
  const stats=await api('/web-threat/analytics/overview?hours=24');assert.equal(stats.status,200);assert.equal(stats.data.byCategory.inbound,3);
  const native=await api('/web-threat/events?hours=720');assert.equal(native.status,200);
  const threats=await api('/nyxguard/attacks?days=0');assert.equal(threats.status,200);assert.ok(threats.data.items.some(r=>r.type==='sqli'));
  const rules=await api('/nyxguard/rules/ip');assert.equal(rules.status,200);const disabled=rules.data.items.find(r=>!r.enabled&&r.note==='Manual ban (Attacks)');assert.ok(disabled);
  // Exercise the actual management API; nginx apply requires a working nginx in DEV,
  // so use the data method here and prove enforcement in DEV browser acceptance.
  const ipRules=(await import('/app/internal/nyxguard/rules.js')).ipRules;
  await ipRules.update(k,disabled.id,{enabled:true,expiresOn:null});assert.equal((await ipRules.get(k,disabled.id)).enabled,true);
  await ipRules.update(k,disabled.id,{enabled:false});assert.ok((await api('/nyxguard/rules/ip')).data.items.some(r=>r.id===disabled.id&&!r.enabled));
  await ipRules.remove(k,disabled.id);assert.equal(await ipRules.get(k,disabled.id),null);
  const nativeTs=new Date();await k('web_threat_events').insert({...legacy(99,'bot','native_fixture'),ts:nativeTs});
  assert.equal((await api('/web-threat/analytics/overview?hours=24')).data.byCategory.inbound,4);
  assert.equal((await api('/web-threat/events?hours=24')).data.items.length,1);
  assert.equal((await api('/web-threat/csp-report','POST',{'csp-report':{'violated-directive':'script-src','blocked-uri':'eval'}})).status,204);
  assert.equal((await k('web_threat_events').where('category','browser').where('rule_id','browser.csp.report')).length,1);
  assert.equal((await api('/web-threat/analytics/overview?hours=24')).data.byCategory.browser,1);
  assert.equal((await api('/event-center/events?hours=24')).data.items.length,0);
 } finally {await new Promise(resolve=>server.close(resolve));}
});
