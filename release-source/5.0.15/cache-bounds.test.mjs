import assert from 'node:assert/strict';import fs from 'node:fs/promises';import path from 'node:path';import os from 'node:os';
import {scanHistoricalLog,historicalCacheState,clearHistoricalLogCache} from './historical-log-cache.mjs';
const dir=await fs.mkdtemp(path.join(os.tmpdir(),'nyx515-cache-'));const parse=line=>JSON.parse(line);let callbacks=0;
try{
 const files=[];for(let i=0;i<30;i++){const fp=path.join(dir,i+'.log');await fs.writeFile(fp,Array.from({length:800},(_,n)=>JSON.stringify({ts:1,uri:'/'+i+'/'+n+'x'.repeat(1000)})).join('\n')+'\n');files.push(fp);}
 for(const fp of files){await scanHistoricalLog({fp,sinceMs:0,onEvent:()=>callbacks++},parse);const s=historicalCacheState();assert(s.estimatedBytes<=s.maxEstimatedBytes);assert(s.events<=s.maxEvents);}
 assert.equal(callbacks,24000);assert(historicalCacheState().events>0);let seen=0;const last=files.at(-1);const hit=await scanHistoricalLog({fp:last,sinceMs:0,onEvent:e=>{e.uri='mutated callback';seen++}},parse);assert(hit.cacheHit);assert.equal(seen,800);
 await scanHistoricalLog({fp:last,sinceMs:0,onEvent:e=>assert(e.uri.startsWith('/29/'))},parse);
 clearHistoricalLogCache();let a=0,b=0;await Promise.all([scanHistoricalLog({fp:last,sinceMs:0,onEvent:()=>a++},parse),scanHistoricalLog({fp:last,sinceMs:0,onEvent:()=>b++},parse)]);assert.equal(a,800);assert.equal(b,800);
 await fs.appendFile(last,JSON.stringify({ts:1,uri:'late'})+'\n');seen=0;await scanHistoricalLog({fp:last,sinceMs:0,onEvent:()=>seen++},parse);assert.equal(seen,801);
 await assert.rejects(scanHistoricalLog({fp:last,sinceMs:0,onEvent:()=>{throw Error('real failure')}},parse),/real failure/);
 clearHistoricalLogCache();assert.equal(historicalCacheState().estimatedBytes,0);console.log('PASS: cache byte/cardinality eviction, full callbacks, hit isolation, concurrency, append invalidation, errors');
}finally{clearHistoricalLogCache();await fs.rm(dir,{recursive:true,force:true});}
