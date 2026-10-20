import {backfillGroups,groupHash} from './blocked-groups.mjs';
export {groupHash};
import {createHash,randomUUID} from 'node:crypto';
import http from 'node:http';
import net from 'node:net';
import db from '../db.js';
import audit from './audit-log.js';
export const TABLE='nyxguard_blocked_bucket',STATE='nyxguard_blocked_state',CAP=500000;
export const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
export const parse=value=>typeof value==='string'?JSON.parse(value):value;
export function mergeVector(old,sec,n){const vector=old?[...old]:Array(60).fill(0);vector[sec%60]=Math.max(vector[sec%60],n);const occupied=vector.map((n,i)=>n>0?i:-1).filter(i=>i>=0);return {vector,requests:vector.reduce((a,b)=>a+b,0),first:occupied[0],last:occupied.at(-1)};}
export function ipc(body){return new Promise((resolve,reject)=>{const req=http.request({socketPath:'/run/nginx/nyxguard-blocked/collector.sock',path:'/',method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:{}},res=>{let text='';res.on('data',c=>{text+=c;if(text.length>1500000)req.destroy(new Error('collector payload limit'));});res.on('end',()=>{try{if(res.statusCode!==200)throw Error('collector unavailable');resolve(JSON.parse(text));}catch(e){reject(e);}});});req.setTimeout(1500,()=>req.destroy(Error('collector timeout')));req.on('error',reject);req.end(body?JSON.stringify(body):undefined);});}
let chain=Promise.resolve();export function exclusive(fn){const next=chain.then(fn);chain=next.catch(()=>{});return next;}
let lastHealth={status:'starting'},inFlight=false,running=false,rows=0,lastCount=0;
async function state(){return await db()(STATE).where({id:1}).first();}
async function ensureState(){let s=await state();if(!s){await db()(STATE).insert({id:1,generation:randomUUID(),health:JSON.stringify({status:'starting',coverageGapAt:Date.now()})}).onConflict('id').ignore();s=await state();}return s;}
// Native backup export/import share the local collector/deletion boundary. Restores
// intentionally restore history, but never replay observations from before the import.
export async function maintenance(fn,{restore=false}={}){return exclusive(async()=>{
 try{return await fn();}finally{if(restore){const s=await ensureState(),generation=randomUUID();await db()(STATE).where({id:1}).update({generation,health:JSON.stringify({status:'starting',coverageGapAt:Date.now()})});lastCount=0;await backfillGroups(db());await ipc({generation});}}
});}

