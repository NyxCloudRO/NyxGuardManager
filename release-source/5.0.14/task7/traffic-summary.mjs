import {keepRecent,newestFirst} from './traffic-selection.mjs';
// All traffic totals use the same retained request records, for every range.
// Collector rollups predate coverage tracking and cannot establish complete totals.
export function trafficWindow(minutes,now=Date.now()) {
 if(!Number.isInteger(minutes)||minutes<1||minutes>259200||!Number.isSafeInteger(now))throw new TypeError('Invalid traffic window');
 return {start:now-minutes*60000,end:now}; // [start,end), elapsed UTC minutes
}
function add(a,b){const n=a+b;if(!Number.isSafeInteger(n))throw new RangeError('Traffic counter exceeds exact integer range');return n;}
function counters(){return {requests:0,allowed:0,blocked:0,unclassified:0,rxBytes:0,txBytes:0,missingRx:0,missingTx:0,ips:new Set()};}
function accumulate(c,e){
 c.requests=add(c.requests,1);
 c[e.status===null?'unclassified':e.status>=400?'blocked':'allowed']++;
 for(const [key,missing]of [['rxBytes','missingRx'],['txBytes','missingTx']]){
  if(e[key]===null||e[key]===undefined)c[missing]++;else c[key]=add(c[key],e[key]);
 }
 if(e.ip)c.ips.add(e.ip);
}
export async function accessSummary({minutes,limit=50,offset=0,now=Date.now()}, {files,scan}) {
 const window=trafficWindow(minutes,now),all=counters(),byHost=new Map(),recent=[];
 let first=null,last=null,sourceFiles=0,missingFiles=0,bytesRead=0,cacheHits=0;
 for(const f of files){
  // mtime is filesystem metadata, not an occurrence boundary. Restored/late logs count.
  try{
   const result=await scan({fp:f.fp,size:f.size,sinceMs:-Infinity,onEvent:e=>{
    if(e.ts>=window.end)return;
    first=first===null?e.ts:Math.min(first,e.ts);last=last===null?e.ts:Math.max(last,e.ts);
    if(e.ts<window.start)return;
    accumulate(all,e);let host=byHost.get(e.host);if(!host){host=counters();byHost.set(e.host,host);}accumulate(host,e);
    keepRecent(recent,e,offset+limit);
   }});
   sourceFiles++;bytesRead+=result.bytesRead||0;if(result.cacheHit)cacheHits++;
  }catch(e){if(e.code!=='ENOENT')throw e;missingFiles++;}
 }
 const output=c=>({requests:c.requests,allowed:c.allowed,blocked:c.blocked,unclassified:c.unclassified,uniqueIps:c.ips.size,
  rxBytes:c.missingRx?null:c.rxBytes,txBytes:c.missingTx?null:c.txBytes,
  knownRxBytes:c.rxBytes,knownTxBytes:c.txBytes,missingRx:c.missingRx,missingTx:c.missingTx});
 recent.sort(newestFirst);
 return {windowMinutes:minutes,now:new Date(now).toISOString(),window:{start:new Date(window.start).toISOString(),end:new Date(window.end).toISOString(),bounds:'[start,end)',timezone:'UTC'},
  ...output(all),hosts:[...byHost].map(([host,c])=>({host,...output(c)})).sort((a,b)=>b.requests-a.requests||a.host.localeCompare(b.host)).slice(0,25),
  recent:recent.slice(offset,offset+limit).map(e=>({...e,iso:new Date(e.ts).toISOString()})),source:'retained_access_logs',truncated:missingFiles>0,
  coverage:{status:'unverified',complete:false,reason:'retained_logs_without_continuity_evidence',firstObserved:first===null?null:new Date(first).toISOString(),lastObserved:last===null?null:new Date(last).toISOString(),sourceFiles,missingFiles,missingRx:all.missingRx,missingTx:all.missingTx},
  accounting:{rx:'nginx_request_length',tx:'nginx_bytes_sent',blocked:'HTTP status >= 400',allowed:'HTTP status < 400',unknownStatus:'unclassified'},scan:{bytesRead,cacheHits}};
}
