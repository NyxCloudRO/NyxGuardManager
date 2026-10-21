import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
export const BUCKET_MS=300000,RETENTION_DAYS=180;
const months=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const quoted='"(?:[^"\\\\]|\\\\.)*"';
const record=new RegExp('^\\[(?<stamp>[^\\]]+)\\] (?<cache>\\S+) (?<upstream>[-0-9,: ]+?) (?<status>[1-5][0-9]{2}|-) - (?<method>[A-Z]+) (?<scheme>https?) (?<host>[^\\s"]+) '+quoted+' \\[Client [^\\]\\s]+\\](?: \\[Country [A-Za-z-]{1,3}\\])? \\[Rx (?<rx>[0-9]+)\\] \\[Tx (?<tx>[0-9]+)\\](?: \\[Length [0-9]+\\] \\[Gzip [^\\]]+\\](?: \\[Sent-to [^\\]]+\\])? '+quoted+' '+quoted+')?$');
export function utcSql(ms){return new Date(ms).toISOString().slice(0,19).replace('T',' ');}
export function parseTrafficLine(line){
 const m=record.exec(line);if(!m)return null;const g=m.groups;
 if(!/^(?:-|[1-5]\d{2})(?:(?:,\s*|\s*:\s*)(?:-|[1-5]\d{2}))*$/.test(g.upstream))return null;
 const t=/^(\d{2})\/(\w{3})\/(\d{4}):(\d{2}):(\d{2}):(\d{2}) ([+-])(\d{2})(\d{2})$/.exec(g.stamp);if(!t)return null;
 const [day,year,hour,minute,second,oh,om]=[t[1],t[3],t[4],t[5],t[6],t[8],t[9]].map(Number),month=months.indexOf(t[2]);
 if(month<0||hour>23||minute>59||second>59||oh>23||om>59)return null;
 const local=Date.UTC(year,month,day,hour,minute,second),check=new Date(local);if(check.getUTCFullYear()!==year||check.getUTCMonth()!==month||check.getUTCDate()!==day)return null;
 const ts=local-(t[7]==='-'?-1:1)*(oh*60+om)*60000,rx=Number(g.rx),tx=Number(g.tx);if(![ts,rx,tx].every(Number.isSafeInteger))return null;
 return {ts,status:g.status==='-'?null:Number(g.status),rx,tx};
}
const sha=b=>createHash('sha256').update(b).digest('hex');
async function digestAt(file,offset){
 const n=Math.min(offset,4096),tail=Math.min(offset,128),prefix=Buffer.alloc(n),last=Buffer.alloc(tail);
 if(n&&(await file.read(prefix,0,n,0)).bytesRead!==n)return null;
 if(tail&&(await file.read(last,0,tail,offset-tail)).bytesRead!==tail)return null;
 return {prefix:sha(prefix),tail:sha(last),length:n};
}
function same(a,b){return !!a&&!!b&&a.prefix===b.prefix&&a.tail===b.tail&&a.length===b.length;}
function safeSum(a,b){const v=a+b;if(!Number.isSafeInteger(v))throw Error('Traffic chunk exceeds exact integer range');return v;}
export function createTrafficCollector(k,{dir='/data/logs',chunkBytes=4*1024*1024,now=Date.now,beforeCommit=async()=>{},afterCommit=async()=>{}}={}){
 let active=null;
 async function pollFile(canonical,hostId,entries){
  // Both mutable tables must be transactional. State row locking serializes other workers.
  await k('nyxguard_traffic_state').insert({log_path:canonical,inode:0,offset:0}).onConflict('log_path').ignore();
  return k.transaction(async trx=>{
   const state=await trx('nyxguard_traffic_state').where('log_path',canonical).forUpdate().first();
   let meta;try{meta=JSON.parse(state.integrity||'{}')}catch{throw Error('Invalid traffic cursor metadata');}
   let offset=Number(state.offset),file,selected=canonical,rotated=false;
   try{
    let st;try{st=await fs.stat(canonical)}catch(e){if(e.code!=='ENOENT')throw e;}
    if(Number(state.inode)&&(!st||Number(st.ino)!==Number(state.inode))){
     // Finish the retained renamed generation before starting the new current file.
     for(const entry of entries.filter(n=>n.startsWith(path.basename(canonical)+'.')&&!n.endsWith('.gz'))){
      const candidate=path.join(dir,entry);let old;try{old=await fs.stat(candidate)}catch{continue;}
      if(Number(old.ino)===Number(state.inode)&&(!meta.dev||Number(old.dev)===meta.dev)){selected=candidate;st=old;rotated=true;break;}
     }
     if(!rotated&&st){meta.gaps=(meta.gaps||0)+1;meta.lastGap='previous_generation_unavailable';offset=0;meta.anchor=null;meta.generation=randomUUID();}
    }
    if(!st){meta.missing=true;meta.lastMissingAt=new Date(now()).toISOString();await trx('nyxguard_traffic_state').where('log_path',canonical).update({integrity:JSON.stringify(meta)});return {missing:true};}meta.missing=false;file=await fs.open(selected,'r');st=await file.stat();
    if(st.size<offset||(meta.anchor&&!same(meta.anchor,await digestAt(file,offset)))){meta.gaps=(meta.gaps||0)+1;meta.lastGap='truncated_or_rewritten';offset=0;meta.anchor=null;meta.generation=randomUUID();}
    // Adopt an existing legacy offset, never replay its already-accounted prefix.
    meta.version=2;meta.generation??=randomUUID();meta.startedAt??=new Date(now()).toISOString();meta.dev=Number(st.dev);
    if(st.size===offset){
     if(rotated){const current=await fs.stat(canonical).catch(()=>null);if(current&&current.ino!==st.ino){meta.anchor=null;meta.generation=randomUUID();await trx('nyxguard_traffic_state').where('log_path',canonical).update({inode:current.ino,offset:0,integrity:JSON.stringify(meta),modified_on:trx.fn.now()});return {rotated:true};}}
     meta.anchor=await digestAt(file,offset);await trx('nyxguard_traffic_state').where('log_path',canonical).update({inode:st.ino,integrity:JSON.stringify(meta),modified_on:trx.fn.now()});return {records:0};
    }
    const readAnchor=await digestAt(file,offset);
    const count=Math.min(chunkBytes,st.size-offset),buffer=Buffer.alloc(count),n=(await file.read(buffer,0,count,offset)).bytesRead,complete=buffer.subarray(0,n).lastIndexOf(10);
    if(complete<0){
     // Never advance across a partial line. An excessive line is explicit, not skipped.
     if(n===chunkBytes)throw Error('Traffic log line exceeds bounded chunk');
     if(rotated){const current=await fs.stat(canonical).catch(()=>null);if(current&&current.ino!==st.ino){meta.gaps=(meta.gaps||0)+1;meta.lastGap='retired_partial_record';meta.anchor=null;meta.generation=randomUUID();await trx('nyxguard_traffic_state').where('log_path',canonical).update({inode:current.ino,offset:0,integrity:JSON.stringify(meta),modified_on:trx.fn.now()});return {rotated:true,partial:true};}}return {partial:true};
    }
    const consumed=complete+1,nextOffset=offset+consumed,buckets=new Map();let records=0,rejected=0,expired=0;
    for(const line of buffer.subarray(0,consumed).toString('utf8').split('\n')){
     if(!line)continue;const event=parseTrafficLine(line.replace(/\r$/,''));if(!event){rejected++;continue;}
     if(event.ts<now()-RETENTION_DAYS*86400000){expired++;continue;}
     const bucket=utcSql(Math.floor(event.ts/BUCKET_MS)*BUCKET_MS);let row=buckets.get(bucket);
     if(!row){row={proxy_host_id:hostId,bucket,requests:0,bytes_in:0,bytes_out:0,status_2xx:0,status_3xx:0,status_4xx:0,status_5xx:0};buckets.set(bucket,row);}
     row.requests++;row.bytes_in=safeSum(row.bytes_in,event.rx);row.bytes_out=safeSum(row.bytes_out,event.tx);const group=Math.floor(event.status/100);if(group>=2&&group<=5)row['status_'+group+'xx']++;records++;
    }
    // Detect copy-truncate/rewrite during the read before committing its after-images.
    if((await file.stat()).size<nextOffset||!same(await digestAt(file,offset),readAnchor))throw Error('Traffic source changed during read');
    const rows=[...buckets.values()],columns=['requests','bytes_in','bytes_out','status_2xx','status_3xx','status_4xx','status_5xx'];
    for(let at=0;at<rows.length;at+=200)await trx('nyxguard_traffic_stat').insert(rows.slice(at,at+200)).onConflict(['proxy_host_id','bucket']).merge(Object.fromEntries(columns.map(c=>[c,trx.raw('?? + VALUES(??)',[c,c])])));
    meta.anchor=await digestAt(file,nextOffset);meta.rejected=(meta.rejected||0)+rejected;meta.expired=(meta.expired||0)+expired;meta.records=(meta.records||0)+records;meta.lastSuccess=new Date(now()).toISOString();
    await trx('nyxguard_traffic_state').where('log_path',canonical).update({inode:st.ino,offset:nextOffset,integrity:JSON.stringify(meta),modified_on:trx.fn.now()});
    await beforeCommit({offset:nextOffset,records});return {records,rejected,expired,offset:nextOffset};
   }finally{await file?.close();}
  }).then(async result=>{await afterCommit(result);return result;});
 }
 async function execute(){
  const [engine]=await k.raw("SELECT TABLE_NAME,ENGINE FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN ('nyxguard_traffic_stat','nyxguard_traffic_state')");
  if(engine.length!==2||engine.some(r=>r.ENGINE!=='InnoDB'))throw Error('Traffic ingestion requires migrated InnoDB tables');
  const entries=await fs.readdir(dir),known=await k('nyxguard_traffic_state').select('log_path'),paths=new Set(entries.filter(n=>/^proxy-host-\d+_access\.log$/.test(n)).map(n=>path.join(dir,n)));
  for(const row of known)if(path.dirname(row.log_path)===dir)paths.add(row.log_path);
  const results=[],failures=[];for(const fp of paths){const m=/^proxy-host-(\d+)_access\.log$/.exec(path.basename(fp));if(m){try{results.push(await pollFile(fp,Number(m[1]),entries));}catch(error){failures.push(error);}}}
  // Floor to the beginning of a bucket; preserve the partial retention-boundary bucket.
  await k('nyxguard_traffic_stat').where('bucket','<',utcSql(Math.floor((now()-RETENTION_DAYS*86400000)/BUCKET_MS)*BUCKET_MS)).delete();if(failures.length)throw new AggregateError(failures,'Traffic source ingestion failed: '+failures[0].message);return results;
 }
 return {poll(){if(active)return active;active=execute().finally(()=>{active=null});return active;},get running(){return !!active;}};
}
export function alignedTrafficWindow(hours,now=Date.now()){
 if(![1,24,48,168,336,720,1440,2160,4320].includes(hours))throw Error('Unsupported metric window');
 const end=Math.floor(now/BUCKET_MS)*BUCKET_MS;return {start:end-hours*3600000,end,startSql:utcSql(end-hours*3600000),endSql:utcSql(end)};
}
