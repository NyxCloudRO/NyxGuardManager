// Run against a disposable schema fixture only; never an installed Manager DB.
import {createRequire}from'node:module';import assert from'node:assert/strict';
import {HISTORY_WINDOWS,TRAFFIC_WINDOWS,attackBands,attackRanks,trafficBands,automaticBands,enforcementBands,portalBands,closedCutoff}from'../historical-bands.mjs';
import {utcSql}from'../traffic-ingestion.mjs';
const require=createRequire('/app/package.json'),knex=require('knex');
if(process.env.NYXGUARD_DISPOSABLE_FIXTURE!=='yes')throw Error('Explicit disposable fixture acknowledgement required');
const k=knex({client:'mysql2',connection:{host:process.env.FIXTURE_DB_HOST||'nyx517-bench-db',user:'root',database:'bench',timezone:'Z'},pool:{min:0,max:2}});
const end=Date.parse('2026-10-21T00:00:00Z');assert.equal(closedCutoff(end+299999),end);assert.equal(closedCutoff(end+300000),end+300000);
for(const t of ['nyxguard_attack_event','nyxguard_traffic_stat','nyxguard_ip_rule','nyxguard_blocked_bucket','audit_log'])await k(t).truncate();
let id=1;
for(const {hours}of HISTORY_WINDOWS)for(const offset of [-1000,0,1000])for(const type of ['bot','ddos','sqli','authfail','novel',null]){
 await k('nyxguard_attack_event').insert({id:id++,created_on:utcSql(end-hours*3600000+offset),ip:offset===0?null:offset===1000?'':id%3?'203.0.113.1':'203.0.113.2',host:id%2?'a.example.test':'b.example.test',attack_type:type});
}
await k('nyxguard_attack_event').insert([{id:id++,created_on:utcSql(end),ip:'203.0.113.250',host:'excluded',attack_type:'bot'},{id:id++,created_on:utcSql(end+1000),ip:'203.0.113.251',host:'excluded',attack_type:'ddos'}]);
let n=1;for(const {hours}of TRAFFIC_WINDOWS)for(const offset of [-300000,0,300000])await k('nyxguard_traffic_stat').insert({id:n++,proxy_host_id:1,bucket:utcSql(end-hours*3600000+offset),requests:10,bytes_in:30,bytes_out:40,status_2xx:5,status_3xx:2,status_4xx:2,status_5xx:1});
// A repeated source IP in every band must count once over the entire interval.
const attacks=await attackBands(k,end),ranks=await attackRanks(k,end),traffic=await trafficBands(k,end);
for(const {label,hours}of HISTORY_WINDOWS){
 const where=q=>q.where('created_on','>=',utcSql(end-hours*3600000)).where('created_on','<',utcSql(end));
 const expected=await where(k('nyxguard_attack_event')).select('attack_type').count('* as n').groupBy('attack_type');const [{n}]=await where(k('nyxguard_attack_event')).count('* as n'),[{u}]=await where(k('nyxguard_attack_event')).countDistinct('ip as u');const actual=attacks.find(x=>x.label===label);
 assert.equal(actual.total,Number(n));assert.equal(actual.unique,Number(u));
 for(const row of expected)assert.equal(actual.types.get(row.attack_type||'unknown'),Number(row.n));
 for(const cols of [['host'],['ip','attack_type']]){
  const expected=await where(k('nyxguard_attack_event')).select(cols).count('* as n').groupBy(cols).orderBy('n','desc').orderBy(cols).limit(20);
  assert.deepEqual(ranks.filter(r=>r.label===label&&r.group===cols[0]).map(r=>Object.fromEntries([...cols.map(c=>[c,r[c]]),['n',r.n]])),expected.map(r=>({...r,n:Number(r.n)})));
 }
}
for(const {label,hours}of TRAFFIC_WINDOWS){const [{n}]=await k('nyxguard_traffic_stat').where('bucket','>=',utcSql(end-hours*3600000)).where('bucket','<',utcSql(end)).sum('requests as n');assert.equal(traffic.get(label)[0]?.req||0,Number(n)||0);}
await k('nyxguard_ip_rule').insert([{id:1,action:'deny',rule_origin:'automatic_ban',created_on:utcSql(end-1000)},{id:2,action:'deny',rule_origin:'manual',created_on:utcSql(end-1000)}]);assert((await automaticBands(k,end)).every(r=>r.n===1));await k('nyxguard_ip_rule').where('id',1).delete();assert((await automaticBands(k,end)).every(r=>r.n===0));
await k('nyxguard_blocked_bucket').insert([{id:1,minute:end/1000-60,requests:3,vector:'[3]',reason:'country'},{id:2,minute:end/1000,requests:99,vector:'[99]',reason:'waf_rule'},{id:3,minute:end/1000-86400,requests:4,vector:'[4]',reason:'waf_rule'}]);assert((await enforcementBands(k,end)).every(r=>r.country===3&&r.waf_rule===4));
await k('audit_log').insert([{id:1,object_type:'access-check',action:'deny',result:'denied',meta:'{"reason_code":"session_signature_rejected"}',event_count:2,created_on:utcSql(end-1000)},{id:2,object_type:'access-check',action:'deny',result:'denied',meta:'{"reason_code":"session_expired"}',event_count:99,created_on:utcSql(end-1000)}]);assert((await portalBands(k,end)).every(r=>r.n===2));
await k('nyxguard_attack_event').truncate();assert((await attackBands(k,end)).every(r=>r.total===0&&r.unique===0));
await k.schema.renameTable('nyxguard_attack_event','test_source_unavailable');try{await assert.rejects(()=>attackBands(k,end));}finally{await k.schema.renameTable('test_source_unavailable','nyxguard_attack_event');}
console.log(JSON.stringify({result:'PASS',windows:7,trafficWindows:9,cases:['UTC closed bounds','all seven boundary edges','null and empty IP native semantics','overlapping event types','deterministic top20 ties','exact trailing distincts','traffic closed buckets','deleted automatic rule retained semantics','native enforcement only','portal reason provenance','genuine zero','unavailable source rejects']}));await k.destroy();
