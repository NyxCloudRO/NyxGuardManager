import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
const policy=JSON.parse(await fs.readFile(new URL('../internal/release-policy.json',import.meta.url)));
test('new operational diagnostics migration advances only target schema',()=>{
 assert.equal(policy.version,'5.0.11');assert.equal(policy.schema,46);
 assert.deepEqual(policy.sources,{'5.0.0':42,'5.0.1':42,'5.0.2':43,'5.0.3':45,'5.0.4':45,'5.0.5':45,'5.0.6':45,'5.0.7':45,'5.0.8':45,'5.0.9':45,'5.0.10':45});
});
test('patched readiness accepts exactly the target migration schema',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'nyx-schema-'));
 try{
  await fs.mkdir(path.join(root,'internal'));
  await fs.writeFile(path.join(root,'internal/release-policy.json'),JSON.stringify(policy));
  await fs.writeFile(path.join(root,'internal/release-policy.mjs'),"export default "+JSON.stringify(policy));
  await fs.writeFile(path.join(root,'internal/readiness-policy.mjs'),'export const policy={probeDeadlineMs:1000};');
  await fs.writeFile(path.join(root,'internal/readiness-probe.mjs'),`import {policy} from './readiness-policy.mjs';
try {const response=await fetch('http://127.0.0.1:3000/_nyxguard/ready',{signal:AbortSignal.timeout(policy.probeDeadlineMs)});const body=await response.json();
if(!response.ok||body.ready!==true||body.version!==process.env.NPM_BUILD_VERSION||body.schema!==45||body.integrity!==true)throw Error('Readiness');} catch {process.exitCode=1;}`);
  for(const file of ['migrate.js','internal/observed-migrations.mjs','internal/startup-progress.mjs'])await fs.writeFile(path.join(root,file),'');
  execFileSync(process.execPath,[new URL('../patch-observability.mjs',import.meta.url).pathname,root]);
  for(const [schema,pass] of [[45,false],[46,true],[47,false]]){
   const body={ready:true,version:'5.0.11',schema,integrity:true};
   const program=`globalThis.fetch=async()=>({ok:true,json:async()=>(${JSON.stringify(body)})});await import(${JSON.stringify(new URL('file://'+path.join(root,'internal/readiness-probe.mjs')).href)});`;
   let accepted=true;
   try{execFileSync(process.execPath,['--input-type=module','-e',program],{env:{...process.env,NPM_BUILD_VERSION:'5.0.11'},stdio:'pipe'});}catch{accepted=false;}
   assert.equal(accepted,pass,'Readiness schema '+schema);
  }
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
