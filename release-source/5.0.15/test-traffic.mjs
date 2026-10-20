import assert from 'node:assert/strict';import fs from'node:fs/promises';import os from'node:os';import path from'node:path';import vm from'node:vm';import zlib from'node:zlib';
const lib=process.argv[2]||'.', {accessSummary,trafficWindow}=await import(path.resolve(lib,'traffic-summary.mjs')),{scanHistoricalLog,clearHistoricalLogCache,historicalCacheState}=await import(path.resolve(lib,'historical-log-cache.mjs'));
const {parseAccessLine:parser}=await import('./parser.mjs');
const dir=await fs.mkdtemp(path.join(os.tmpdir(),'nyx-task7-')),now=Date.parse('2026-10-26T00:00:00Z'),days=[1,7,30,60,90,180];let checks=0;
function eq(a,b){assert.deepEqual(a,b);checks++;}
const events=[];for(const d of days){for(const delta of [-1,0,1]){const t=now-d*86400000+delta,blocked=delta===0;events.push({t,status:blocked?403:200,rx:17+d,tx:1003+d});}}
events.push({t:now-1000,status:500,rx:91,tx:4096},{t:now,status:200,rx:999,tx:999},{t:now+1000,status:200,rx:999,tx:999});
const months=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function line(e,up='-'){const t=new Date(e.t),pad=n=>String(n).padStart(2,'0');return `[${pad(t.getUTCDate())}/${months[t.getUTCMonth()]}/${t.getUTCFullYear()}:${pad(t.getUTCHours())}:${pad(t.getUTCMinutes())}:${pad(t.getUTCSeconds())} +0000] - ${up} ${e.status} - GET https fixture.example.test "/" [Client 192.0.2.7] [Rx ${e.rx}] [Tx ${e.tx}]\n`;}
// Nginx stores seconds, so represent exact source boundaries at second resolution.
for(const e of events)e.t=Math.floor(e.t/1000)*1000;
await fs.writeFile(path.join(dir,'proxy-host-1_access.log'),events.map(e=>line(e)).join(''));
const files=[{fp:path.join(dir,'proxy-host-1_access.log')}],scan=o=>scanHistoricalLog(o,parser),results=[];
for(const d of days){
 const expected=events.filter(e=>e.t>=now-d*86400000&&e.t<now),actual=await accessSummary({minutes:d*1440,now},{files,scan});
 eq([actual.requests,actual.allowed,actual.blocked,actual.rxBytes,actual.txBytes],[expected.length,expected.filter(e=>e.status<400).length,expected.filter(e=>e.status>=400).length,expected.reduce((n,e)=>n+e.rx,0),expected.reduce((n,e)=>n+e.tx,0)]);
 eq(actual.requests,actual.allowed+actual.blocked);eq(actual.hosts[0].requests,actual.requests);eq(actual.coverage.complete,false);eq(actual.window.bounds,'[start,end)');results.push(actual);
}
for(let i=1;i<results.length;i++)for(const key of ['requests','allowed','blocked','rxBytes','txBytes']){assert(results[i][key]>=results[i-1][key]);checks++;}
eq(trafficWindow(1440,now).end-trafficWindow(1440,now).start,86400000);
// Explicit UTC offsets make both repeated DST hours and local midnight unambiguous.
for(const [stamp,expected]of [['25/Oct/2026:03:30:00 +0300','2026-10-25T00:30:00Z'],['25/Oct/2026:03:30:00 +0200','2026-10-25T01:30:00Z'],['26/Oct/2026:00:00:00 +0200','2026-10-25T22:00:00Z']])eq(parser(line({t:now,status:200,rx:0,tx:0}).replace(/\[[^\]]+\]/,'['+stamp+']')).ts,Date.parse(expected));
const empty=await accessSummary({minutes:1440,now},{files:[],scan});eq([empty.requests,empty.rxBytes,empty.coverage.firstObserved],[0,0,null]);
let s=await accessSummary({minutes:1440,now},{files:[{}],scan:async o=>{o.onEvent({ts:now-1000,status:200,host:'one',ip:'192.0.2.1',rxBytes:0,txBytes:1});return {};}});eq([s.requests,s.rxBytes,s.txBytes],[1,0,1]);
s=await accessSummary({minutes:1440,now},{files:[{}],scan:async o=>{o.onEvent({ts:now-1000,status:null,host:'unknown',rxBytes:null,txBytes:null});return {};}});eq([s.requests,s.allowed,s.blocked,s.unclassified,s.rxBytes,s.txBytes,s.coverage.missingRx],[1,0,0,1,null,null,1]);
for(const v of ['-','12junk','9007199254740993'])eq(parser(line({t:now,status:200,rx:v,tx:1})).rxBytes,null);
// Retry/restart of legacy aggregation never enters authoritative totals.
const repeated=await accessSummary({minutes:180*1440,now},{files,scan});eq(repeated.requests,results.at(-1).requests);eq(repeated.scan.cacheHits,1);
// Late arrival and same-path replacement invalidate the file fingerprint.
await fs.appendFile(files[0].fp,line({t:now-2000,status:403,rx:11,tx:12}));s=await accessSummary({minutes:1440,now},{files,scan});eq(s.requests,results[0].requests+1);
await fs.rename(files[0].fp,files[0].fp+'.1');await fs.writeFile(files[0].fp,line({t:now-1000,status:200,rx:8,tx:9}));s=await accessSummary({minutes:1440,now},{files,scan});eq(s.requests,1);
await fs.writeFile(files[0].fp, '');s=await accessSummary({minutes:1440,now},{files,scan});eq(s.requests,0);
await fs.writeFile(files[0].fp+'.gz',zlib.gzipSync(line({t:now-1000,status:403,rx:3,tx:4})));s=await accessSummary({minutes:1440,now},{files:[{fp:files[0].fp+'.gz'}],scan});eq([s.requests,s.blocked,s.rxBytes,s.txBytes],[1,1,3,4]);
s=await accessSummary({minutes:1440,now},{files:[{fp:dir+'/missing'}],scan});eq([s.coverage.missingFiles,s.truncated],[1,true]);
await fs.writeFile(dir+'/bad.gz','broken');await assert.rejects(accessSummary({minutes:1440,now},{files:[{fp:dir+'/bad.gz'}],scan}));checks++;
// Restored file mtimes and missing traffic days do not exclude observed records.
await fs.utimes(files[0].fp+'.gz',new Date(0),new Date(0));s=await accessSummary({minutes:1440,now},{files:[{fp:files[0].fp+'.gz',mtimeMs:0}],scan});eq(s.requests,1);
clearHistoricalLogCache();eq(historicalCacheState().events,0);await fs.rm(dir,{recursive:true});console.log(JSON.stringify({result:'PASS',checks,ranges:results.map(({windowMinutes,requests,allowed,blocked,rxBytes,txBytes})=>({windowMinutes,requests,allowed,blocked,rxBytes,txBytes})),timezone:process.env.TZ||'host'}));