async function finishClear(s){
 const intent=parse(s.pending);if(!intent)return;
 // Persisted generation changed before this step: no old observation can be ingested.
 await ipc({generation:s.generation});
 await db()(TABLE).delete();rows=0;
 const prior=await db()('audit_log').where({action:'blocked_requests_cleared',user_id:intent.actor}).whereRaw("JSON_UNQUOTE(JSON_EXTRACT(meta,'$.correlation_id')) = ?",[intent.correlation]).first();
 if(!prior)await audit.add({token:{getUserId:()=>intent.actor}},{action:'blocked_requests_cleared',object_type:'ip-rule',object_id:0,meta:{name:'Blocked Requests',resource:'/nyxguard/blocked-requests',count:intent.count,correlation_id:intent.correlation}});
 await db()(STATE).where({id:1}).update({pending:null,health:JSON.stringify({status:'ready',clearedAt:Date.now()})});
}
export async function clear(access){return exclusive(async()=>{
 let s=await ensureState();if(s.pending){await finishClear(s);return {deleted:true};}
 const [{n}]=await db()(TABLE).sum({n:'requests'});const generation=randomUUID();
 const pending={actor:access.token.getUserId(),count:Number(n||0),correlation:randomUUID()};
 await db()(STATE).where({id:1}).update({generation,pending:JSON.stringify(pending)});
 await finishClear({...s,generation,pending});return {deleted:true};
});}
export async function collect(){return exclusive(async()=>{
 let s=await ensureState();if(s.pending){await finishClear(s);s=await state();}
 let health=parse(s.health)||{};
 let batch=await ipc({generation:s.generation});
 if(!Array.isArray(batch.items)){if(batch.items&&Object.keys(batch.items).length===0)batch.items=[];else throw Error('invalid collector batch');}
 if(health.boot&&health.boot!==batch.boot)health.coverageGapAt=Date.now();
 if(!health.boot)health.coverageStartedAt=Date.now();
 if(Object.entries(health.metrics||{}).some(([k,v])=>k!=='groups'&&v>0))health.priorLoss=true;
 health.boot=batch.boot;
 if(Date.now()-lastCount>60000){await db()(TABLE).where('minute','<',Math.floor(Date.now()/1000)-30*86400-60).delete();rows=Number((await db()(TABLE).count({n:'id'}))[0].n);lastCount=Date.now();}
 // Resolve only names of application IDs present in a batch, off the request path.
 const ids=[...new Set(batch.items.map(x=>Number(x.d?.[4])).filter(Number.isSafeInteger))];
 const apps=ids.length?await db()('proxy_host').whereIn('id',ids).select('id','meta','domain_names'):[];
 const names=new Map(apps.map(a=>{let meta={};try{meta=parse(a.meta)||{};}catch{}let domains=[];try{domains=parse(a.domain_names)||[];}catch{}return [Number(a.id),String(meta.nyxguardAppName||meta.nyxguard_app_name||domains[0]||'').slice(0,255)];}));
 const acks=[];
 for(const item of batch.items){
  const d=item.d;if(!Array.isArray(d)||d.length!==8||typeof item.key!=='string')throw Error('invalid collector record');
  const [boot,gen,sec,ip,app,host,encoded,country]=d;
  if(gen!==s.generation){acks.push([item.key,item.n]);continue;}
  if(!Number.isSafeInteger(sec)||sec<Math.floor(Date.now()/1000)-30*86400||sec>Math.floor(Date.now()/1000)+1||!net.isIP(ip)||!Number.isSafeInteger(app)||app<1||typeof host!=='string'||host.length>253||!/^(?:[A-Z]{2})?$/.test(country)||!Number.isSafeInteger(item.n)||item.n<=0)throw Error('invalid collector dimensions');
  const policy=JSON.parse(Buffer.from(encoded,'base64').toString());
  if(!['waf_rule','ip','country','restriction','automatic','automatic_bot','automatic_ddos','automatic_sqli','automatic_authfail'].includes(policy.reason))throw Error('invalid collector reason');
  const minute=Math.floor(sec/60)*60,id=hash([boot,gen,minute,ip,app,host,encoded,country]);
  const old=await db()(TABLE).where({id}).first();
  if(!old&&rows>=CAP){health.storageLimitedAt=Date.now();acks.push([item.key,item.n]);continue;}
  const merged=mergeVector(old?parse(old.vector):null,sec,item.n);
  const row={id,generation:gen,minute,ip,app_id:app,app_name:old?.app_name??names.get(app)??'',host,country,reason:policy.reason,policy:JSON.stringify(policy),vector:JSON.stringify(merged.vector),requests:merged.requests,first_sec:minute+merged.first,last_sec:minute+merged.last};
  row.group_key=groupHash(row);
  await db()(TABLE).insert(row).onConflict('id').merge();if(!old)rows++;
  acks.push([item.key,item.n]);
 }
 await ipc({acks});
 health={...health,status:'ready',lastSuccess:Date.now(),metrics:batch.metrics,storedGroups:rows};lastHealth=health;
 await db()(STATE).where({id:1}).update({health:JSON.stringify(health)});
});}
function windowExpressions(start,end){
 const vals=Array.from({length:60},(_,i)=>`COALESCE(JSON_VALUE(vector,'$[${i}]'),0)`);
 const inWindow=vals.map((v,i)=>`IF(minute+${i} BETWEEN ${start} AND ${end},${v},0)`);
 const whole=`minute >= ${start} AND minute+59 <= ${end}`;
 return {n:`IF(${whole},requests,${inWindow.join('+')})`,first:`IF(${whole},first_sec,LEAST(${inWindow.map((v,i)=>`IF((${v})>0,minute+${i},4294967295)`).join(',')}))`,last:`IF(${whole},last_sec,GREATEST(${inWindow.map((v,i)=>`IF((${v})>0,minute+${i},0)`).join(',')}))`};
}
let readers=0;
export async function query(input={}){
 if(readers>=2)throw Object.assign(Error('Blocked Requests query capacity reached'),{status:503});
 readers++;try{return await exclusive(()=>queryRows(input));}finally{readers--;}
}
async function queryRows(input={}){
 const hours=Number(input.hours||24);if(![24,168,720].includes(hours))throw Object.assign(Error('Invalid period'),{status:400});
 const page=Math.max(1,Math.min(100000,Number(input.page)||1));if(!Number.isInteger(page))throw Object.assign(Error('Invalid page'),{status:400});
 const size=25,now=Math.floor(Date.now()/1000),start=now-hours*3600+1,e=windowExpressions(start,now);
 let base=db()(TABLE).whereBetween('minute',[Math.floor(start/60)*60,Math.floor(now/60)*60]);
 if(input.country){if(!/^(?:[A-Z]{2}|unknown)$/.test(input.country))throw Object.assign(Error('Invalid country'),{status:400});base.where('country',input.country==='unknown'?'':input.country);}
 if(input.reason){if(!['ip','country','restriction','automatic','automatic_bot','automatic_ddos','automatic_sqli','automatic_authfail'].includes(input.reason))throw Object.assign(Error('Invalid reason'),{status:400});base.where('reason',input.reason);}
 const search=String(input.search||'').slice(0,120).trim().split(/\s+/).filter(Boolean).slice(0,5);
 for(const word of search)base.where(function(){this.whereRaw('LOCATE(?,ip)>0',[word]).orWhereRaw('LOCATE(LOWER(?),LOWER(app_name))>0',[word]).orWhereRaw('LOCATE(LOWER(?),LOWER(host))>0',[word]);});
 const clipped=base.select('*',db().raw(`${e.n} AS n, ${e.first} AS f, ${e.last} AS l`));
 const filtered=()=>db().from(clipped.clone().as('b')).where('n','>',0);
 const grouped=()=>filtered().select(db().raw('UNHEX(group_key) AS grouping')).min({representative:db().raw('UNHEX(id)')}).sum({requests:'n'}).min({firstSeen:'f'}).max({lastSeen:'l'}).groupByRaw('UNHEX(group_key)');
 const summary=await filtered().sum({requests:'n'}).countDistinct({sources:'ip',applications:'app_id',groups:'group_key'}).first();
 const {groups,...totals}=summary;
 const reasons=await filtered().select('reason').sum({requests:'n'}).groupBy('reason');
 const compiled=grouped().orderBy(input.sort==='requests'?'requests':'lastSeen','desc').orderBy('grouping').limit(size).offset((page-1)*size).toSQL();
 const [groupsPage]=await db().raw('SET STATEMENT tmp_table_size=134217728,max_heap_table_size=134217728 FOR '+compiled.sql,compiled.bindings);
 for(const row of groupsPage)row.representative=row.representative.toString('hex');
 const metadata=groupsPage.length?await db()(TABLE).whereIn('id',groupsPage.map(r=>r.representative)).select('id','ip','app_id','app_name','host','country','reason','policy'):[];
 const byId=new Map(metadata.map(r=>[r.id,r]));
 const items=groupsPage.map(({representative,grouping,...counts})=>({...byId.get(representative),...counts}));
 const countries=await db()(TABLE).whereBetween('minute',[Math.floor(start/60)*60,Math.floor(now/60)*60]).distinct('country').orderBy('country');
 const s=await state(),health=s?parse(s.health)||{}:{status:'error'};
 return {asOf:now,start,hours,page,pageSize:size,groups:Number(groups),totals:Object.fromEntries(Object.entries(totals).map(([k,v])=>[k,Number(v||0)])),reasons:reasons.map(r=>({...r,requests:Number(r.requests)})),countries:countries.map(r=>r.country),items:items.map(r=>({...r,requests:Number(r.requests),firstSeen:Number(r.firstSeen),lastSeen:Number(r.lastSeen),policy:parse(r.policy)})),health:{...health,...(lastHealth.status==='error'?{status:'error'}:{}),pending:!!s?.pending,stale:!health.lastSuccess||Date.now()-health.lastSuccess>15000,partial:!!(health.storageLimitedAt||health.coverageGapAt||health.priorLoss||Object.entries(health.metrics||{}).some(([k,v])=>k!=='groups'&&v>0))}};
}
export default {initTimer(){if(running)return;running=true;const tick=()=>{if(inFlight)return;inFlight=true;collect().catch(()=>{lastHealth={status:'error'};}).finally(()=>{inFlight=false;});};setInterval(tick,1000).unref();tick();}};
