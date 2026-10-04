import fs from 'node:fs/promises';
import {scanLogFile as streamScan} from './log-scan.mjs';
// Cache parsed file snapshots, never a truncated time window or an API result.
// Eviction affects speed only; the stream remains authoritative on a miss.
const cache=new Map(), inflight=new Map(), parserIds=new WeakMap();let nextParser=0,totalEvents=0;
const PER_FILE=250000,TOTAL=300000,FILES=32;
function fingerprint(s){return [s.dev,s.ino,s.size,s.mtimeMs,s.ctimeMs].join(':');}
function remove(key){const old=cache.get(key);if(old){totalEvents-=old.events.length;cache.delete(key);}}
export function clearHistoricalLogCache(){cache.clear();totalEvents=0;}
export function historicalCacheState(){return {files:cache.size,events:totalEvents,maxEvents:TOTAL};}
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
   const events=[];let cacheable=true;
   // Read the entire source. A memory ceiling never stops the scan or its callbacks.
   const result=await streamScan({...options,size:stat.size,sinceMs:-Infinity,onEvent:event=>{
    if(event.ts>=options.sinceMs)options.onEvent({...event});
    if(cacheable){if(events.length<PER_FILE)events.push(event);else{cacheable=false;events.length=0;}}
   }},parse);
   const after=await fs.stat(options.fp);
   if(cacheable&&fingerprint(after)===stamp){
    while(cache.size&&(totalEvents+events.length>TOTAL||cache.size>=FILES))remove(cache.keys().next().value);
    cache.set(key,{stamp,events,bytesRead:result.bytesRead});totalEvents+=events.length;
   }
   return result;
  })();inflight.set(key,work);
  try{return await work;}finally{inflight.delete(key);}
 }
 for(const event of entry.events)if(event.ts>=options.sinceMs)options.onEvent({...event});
 return {bytesRead:entry.bytesRead,cacheHit:true};
}
