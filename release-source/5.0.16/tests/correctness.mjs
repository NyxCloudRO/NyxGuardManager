import {unlinkSync} from 'node:fs';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';import zlib from 'node:zlib';
import * as old from '../../5.0.15/traffic-summary.mjs';import * as opt from '../traffic-summary.mjs';
import * as oc from '../../5.0.15/historical-log-cache.mjs';import * as nc from '../../5.0.15/historical-log-cache.mjs';
import {parseAccessLine as parse} from '../../5.0.15/parser.mjs';
const dir=await fs.mkdtemp(path.join(os.tmpdir(),'nyx516-')),now=Date.parse('2026-10-26T12:00:00Z');let checks=0,scans=0;
const oldScan=o=>oc.scanHistoricalLog(o,parse),newScan=o=>{scans++;return nc.scanHistoricalLog(o,parse)};
const clean=r=>{r=structuredClone(r);delete r.scan;return r};
function line(t,i,pad=100){const d=new Date(t),date=String(d.getUTCDate()).padStart(2,'0')+'/'+['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][d.getUTCMonth()]+'/'+d.getUTCFullYear()+':'+d.toISOString().slice(11,19)+' +0000';return `[${date}] - - ${i%3?200:403} - GET https host${i%3}.example.test "/${i}${'x'.repeat(pad)}" [Client 192.0.2.${i%11}] [Rx ${i%50}] [Tx ${100+i%30}]\n`;}
let files=[];
async function same(minutes=43200,limit=50,offset=0,at=now){let a=await old.accessSummary({minutes,limit,offset,now:at},{files,scan:oldScan});let b=await opt.accessSummary({minutes,limit,offset,now:at},{files,scan:newScan});assert.deepEqual(clean(b),clean(a));checks++;assert(opt.summaryFileCacheState().estimatedBytes<=opt.summaryFileCacheState().maxEstimatedBytes);checks++;return b;}
try{
 // Unsorted records, exact edges, future rows, ties, host/IP merging and pagination.
 const times=[-190,-180,-90,-60,-30,-7,-1,0,1];
 for(let f=0;f<5;f++){let text='';for(let i=0;i<350;i++)text+=line(now+times[(i*7+f)%times.length]*86400000+(i%2?-1000:0),i);const fp=dir+'/proxy-host-'+f+'_access.log'+(f%2?'.1.gz':'');await fs.writeFile(fp,f%2?zlib.gzipSync(text):text);files.push({fp});}
 for(let repeat=0;repeat<2;repeat++)for(const days of [1,7,30,60,90,180])for(const [limit,offset]of [[1,0],[50,0],[20,70],[1000,200]])await same(days*1440,limit,offset);
 await same(43200,50,0,now+3600000);await same(43200,50,0,now-3600000);
 // Isolated full-file reuse: exact fixed-window boundaries still move every call.
 const fp=dir+'/active.log';files=[{fp}];await fs.writeFile(fp,Array.from({length:12000},(_,i)=>line(now-2*86400000,i,700)).join(''));
 opt.clearSummaryFileCache();oc.clearHistoricalLogCache();nc.clearHistoricalLogCache();await same();let before=scans;await same(43200,50,0,now+1000);assert.equal(scans,before);checks++;
 // Cache result mutation never alters the next response.
 let b=await same();b.recent[0].uri='corrupt consumer';b.hosts[0].requests=-1;await same();
 await fs.appendFile(fp,line(now-1000,123));await same();
 await fs.rename(fp,fp+'.1');await fs.writeFile(fp,line(now-2000,99));files=[{fp:fp+'.1'},{fp}];await same();
 await fs.truncate(fp,0);await same();
 // Same-length replacement with restored mtime still changes inode/ctime.
 const st=await fs.stat(fp+'.1');await fs.writeFile(fp+'.replacement',(await fs.readFile(fp+'.1','utf8')).replace('host0','host9'));await fs.rename(fp+'.replacement',fp+'.1');await fs.utimes(fp+'.1',st.atime,st.mtime);await same();
 await fs.unlink(fp);await same();
 // Collector append between pre-stat and scanning: not cached as a stable snapshot.
 files=[{fp:fp+'.1'}];opt.clearSummaryFileCache();let inserted=false;
 const writingScan=async o=>{if(!inserted){inserted=true;await fs.appendFile(o.fp,line(now-1000,987));}return newScan(o)};
 const actual=await opt.accessSummary({minutes:43200,now},{files,scan:writingScan});const expected=await old.accessSummary({minutes:43200,now},{files,scan:oldScan});assert.deepEqual(clean(actual),clean(expected));assert.equal(opt.summaryFileCacheState().files,0);checks+=2;
 // Concurrent readers: shared stable summaries, isolated outputs, exact totals.
 opt.clearSummaryFileCache();const concurrent=await Promise.all(Array.from({length:4},()=>opt.accessSummary({minutes:43200,now},{files,scan:newScan})));for(const r of concurrent){assert.deepEqual(clean(r),clean(expected));checks++;}
 // High cardinality and long request paths exceed cache budgets without truncation.
 const huge=dir+'/long.log';await fs.writeFile(huge,Array.from({length:300},(_,i)=>line(now-1000,i,30000)).join(''));files=[{fp:huge}];await same();await same();
 // Global LRU capacity and full callback behavior under repeated eviction.
 opt.clearSummaryFileCache();for(let i=0;i<260;i++){const q=dir+'/small'+i;await fs.writeFile(q,line(now-1000,i));files=[{fp:q}];await same();}assert(opt.summaryFileCacheState().files<=256);checks++;
 // Unlinked open source: preserve rows already read, flag missing coverage exactly.
 const originalText=line(now-1000,0).repeat(100);let deletedResults=[];
 for(const [label,lib,cache]of [['old',old,oc],['new',opt,nc]]){const q=dir+'/unlink-'+label;await fs.writeFile(q,originalText);let removed=false;const removing=o=>cache.scanHistoricalLog(o,text=>{const e=parse(text);if(!removed){unlinkSync(q);removed=true;}return e;});deletedResults.push(await lib.accessSummary({minutes:1440,now},{files:[{fp:q}],scan:removing}));}
 assert.deepEqual(clean(deletedResults[0]),clean(deletedResults[1]));assert.equal(deletedResults[1].requests,100);assert.equal(deletedResults[1].coverage.missingFiles,1);checks+=3;
 // Bound simultaneous optional cache builders across distinct source files.
 opt.clearSummaryFileCache();const distinct=[];for(let i=0;i<8;i++){const q=dir+'/parallel'+i;await fs.writeFile(q,line(now-1000,i));distinct.push({fp:q});}
 let maxBuilders=0;const pausedScan=async o=>{const state=opt.summaryFileCacheState();maxBuilders=Math.max(maxBuilders,state.builders);assert(state.builders<=state.maxBuilders);await new Promise(r=>setTimeout(r,10));return newScan(o);};
 const parallel=await Promise.all(distinct.map(f=>opt.accessSummary({minutes:1440,now},{files:[f],scan:pausedScan})));for(const r of parallel){assert.equal(r.requests,1);checks++;}assert(maxBuilders<=4);assert.equal(opt.summaryFileCacheState().builders,0);checks+=2;
 // Different scanners never share cached semantics.
 files=[{fp:huge}];const special=async o=>{o.onEvent({ts:now-1000,status:200,host:'special',ip:'test',rxBytes:1,txBytes:2});return {}};let r=await opt.accessSummary({minutes:1440,now},{files,scan:special});assert.equal(r.requests,1);checks++;
 const bad=dir+'/bad.gz';await fs.writeFile(bad,'corrupt gzip');files=[{fp:bad}];await assert.rejects(opt.accessSummary({minutes:1440,now},{files,scan:newScan}));checks++;
 const broken=async()=>{throw Object.assign(Error('SQL/I/O failure'),{code:'EIO'})};await assert.rejects(opt.accessSummary({minutes:1440,now},{files:[{}],scan:broken}),/SQL\/I\/O failure/);checks++;
 console.log(JSON.stringify({result:'PASS',checks,timezone:process.env.TZ||'host',summaryCache:opt.summaryFileCacheState(),scope:['six ranges','unsorted exact boundaries and future rows','offsets > cache prefix','time shifts','append/rotate/truncate/replace/delete','compressed logs','concurrent reads','collector append during scan','long paths','LRU bounds','parser isolation','error propagation']}));
}finally{await fs.rm(dir,{recursive:true,force:true});}
