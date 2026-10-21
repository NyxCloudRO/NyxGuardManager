// Fixed elapsed durations only. All SQL structure/identifiers are server constants.
// Counts describe retained observations; a closed time boundary is not proof of
// collector continuity or a committed ingestion watermark.
import {utcSql} from './traffic-ingestion.mjs';
export const HISTORY_WINDOWS=Object.freeze([["24h",24],["2d",48],["7d",168],["14d",336],["30d",720],["60d",1440],["90d",2160]].map(([label,hours])=>Object.freeze({label,hours})));
export const TRAFFIC_WINDOWS=Object.freeze([{label:'1h',hours:1},...HISTORY_WINDOWS,{label:'180d',hours:4320}]);
export const closedCutoff=now=>Math.floor(now/300000)*300000;
const raw=async(k,sql)=>(await k.raw(sql))[0];
const quote=t=>`'${utcSql(t)}'`;
const band=(field,windows,end)=>'CASE '+windows.map(({hours})=>`WHEN ${field}>=${quote(end-hours*3600000)} THEN ${hours}`).join(' ')+' END';
const bounds=(field,windows,end)=>`${field}>=${quote(end-windows.at(-1).hours*3600000)} AND ${field}<${quote(end)}`;
export function exactNumber(value){const n=Number(value??0);if(!Number.isSafeInteger(n)||n<0)throw Error('Historical aggregate outside exact numeric range');return n;}
export async function attackBands(k,end){
 const w=HISTORY_WINDOWS;
 const rows=await raw(k,`SELECT ${band('created_on',w,end)} band,attack_type,COUNT(*) n FROM nyxguard_attack_event WHERE ${bounds('created_on',w,end)} GROUP BY band,attack_type`);
 const [unique]=await raw(k,`SELECT ${w.map(({hours})=>`SUM(last_seen>=${quote(end-hours*3600000)}) u${hours}`).join(',')} FROM (SELECT ip,MAX(created_on) last_seen FROM nyxguard_attack_event WHERE ${bounds('created_on',w,end)} AND ip IS NOT NULL GROUP BY ip) last_by_ip`);
 return w.map(({label,hours})=>{const types=new Map();let total=0;for(const row of rows){if(Number(row.band)>hours)continue;const n=exactNumber(row.n);total=exactNumber(total+n);const key=row.attack_type||'unknown';types.set(key,exactNumber((types.get(key)||0)+n));}return {label,types,total,unique:exactNumber(unique[`u${hours}`])};});
}
export async function attackRanks(k,end){
 const w=HISTORY_WINDOWS,output=[];
 const windows=w.map(({hours})=>`SELECT ${hours} hours`).join(' UNION ALL ');
 // Rank in SQL so high IP cardinality never crosses into the Node heap.
 for(const group of [['host'],['ip','attack_type']]){
  const cols=group.join(',');
  const projection=w.map(({hours})=>`SUM(created_on>=${quote(end-hours*3600000)}) c${hours}`).join(',');
  const choose='CASE w.hours '+w.map(({hours})=>`WHEN ${hours} THEN c${hours}`).join(' ')+' END';
  const rows=await raw(k,`WITH counts AS (SELECT ${cols},${projection} FROM nyxguard_attack_event WHERE ${bounds('created_on',w,end)} GROUP BY ${cols}), expanded AS (SELECT ${cols},w.hours,${choose} n FROM counts CROSS JOIN (${windows}) w), ranked AS (SELECT *,ROW_NUMBER() OVER(PARTITION BY hours ORDER BY n DESC,${cols}) rn FROM expanded WHERE n>0) SELECT * FROM ranked WHERE rn<=20 ORDER BY hours,rn`);
  for(const row of rows)output.push({...row,n:exactNumber(row.n),group:group[0],label:w.find(w=>w.hours===Number(row.hours)).label});
 }
 return output;
}
export async function trafficBands(k,end){
 const w=TRAFFIC_WINDOWS,columns=['requests','bytes_in','bytes_out','status_2xx','status_3xx','status_4xx','status_5xx'];
 const rows=await raw(k,`SELECT proxy_host_id,${band('bucket',w,end)} band,${columns.map(c=>`SUM(${c}) ${c}`).join(',')} FROM nyxguard_traffic_stat WHERE ${bounds('bucket',w,end)} GROUP BY proxy_host_id,band`);
 return new Map(w.map(({label,hours})=>{const apps=new Map();for(const row of rows){if(Number(row.band)>hours)continue;const r=apps.get(row.proxy_host_id)||{proxy_host_id:row.proxy_host_id,...Object.fromEntries(columns.map(c=>[c,0]))};for(const c of columns)r[c]=exactNumber(r[c]+exactNumber(row[c]));apps.set(row.proxy_host_id,r);}return [label,[...apps.values()].map(r=>({...r,req:r.requests,bin:r.bytes_in,bout:r.bytes_out,s2:r.status_2xx,s3:r.status_3xx,s4:r.status_4xx,s5:r.status_5xx}))];}));
}
export async function automaticBands(k,end){
 const w=HISTORY_WINDOWS;
 const [row]=await raw(k,`SELECT ${w.map(({hours})=>`SUM(created_on>=${quote(end-hours*3600000)}) c${hours}`).join(',')} FROM nyxguard_ip_rule WHERE action='deny' AND rule_origin='automatic_ban' AND created_on<${quote(end)}`);
 return w.map(({label,hours})=>({label,n:exactNumber(row[`c${hours}`])}));
}
export async function enforcementBands(k,end){
 const w=HISTORY_WINDOWS;
 // Boundaries are whole UTC five-minute multiples. Every retained minute
 // vector is therefore wholly inside or outside each interval.
 const epochBand='CASE '+w.map(({hours})=>`WHEN minute>=${end/1000-hours*3600} THEN ${hours}`).join(' ')+' END';
 const rows=await raw(k,`SELECT ${epochBand} band,reason,SUM(requests) n FROM nyxguard_blocked_bucket WHERE reason IN ('country','waf_rule') AND minute>=${end/1000-w.at(-1).hours*3600} AND minute<${end/1000} GROUP BY band,reason`);
 return w.map(({label,hours})=>({label,...Object.fromEntries(['country','waf_rule'].map(reason=>[reason,rows.filter(r=>r.reason===reason&&Number(r.band)<=hours).reduce((n,r)=>exactNumber(n+exactNumber(r.n)),0)]))}));
}
export async function portalBands(k,end){
 const w=HISTORY_WINDOWS;
 const rows=await raw(k,`SELECT ${band('created_on',w,end)} band,SUM(event_count) n FROM audit_log WHERE object_type='access-check' AND action='deny' AND result='denied' AND ${bounds('created_on',w,end)} AND JSON_UNQUOTE(JSON_EXTRACT(meta,'$.reason_code')) IN ('session_signature_rejected','session_scope_rejected') GROUP BY band`);
 return w.map(({label,hours})=>({label,n:rows.filter(r=>Number(r.band)<=hours).reduce((n,r)=>exactNumber(n+exactNumber(r.n)),0)}));
}
