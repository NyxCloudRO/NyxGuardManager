import fs from 'node:fs/promises';
import {keepRecent,newestFirst} from './traffic-selection.mjs';
// All traffic totals use the same retained request records, for every range.
// Collector rollups predate coverage tracking and cannot establish complete totals.
export function trafficWindow(minutes,now=Date.now()) {
 if(!Number.isInteger(minutes)||minutes<1||minutes>259200||!Number.isSafeInteger(now))throw new TypeError('Invalid traffic window');
 return {start:now-minutes*60000,end:now}; // [start,end), elapsed UTC minutes
}
function add(a,b){const n=a+b;if(!Number.isSafeInteger(n))throw new RangeError('Traffic counter exceeds exact integer range');return n;}
function counters(){return {requests:0,allowed:0,blocked:0,unclassified:0,rxBytes:0,txBytes:0,missingRx:0,missingTx:0,ips:new Set()};}
// Detach stored keys from regex substrings backed by much longer log lines.
function ownedString(v){return typeof v==='string'?Buffer.from(v,'utf16le').toString('utf16le'):v;}
function ownedEvent(e){return Object.fromEntries(Object.entries(e).map(([k,v])=>[k,ownedString(v)]));}
function accumulate(c,e){
 c.requests=add(c.requests,1);
 c[e.status===null?'unclassified':e.status>=400?'blocked':'allowed']++;
 for(const [key,missing]of [['rxBytes','missingRx'],['txBytes','missingTx']]){
  if(e[key]===null||e[key]===undefined)c[missing]++;else c[key]=add(c[key],e[key]);
 }
 if(e.ip&&!c.ips.has(e.ip))c.ips.add(ownedString(e.ip));
}
// Optional, bounded summaries of complete, unchanged files. Partial boundaries
// still stream authoritative records. No TTL, time rounding or database rollups.
const summaryFiles=new Map(),summaryInflight=new Map(),scanIds=new WeakMap();
let nextScanId=0,summaryBytes=0;
const MAX_SUMMARY_BYTES=16*1024*1024,MAX_FILE_BYTES=4*1024*1024,MAX_FILES=256,RECENT=100,MAX_BUILDERS=4;
const stamp=s=>[s.dev,s.ino,s.size,s.mtimeMs,s.ctimeMs].join(':');
function drop(key){const e=summaryFiles.get(key);if(e){summaryBytes-=e.bytes;summaryFiles.delete(key);}}
export function clearSummaryFileCache(){summaryFiles.clear();summaryBytes=0;}
export function summaryFileCacheState(){return {files:summaryFiles.size,estimatedBytes:summaryBytes,maxEstimatedBytes:MAX_SUMMARY_BYTES,builders:summaryInflight.size,maxBuilders:MAX_BUILDERS};}
function aggregate(){return {all:counters(),hosts:new Map(),recent:[],first:null,last:null};}
function eventCost(e){let n=512;for(const v of Object.values(e))if(typeof v==='string')n+=64+2*v.length;return n;}
function record(a,e,prefix){
 a.first=a.first===null?e.ts:Math.min(a.first,e.ts);a.last=a.last===null?e.ts:Math.max(a.last,e.ts);
 accumulate(a.all,e);let h=a.hosts.get(e.host);if(!h){h=counters();a.hosts.set(ownedString(e.host),h);}accumulate(h,e);
 // keepRecent owns its arrival-order symbol; clones isolate the two heaps/cache.
 keepRecent(a.recent,{...e},prefix);
}
function usable(a,w,prefix){return prefix<=RECENT&&(a.first===null||a.last<w.end&&(a.last<w.start||a.first>=w.start));}
async function fileSummary(f,scan,w,prefix){
 let key,before;
 if(typeof f.fp==='string'&&prefix<=RECENT){
  if(!scanIds.has(scan))scanIds.set(scan,++nextScanId);
  key=f.fp+':'+scanIds.get(scan);
  for(;;){before=stamp(await fs.stat(f.fp));const active=summaryInflight.get(key);if(!active)break;await active;}
  const old=summaryFiles.get(key);
  if(old?.stamp!==before)drop(key);
  else if(usable(old.value,w,prefix)){
   summaryFiles.delete(key);summaryFiles.set(key,old);
   const a=old.value;
   return {selected:a.last!==null&&a.last<w.start?aggregate():a,first:a.first,last:a.last,result:{bytesRead:old.bytesRead,cacheHit:true}};
  }
 }
 if(summaryInflight.size>=MAX_BUILDERS)key=undefined;
 let finish;const pending=key?new Promise(r=>{finish=r}):null;
 if(key)summaryInflight.set(key,pending);
 const selected=aggregate();let full=key?aggregate():null,bytes=512;
 try{
  const result=await scan({fp:f.fp,size:f.size,sinceMs:-Infinity,onEvent:e=>{
   // Coverage includes every observed record before the exact exclusive end.
   if(e.ts<w.end){selected.first=selected.first===null?e.ts:Math.min(selected.first,e.ts);selected.last=selected.last===null?e.ts:Math.max(selected.last,e.ts);
    if(e.ts>=w.start){const first=selected.first,last=selected.last;record(selected,e,prefix);selected.first=first;selected.last=last;}}
   if(full){
    try{
     const newHost=!full.hosts.has(e.host),newGlobal=e.ip&&!full.all.ips.has(e.ip),newHostIp=e.ip&&!full.hosts.get(e.host)?.ips.has(e.ip);
     if(newHost)bytes+=512+2*String(e.host).length;
     if(newGlobal)bytes+=96+2*e.ip.length;
     if(newHostIp)bytes+=96+2*e.ip.length;
     const root=full.recent[0],enter=full.recent.length<RECENT||e.ts>root.ts;
     if(enter)bytes+=eventCost(e)-(full.recent.length===RECENT?eventCost(root):0);
     if(bytes>MAX_FILE_BYTES){full=null;return;}
     // Avoid allocating/cloning events which cannot enter the retained prefix.
     full.first=full.first===null?e.ts:Math.min(full.first,e.ts);full.last=full.last===null?e.ts:Math.max(full.last,e.ts);
     accumulate(full.all,e);let h=full.hosts.get(e.host);if(!h){h=counters();full.hosts.set(ownedString(e.host),h);}accumulate(h,e);
     if(enter)keepRecent(full.recent,ownedEvent(e),RECENT);
    }catch(error){if(error instanceof RangeError)full=null;else throw error;}
   }
  }});
  if(full&&stamp(await fs.stat(f.fp))===before){
   full.recent.sort(newestFirst);drop(key);
   while(summaryFiles.size&&(summaryBytes+bytes>MAX_SUMMARY_BYTES||summaryFiles.size>=MAX_FILES))drop(summaryFiles.keys().next().value);
   summaryFiles.set(key,{stamp:before,value:full,bytes,bytesRead:result.bytesRead});summaryBytes+=bytes;
  }
  return {selected,first:selected.first,last:selected.last,result};
 }catch(error){if(error?.code==='ENOENT')error.summaryPartial={selected,first:selected.first,last:selected.last};throw error;}
 finally{if(key){summaryInflight.delete(key);finish();}}
}
function merge(a,b){
 for(const k of ['requests','allowed','blocked','unclassified','rxBytes','txBytes','missingRx','missingTx'])a[k]=add(a[k],b[k]);
 for(const ip of b.ips)a.ips.add(ip);
}
export async function accessSummary({minutes,limit=50,offset=0,now=Date.now()}, {files,scan}) {
 const window=trafficWindow(minutes,now),all=counters(),byHost=new Map(),recent=[];
 let first=null,last=null,sourceFiles=0,missingFiles=0,bytesRead=0,cacheHits=0;
 function include(part){
   if(part.first!==null)first=first===null?part.first:Math.min(first,part.first);
   if(part.last!==null)last=last===null?part.last:Math.max(last,part.last);
   merge(all,part.selected.all);
   for(const [name,c]of part.selected.hosts){let host=byHost.get(name);if(!host){host=counters();byHost.set(name,host);}merge(host,c);}
   // Sorting preserves original equal-timestamp order when merging cached heaps.
   for(const e of [...part.selected.recent].sort(newestFirst))keepRecent(recent,{...e},offset+limit);
 }
 for(const f of files){
  // mtime is filesystem metadata, not an occurrence boundary. Restored/late logs count.
  try{
   // Deep pagination uses the original single global heap, avoiding a second
   // offset-sized per-file heap while preserving every requested row.
   if(offset+limit>RECENT){
   const result=await scan({fp:f.fp,size:f.size,sinceMs:-Infinity,onEvent:e=>{
    if(e.ts>=window.end)return;
    first=first===null?e.ts:Math.min(first,e.ts);last=last===null?e.ts:Math.max(last,e.ts);
    if(e.ts<window.start)return;
    accumulate(all,e);let host=byHost.get(e.host);if(!host){host=counters();byHost.set(e.host,host);}accumulate(host,e);
    keepRecent(recent,e,offset+limit);
   }});
   sourceFiles++;bytesRead+=result.bytesRead||0;if(result.cacheHit)cacheHits++;
    continue;
   }
   const part=await fileSummary(f,scan,window,offset+limit),result=part.result;
   include(part);
   sourceFiles++;bytesRead+=result.bytesRead||0;if(result.cacheHit)cacheHits++;
  }catch(e){if(e.code!=='ENOENT')throw e;if(e.summaryPartial)include(e.summaryPartial);missingFiles++;}
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
