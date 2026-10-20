import {redactMonitoring} from './monitoring-policy.mjs';
import {createRequire} from 'node:module';
const ipaddr=createRequire(import.meta.url)('ipaddr.js');
export const encode=value=>Buffer.from(JSON.stringify(value)).toString('base64');
export function network(raw){
 try {const [addr,bits]=ipaddr.parseCIDR(raw.includes('/')?raw:`${raw}/${raw.includes(':')?128:32}`);const bytes=addr.toByteArray();let left=bits;for(let i=0;i<bytes.length;i++){const n=Math.min(8,Math.max(0,left));bytes[i]&=(256-(2**(8-n)));left-=8;}return `${ipaddr.fromByteArray(bytes).toNormalizedString()}/${bits}`;}catch{return null;}
}
export function policy(rows,kind,origins=new Map()){
 if(rows.length!==1)return {reason:kind==='country'?'country':'restriction',match:kind==='country'?rows[0]?.countryCode:null,ambiguous:true,expires:Math.min(...rows.map(r=>r.expiresOn?Math.floor(Date.parse(r.expiresOn)/1000):4294967295))};
 const r=rows[0],origin=origins.get(Number(r.id));let reason=kind==='country'?'country':origin==='manual'?'ip':'restriction';
 if(kind==='ip'&&origin==='automatic_ban'){reason='automatic';const cause=String(r.note||'').match(/^Auto-ban:\s*(bot|ddos|sqli|authfail)(?:[;\s]|$)/i)?.[1]?.toLowerCase();if(cause)reason=`automatic_${cause}`;}
 // Administrator notes may contain secrets: retain ordinary prose, suppress URL/credential-like notes.
 const raw=String(r.note||'');const note=redactMonitoring(raw)!==raw||/https?:|(?:token|password|secret|authorization|cookie|api[_ -]?key)\s*[:=]/i.test(raw)?null:raw.replace(/[\x00-\x1f\x7f]/g,' ').slice(0,255)||null;
 return {reason,id:Number(r.id),match:kind==='country'?r.countryCode:r.ipCidr,note,expires:r.expiresOn?Math.floor(Date.parse(r.expiresOn)/1000):0};
}
export async function observationConfig(db,{rules,countryRules,denyList,denyPerHostEntries,geoipAvailable,ip2Enabled}){
 let origins=new Map();try{origins=new Map((await db('nyxguard_ip_rule').select('id','rule_origin')).map(r=>[Number(r.id),r.rule_origin]));}catch{}
 const global=new Map(),hosts=new Map();
 for(const r of rules.filter(r=>r.enabled&&r.action==='deny'&&(!r.expiresOn||Date.parse(r.expiresOn)>Date.now()))){
  const host=denyPerHostEntries.find(e=>e.ip===r.ipCidr.split('/')[0]&&String(r.note||'').includes(`host=${e.host}`))?.host;
  const key=network(r.ipCidr);if(!key)continue;
  const map=host?hosts:global,k=host?`${host}:${r.ipCidr.split('/')[0]}`:key;
  if(!host&&!denyList.some(c=>network(c)===key))continue;
  map.set(k,[...(map.get(k)||[]),r]);
 }
 const fallback=encode({reason:'restriction',ambiguous:true});
 const lines=['lua_shared_dict nyxguard_blocked 16m;', 'map "" $nyxguard_observed { default ""; }','map "" $nyxguard_observed_candidate { default ""; }',
 'geo $nyxguard_observed_global {',` default ${fallback};`,...[...global].map(([key,rows])=>` ${key} ${encode(policy(rows,'ip',origins))};`),'}',
 'map "$host:$remote_addr" $nyxguard_observed_host {',` default ${fallback};`,...[...hosts].map(([key,rows])=>` "${key}" ${encode(policy(rows,'ip',origins))};`),'}',
 'map "$nyxguard_deny_global:$nyxguard_deny_host" $nyxguard_observed_ip {',` default ${fallback};`,' "1:0" $nyxguard_observed_global;',' "0:1" $nyxguard_observed_host;','}',
 'map $nyxguard_country $nyxguard_observed_country {',` default ${encode({reason:'country',ambiguous:true})};`];
 const countries=new Map();for(const r of countryRules.filter(r=>r.enabled&&r.action==='deny'&&(!r.expiresOn||Date.parse(r.expiresOn)>Date.now()))){const cc=r.countryCode;if(/^[A-Z]{2}$/.test(cc))countries.set(cc,[...(countries.get(cc)||[]),r]);}
 for(const [cc,rows]of countries)lines.push(` ${cc} ${encode(policy(rows,'country'))};`);lines.push('}');
 const cc=geoipAvailable?'$geoip2_country_code_mm':ip2Enabled?'$geoip2_country_code_ip2':'""';
 lines.push(`map "" $nyxguard_observed_geo { default ${cc}; }`, 'server { listen unix:/run/nginx/nyxguard-blocked/collector.sock; access_log off; client_max_body_size 1m; client_body_buffer_size 1m; location / { content_by_lua_file /app/internal/blocked-control.lua; } }');
 return lines.join('\n');
}
