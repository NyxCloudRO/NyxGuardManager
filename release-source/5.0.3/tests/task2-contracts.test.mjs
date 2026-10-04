import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';import zlib from 'node:zlib';import vm from 'node:vm';
import {scanHistoricalLog,clearHistoricalLogCache,historicalCacheState} from '/app/internal/historical-log-cache.mjs';
const parse=line=>{const [ts,ip]=line.split(' ');return ip?{ts:Number(ts),ip}:null;};
test('historical cache preserves exact boundaries, invalidates append/truncate/rotation and survives eviction',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'nyx-history-'));try{
  const file=path.join(dir,'access.log');await fs.writeFile(file,'1 first\n2 second\n3 third\n');
  const scan=async(fp,since)=>{const got=[];const result=await scanHistoricalLog({fp,sinceMs:since,onEvent:r=>got.push(r)},parse);return{got,result};};
  assert.deepEqual((await scan(file,2)).got.map(r=>r.ts),[2,3]);assert.equal((await scan(file,1)).result.cacheHit,true);
  await scanHistoricalLog({fp:file,sinceMs:0,onEvent:event=>Object.defineProperty(event,'arrival',{value:1})},parse);
  await scanHistoricalLog({fp:file,sinceMs:0,onEvent:event=>Object.defineProperty(event,'arrival',{value:2})},parse);
  await fs.appendFile(file,'4 appended\n');assert.deepEqual((await scan(file,3)).got.map(r=>r.ts),[3,4]);
  await fs.writeFile(file,'5 replaced\n');assert.deepEqual((await scan(file,1)).got,[{ts:5,ip:'replaced'}]);
  await fs.rename(file,file+'.1');await fs.writeFile(file,'6 new-inode\n');assert.equal((await scan(file,1)).got[0].ts,6);
  const gz=file+'.gz';await fs.writeFile(gz,zlib.gzipSync('7 compressed\n8 newer\n'));assert.equal((await scan(gz,8)).got.length,1);assert.equal((await scan(gz,7)).got.length,2);
  clearHistoricalLogCache();assert.equal(historicalCacheState().events,0);assert.equal((await scan(gz,7)).got.length,2);
  await fs.writeFile(gz,'corrupt');await assert.rejects(scan(gz,1));
 }finally{clearHistoricalLogCache();await fs.rm(dir,{recursive:true,force:true});}
});
test('file cache memory ceiling cannot truncate a larger history',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'nyx-cache-bound-')),file=path.join(dir,'large.log');try{
 await fs.writeFile(file,Array.from({length:250003},(_,i)=>`${i} fixture`).join('\n')+'\n');let n=0;await scanHistoricalLog({fp:file,sinceMs:0,onEvent:()=>n++},parse);assert.equal(n,250003);assert.equal(historicalCacheState().events,0);
 }finally{clearHistoricalLogCache();await fs.rm(dir,{recursive:true,force:true});}
});
test('theme store isolates users, validates preferences and retains selection across refresh/reauthentication',async()=>{
 const source=await fs.readFile(new URL('../frontend/theme-preferences.js',import.meta.url),'utf8'),storage=new Map(),attrs={};
 const context={window:{localStorage:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v)},atob:s=>Buffer.from(s,'base64').toString(),document:{documentElement:{setAttribute:(k,v)=>attrs[k]=v}},dispatchEvent:()=>{}},Event:class{}};
 const login=id=>storage.set('authentications',JSON.stringify([{token:'fixture.'+Buffer.from(JSON.stringify({attrs:{id},exp:Date.now()/1000+3600})).toString('base64url')+'.signature'}]));
 const boot=()=>{vm.runInNewContext(source,context);return context.window.NyxThemePreferences;};
 login(1);let prefs=boot();assert.equal(prefs.read(),'premium-nyx');prefs.write('void-black');assert.equal(boot().read(),'void-black');
 storage.set('authentications','[]');assert.equal(boot().read(),'premium-nyx');login(1);assert.equal(boot().read(),'void-black');
 login(2);assert.equal(boot().read(),'premium-nyx');prefs=boot();prefs.write('forest');login(1);assert.equal(boot().read(),'void-black');
 storage.set('app_theme:user:1','invalid-theme');assert.equal(boot().read(),'premium-nyx');assert.equal(attrs['data-app-theme'],'premium-nyx');
 context.window.localStorage.getItem=()=>{throw Error('storage unavailable');};assert.equal(boot().read(),'premium-nyx');
});
