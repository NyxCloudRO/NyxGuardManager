import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';import zlib from 'node:zlib';import assert from 'node:assert/strict';
import {scanHistoricalLog,historicalCacheState} from './historical-log-cache.mjs';import {accessSummary} from './traffic-summary.mjs';import {parseAccessLine} from './parser.mjs';
const dir=await fs.mkdtemp(path.join(os.tmpdir(),'nyx515-memory-')),now=Date.parse('2026-10-20T12:00:00Z'),files=[];
try {
 for(let f=0;f<48;f++){const lines=[];for(let i=0;i<10000;i++)lines.push(`[20/Oct/2026:11:59:00 +0000] - - ${i%2?403:200} - GET https fixture.example.test "/${f}/${i}/${'x'.repeat(800)}" [Client 192.0.2.${i%250}] [Rx 17] [Tx 1003]\n`);const fp=path.join(dir,`proxy-host-${f}_access.log.gz`);await fs.writeFile(fp,zlib.gzipSync(lines.join('')));files.push({fp});}
 for(const minutes of [5,1440,10080,259200]){const s=await accessSummary({minutes,now},{files,scan:o=>scanHistoricalLog(o,parseAccessLine)});assert.equal(s.requests,480000);assert.equal(s.blocked,240000);assert.equal(s.rxBytes,480000*17);assert.equal(s.txBytes,480000*1003);assert.equal(s.truncated,false);assert.equal(s.recent.length,50);console.log(JSON.stringify({minutes,requests:s.requests,heap:process.memoryUsage().heapUsed,cache:historicalCacheState()}));}
}finally{await fs.rm(dir,{recursive:true,force:true});}
