import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import {scanLogFile} from '../log-scan.mjs';
test('plain and gzip scans preserve the requested time window and event counts',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'log-scan-'));
 try{for(const compressed of [false,true]){const fp=path.join(dir,compressed?'access.gz':'access.log');const data='1\n2\n3\n';await fs.writeFile(fp,compressed?zlib.gzipSync(data):data);const events=[];const result=await scanLogFile({fp,size:6,sinceMs:2,onEvent:e=>events.push(e.ts)},line=>({ts:Number(line)}));assert.deepEqual(events,[2,3]);assert.ok(result.bytesRead>0);}}
 finally{await fs.rm(dir,{recursive:true});}
});
test('unreadable and corrupt gzip logs reject, rather than resolve an empty result',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'log-scan-'));
 try{await assert.rejects(scanLogFile({fp:path.join(dir,'missing.log'),sinceMs:0,onEvent:()=>{}},()=>null),{code:'ENOENT'});const fp=path.join(dir,'bad.gz');await fs.writeFile(fp,'invalid gzip');await assert.rejects(scanLogFile({fp,sinceMs:0,onEvent:()=>{}},()=>null));}
 finally{await fs.rm(dir,{recursive:true});}
});
