import {test,before,after} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';import zlib from 'node:zlib';import db from '/app/db.js';import {up} from '/app/migrations/20261004010000_historical_summary_index.js';
const k=db();let server,base,token,dir;const now=Date.now(),days=[.1,2,29,31,59,61,89,91,179,181],events=[];
function line(event){const d=new Date(event.ts),months=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];return `[${String(d.getUTCDate()).padStart(2,'0')}/${months[d.getUTCMonth()]}/${d.getUTCFullYear()}:${d.toISOString().slice(11,19)} +0000] - - ${event.status} - GET https fixture.invalid "/fixture" [Client ${event.ip}] [Country US] [Rx 10] [Tx 100]`;}
async function api(route){const r=await fetch(base+route,{headers:{Authorization:'Bearer '+token}});return{status:r.status,data:await r.json()};}
before(async()=>{
 assert.equal(k.client.config.connection.host,'nyxguard-task1-db');assert.equal(k.client.config.connection.database,'task1_fixture');
 await up(k);await up(k);dir=await fs.mkdtemp(path.join(os.tmpdir(),'nyx-analytics-fixture-'));process.env.NYXGUARD_LOG_DIR=dir;process.env.NYXGUARD_IPS_CACHE_TTL_MS='1';process.env.NYXGUARD_LONG_SUMMARY_CACHE_TTL_MS='1';process.env.NYXGUARD_SUMMARY_CACHE_TTL_MS='1';
 for(let i=0;i<days.length;i++)events.push({ts:Math.floor((now-days[i]*86400000)/1000)*1000,ip:'192.0.2.'+(i%3+1),status:i%2?403:200});
 await fs.writeFile(path.join(dir,'proxy-host-1_access.log.1.gz'),zlib.gzipSync(events.map(line).join('\n')+'\n'));await k('nyxguard_traffic_stat').delete();
 await k('nyxguard_traffic_stat').insert(events.map(e=>({proxy_host_id:1,bucket:new Date(e.ts),requests:1,status_2xx:e.status===200?1:0,status_4xx:e.status===403?1:0,bytes_in:10,bytes_out:100})));
 await k('proxy_host').where('id',1).delete();await k('proxy_host').insert({id:1,created_on:k.fn.now(),modified_on:k.fn.now(),owner_user_id:1,domain_names:'["fixture.invalid"]',forward_host:'fixture.invalid',forward_port:80,advanced_config:'',meta:'{}'});
 await (await import('/app/schema/index.js')).getCompiledSchema();token=(await (await import('/app/models/token.js')).default().create({iss:'api',attrs:{id:1},scope:['user'],expiresIn:'1h'})).token;server=(await import('/app/app.js')).default.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));base=`http://127.0.0.1:${server.address().port}/api`;
});
after(async()=>{await new Promise(r=>server.close(r));await fs.rm(dir,{recursive:true,force:true});await k.destroy();});
test('all requested historical windows aggregate the complete source before limiting and preserve archive pagination',async()=>{
 for(const window of [1,30,60,90,180]){
  const wanted=events.filter(e=>e.ts>=Date.now()-window*86400000),blocked=wanted.filter(e=>e.status>=400).length;
  const ips=await api('/nyxguard/ips?minutes='+window*1440+'&limit=50000');assert.equal(ips.status,200);assert.equal(ips.data.items.reduce((s,r)=>s+r.requests,0),wanted.length);assert.equal(ips.data.items.reduce((s,r)=>s+r.blocked,0),blocked);assert.equal(ips.data.items.reduce((s,r)=>s+r.allowed,0),wanted.length-blocked);
  for(const row of ips.data.items){const same=wanted.filter(e=>e.ip===row.ip);assert.equal(row.lastSeen,new Date(Math.max(...same.map(e=>e.ts))).toISOString());assert.deepEqual(row.hosts,['fixture.invalid']);assert.equal(row.country,'US');}
  const summary=await api('/nyxguard/summary?minutes='+window*1440+'&limit=1');assert.equal(summary.status,200);assert.equal(summary.data.requests,wanted.length);assert.equal(summary.data.blocked,blocked);assert.equal(summary.data.allowed,wanted.length-blocked);assert.equal(summary.data.uniqueIps,new Set(wanted.map(e=>e.ip)).size);assert.equal(summary.data.rxBytes,wanted.length*10);assert.equal(summary.data.txBytes,wanted.length*100);assert.equal(summary.data.recent.length,1);assert.equal(summary.data.recent[0].ts,Math.max(...wanted.map(e=>e.ts)));
  if(wanted.length>1){const next=await api('/nyxguard/summary?minutes='+window*1440+'&limit=1&offset=1');assert.equal(next.status,200);assert.notEqual(next.data.recent[0].ts,summary.data.recent[0].ts);}
 }
 const limited=await api('/nyxguard/ips?minutes=259200&limit=1');assert.equal(limited.data.items.length,1);assert.equal(limited.data.total,3);assert.equal(limited.data.limited,true);assert.ok(limited.data.items[0].requests>1);assert.equal((await api('/nyxguard/ips?minutes=259201')).status,400);
});
test('updated archives invalidate parsed snapshots without losing full-window counts',async()=>{
 const file=path.join(dir,'proxy-host-1_access.log.1.gz'),before=await api('/nyxguard/ips?minutes=43200&limit=50000');const extra={ts:Date.now(),ip:'192.0.2.254',status:403};await fs.writeFile(file,zlib.gzipSync([...events,extra].map(line).join('\n')+'\n'));await new Promise(r=>setTimeout(r,5));const after=await api('/nyxguard/ips?minutes=43200&limit=50000');assert.equal(after.data.total,before.data.total+1);const row=after.data.items.find(r=>r.ip===extra.ip);assert.equal(row.requests,1);assert.equal(row.blocked,1);
});
