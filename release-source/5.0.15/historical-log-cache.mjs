import fs from 'node:fs/promises';
import {scanLogFile as streamScan} from './log-scan.mjs';
// Cache parsed file snapshots, never a truncated time window or an API result.
// Eviction affects speed only; the stream remains authoritative on a miss.
const cache=new Map(), inflight=new Map(), parserIds=new WeakMap();let nextParser=0,totalEvents=0,totalBytes=0;
// Bound retained parse objects by both cardinality and estimated heap bytes.
// Strings parsed from a line can retain its entire backing store; count UTF-16
// line storage plus object/property overhead, rather than compressed file size.
const PER_FILE=10000,TOTAL=40000,FILES=256,PER_FILE_BYTES=4*1024*1024,TOTAL_BYTES=16*1024*1024;
function eventBytes(event){let bytes=512;for(const value of Object.values(event))if(typeof value==='string')bytes+=2*value.length+64;return bytes;}

function fingerprint(s){return [s.dev,s.ino,s.size,s.mtimeMs,s.ctimeMs].join(':');}
function remove(key){const old=cache.get(key);if(old){totalEvents-=old.events.length;totalBytes-=old.bytes;cache.delete(key);}}
export function clearHistoricalLogCache(){cache.clear();totalEvents=0;totalBytes=0;}
export function historicalCacheState(){return {files:cache.size,events:totalEvents,maxEvents:TOTAL,estimatedBytes:totalBytes,maxEstimatedBytes:TOTAL_BYTES};}
export async function scanHistoricalLog(options,parse){
 if(typeof options.maxBytes==='number')return streamScan(options,parse);
 if(!parserIds.has(parse))parserIds.set(parse,++nextParser);
 const key=options.fp+':'+parserIds.get(parse),stat=await fs.stat(options.fp),stamp=fingerprint(stat);
 let entry=cache.get(key);
 if(entry?.stamp!==stamp){remove(key);entry=null;}
 if(entry){cache.delete(key);cache.set(key,entry);}else{
  const active=inflight.get(key);
  if(active){await active;return scanHistoricalLog(options,parse);}
  const work=(async()=>{
   const events=[];let cacheable=true,bytes=0;
   // Read the entire source. A memory ceiling never stops the scan or its callbacks.
   const result=await streamScan({...options,size:stat.size,sinceMs:-Infinity,onEvent:event=>{
    if(event.ts>=options.sinceMs)options.onEvent({...event});
    if(cacheable){const cost=eventBytes(event);if(events.length<PER_FILE&&bytes+cost<=PER_FILE_BYTES){events.push(event);bytes+=cost;}else{cacheable=false;events.length=0;bytes=0;}}
   }},parse);
   const after=await fs.stat(options.fp);
   if(cacheable&&fingerprint(after)===stamp){
    while(cache.size&&(totalEvents+events.length>TOTAL||totalBytes+bytes>TOTAL_BYTES||cache.size>=FILES))remove(cache.keys().next().value);
    cache.set(key,{stamp,events,bytes,bytesRead:result.bytesRead});totalEvents+=events.length;totalBytes+=bytes;
   }
   return result;
  })();inflight.set(key,work);
  try{return await work;}finally{inflight.delete(key);}
 }
 for(const event of entry.events)if(event.ts>=options.sinceMs)options.onEvent({...event});
 return {bytesRead:entry.bytesRead,cacheHit:true};
}
