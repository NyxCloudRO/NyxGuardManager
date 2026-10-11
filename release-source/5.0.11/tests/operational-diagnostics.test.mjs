import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,mkdir,copyFile,rm,access} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
const path=new URL('../internal/operational-diagnostics.mjs',import.meta.url);
const source=(await readFile(path,'utf8')).replace("'./nyxcloud-support/redaction.mjs'",JSON.stringify(new URL('../../5.0.1/diagnostics/redaction.mjs',import.meta.url).href));
const {failureRecord,recordFailure,recentFailures,runtimeChecks,importHostFailures}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const cases=[['Missing Certbot',"ModuleNotFoundError: No module named 'certbot'",'CERTIFICATE_RUNTIME_UNAVAILABLE'],['Cloudflare init','provider failed','CERTIFICATE_PLUGIN_FAILED'],['HTTP challenge','http challenge','CERTIFICATE_CHALLENGE_FAILED'],['DNS challenge','dns challenge','CERTIFICATE_DNS_FAILED'],['Invalid upstream','invalid upstream','INVALID_CONFIGURATION'],['Nginx reload','nginx reload failed','NGINX_CONFIGURATION_FAILED'],['Access enforcement','reload pending','NGINX_RELOAD_ACTIVATION_TIMEOUT'],['VPN unavailable','ECONNREFUSED','INTEGRATION_UNAVAILABLE'],['Database failure','ER_ACCESS_DENIED_ERROR','DATABASE_OPERATION_FAILED'],['Migration failure','migration failed','DATABASE_OPERATION_FAILED'],['Licensing unavailable','ECONNREFUSED','INTEGRATION_UNAVAILABLE']];
for(const [name,message,code] of cases)test(name+' classified without raw secrets',()=>{
 const error=Object.assign(new Error(message+' password=CANARY_SECRET bearer CANARY_TOKEN'),{...(code.startsWith('CERTIFICATE_')&&!message.includes('ModuleNotFoundError')||code==='NGINX_RELOAD_ACTIVATION_TIMEOUT'?{code}:{}),...(code==='INVALID_CONFIGURATION'?{status:400}:{})});
 const event=failureRecord(error,{path:'/api/nginx/certificates/12',method:'POST'});
 assert.equal(event.code,code);assert.match(event.event_id,/^[a-f0-9-]{36}$/);assert.ok(event.recommendation);assert.ok(!JSON.stringify(event).includes('CANARY'));
});
test('unknown failure does not invent root cause',()=>{const event=failureRecord(new Error('unknown'));assert.equal(event.cause_kind,'unconfirmed');assert.match(event.summary,/not been established/);});
test('diagnostic persistence failure cannot replace primary error',async()=>{const db=()=>({insert(){return {timeout(){throw Error('DB DOWN password=CANARY');}}}});const original=console.warn;let output;console.warn=(...args)=>output=args;try{const event=await recordFailure(db,new Error('unknown'));assert.ok(event.event_id);assert.ok(!JSON.stringify(output).includes('CANARY'));}finally{console.warn=original;}});
test('grouping counts only the selected time window',async()=>{
 const now=Date.now();const recent=failureRecord(new Error('ECONNREFUSED'),{now:new Date(now-1000).toISOString(),path:'/vpn',method:'POST'});const older={...recent,event_id:'other',timestamp:new Date(now-2000).toISOString()};const outside={...recent,event_id:'outside',timestamp:new Date(now-3600000).toISOString()};
 const db=()=>({where(field,op,cutoff){this.cutoff=cutoff;return this;},orderBy(){return this;},limit(){return this;},select(){return this;},timeout(){return [recent,older,outside].filter(e=>e.timestamp>=this.cutoff).map(e=>({payload:JSON.stringify(e)}));}});
 const results=await recentFailures(db,{now,windowMinutes:15});assert.equal(results.total,1);assert.equal(results.problems[0].count,2);assert.equal(results.problems[0].first_seen,older.timestamp);assert.equal(results.problems[0].last_seen,recent.timestamp);
});
test('bounded read-only runtime checks distinguish failures',async()=>{let n=0;const checks=await runtimeChecks(async(command,args,options)=>{assert.ok(options.timeout<=3000);if(n++===0)throw Error('missing');});assert.equal(checks[0].state,'FAIL');assert.ok(checks.slice(1).every(check=>check.state==='PASS'));});
test('safe nested events support repeated API and bundle sanitization',async()=>{
 const {redact}=await import('../../5.0.1/diagnostics/redaction.mjs');
 const event=failureRecord(new Error("ModuleNotFoundError: No module named 'certbot' password=CANARY"));
 assert.equal(event.details.missing_module,'certbot');
 assert.doesNotThrow(()=>redact({problems:[event]}));
});
test('actual patched bundle includes diagnostic identity evidence and manifest without credentials',async(t)=>{
 const app=process.env.NYXGUARD_TEST_APP||'/app';
 try{await access(app+'/app.js');}catch{return t.skip('Pinned private app filesystem required for release patch integration');}
 const fixture=await mkdtemp(tmpdir()+'/nyx-diagnostic-patch-');
 for(const file of ['app.js','routes/professional-support.js','internal/nyxcloud-support/bundle.mjs','internal/certificate.js','internal/update-manager.js','frontend/assets/professional-support.js','frontend/assets/professional-support.css','routes/nyxguard/settings.js','internal/setting.js','internal/traffic-monitor.js']){
  await mkdir(fixture+'/'+file.split('/').slice(0,-1).join('/'),{recursive:true});await copyFile(app+'/'+file,fixture+'/'+file);
 }
 const patched=spawnSync(process.execPath,[new URL('../patch-operational-diagnostics.mjs',import.meta.url).pathname,fixture],{encoding:'utf8'});assert.equal(patched.status,0,patched.stderr);
 let bundleSource=await readFile(fixture+'/internal/nyxcloud-support/bundle.mjs','utf8');await rm(fixture,{recursive:true,force:true});
 bundleSource=bundleSource.replace('"./redaction.mjs"',JSON.stringify(new URL('../../5.0.1/diagnostics/redaction.mjs',import.meta.url).href)).replace('"./result.mjs"',JSON.stringify(new URL('../../5.0.1/diagnostics/result.mjs',import.meta.url).href));
 const {buildSupportBundle}=await import('data:text/javascript;base64,'+Buffer.from(bundleSource).toString('base64'));
 const event=failureRecord(new Error("ModuleNotFoundError: No module named 'certbot' password=CANARY"));
 const result=buildSupportBundle({version:'5.0.11',installationId:'ca557839-c83b-4e25-8323-46c88ed19d17',operationalEvents:{problems:[event],password:'CANARY_BUNDLE'},operationalState:Object.assign(Object.create(null),{manager:{state:'running'}})});
 assert.equal(result.bundle.operational_diagnostics.problems[0].event_id,event.event_id);assert.equal(result.bundle.operational_diagnostics.problems[0].details.missing_module,'certbot');assert.ok(result.bundle.manifest.included.includes('operational_diagnostics'));assert.ok(!result.bytes.toString().includes('CANARY'));
});
test('host updater summary imports deduplicated IDs and fixed safe evidence',async()=>{
 const {writeFile}=await import('node:fs/promises');const fixture=await mkdtemp(tmpdir()+'/nyx-host-events-');const path=fixture+'/events.json';let inserted;
 const id='5c7c3784-06d8-4bdd-baf4-6d1b3059800e';
 await writeFile(path,JSON.stringify({format:'nyxguard-host-operational-v1',events:[{event_id:id,timestamp:new Date().toISOString(),code:'HOST_RECOVERY_INCOMPLETE',outcome:'partially_completed',correlation_id:id,version:'5.0.11',application_state:'recovery_incomplete',details:{stage:'rollback',recovery_state:'recovery_incomplete',password:'CANARY'},summary:'password=CANARY_RAW',arbitrary:'CANARY'}]}));
 const db=()=>({insert(rows){inserted=rows;return this;},onConflict(key){assert.equal(key,'event_id');return this;},ignore(){return this;},timeout(){return [];},where(){return this;},delete(){return this;},orderBy(){return this;},offset(){return this;},limit(){return this;},select(){return this;}});
 const imported=await importHostFailures(db,{path});assert.equal(imported.state,'available');assert.equal(inserted[0].event_id,id);const event=JSON.parse(inserted[0].payload);assert.equal(event.details.stage,'rollback');assert.equal(event.outcome,'partially_completed');assert.ok(!JSON.stringify(inserted).includes('CANARY'));await rm(fixture,{recursive:true,force:true});
});
test('host bridge rejects symlink and malformed oversized input',async()=>{
 const {writeFile,symlink}=await import('node:fs/promises');const fixture=await mkdtemp(tmpdir()+'/nyx-host-malformed-');await writeFile(fixture+'/large','x'.repeat(131073));await symlink(fixture+'/large',fixture+'/link');
 const db=()=>{throw Error('unsafe bridge must not query database');};
 assert.equal((await importHostFailures(db,{path:fixture+'/link'})).state,'unavailable');assert.equal((await importHostFailures(db,{path:fixture+'/large'})).state,'unavailable');await rm(fixture,{recursive:true,force:true});
});
test('actual support frontend preserves bounded safe diagnostic references and rejects raw secrets',async(t)=>{
 const app=process.env.NYXGUARD_TEST_APP||'/app';try{await access(app+'/app.js');}catch{return t.skip('Pinned app filesystem required');}
 const fixture=await mkdtemp(tmpdir()+'/nyx-frontend-patch-');
 for(const file of ['app.js','routes/professional-support.js','internal/nyxcloud-support/bundle.mjs','internal/certificate.js','internal/update-manager.js','frontend/assets/professional-support.js','frontend/assets/professional-support.css','routes/nyxguard/settings.js','internal/setting.js','internal/traffic-monitor.js']){await mkdir(fixture+'/'+file.split('/').slice(0,-1).join('/'),{recursive:true});await copyFile(app+'/'+file,fixture+'/'+file);}
 const patch=spawnSync(process.execPath,[new URL('../patch-operational-diagnostics.mjs',import.meta.url).pathname,fixture],{encoding:'utf8'});assert.equal(patch.status,0,patch.stderr);
 const source=await readFile(fixture+'/frontend/assets/professional-support.js','utf8');await rm(fixture,{recursive:true,force:true});
 const method=source.slice(source.indexOf('  async function requestResponse('),source.indexOf('  async function request(path,'));
 const call=message=>new Function('token','fetch',method+';return requestResponse;')(()=> 'test-session',async()=>({ok:false,status:503,json:async()=>({error:{diagnostic_id:'ca557839-c83b-4e25-8323-46c88ed19d17',message}})}));
 const safe='Service unavailable. Diagnostic reference: ca557839-c83b-4e25-8323-46c88ed19d17.';
 await assert.rejects(call(safe)('/api/test'),{message:safe});await assert.rejects(call('password=CANARY')('/api/test'),{message:'Request failed (HTTP 503).'});await assert.rejects(call('a'.repeat(601))('/api/test'),{message:'Request failed (HTTP 503).'});
});
test('VPN unavailable wrapper remains actionable without inventing connectivity root cause',()=>{
 const event=failureRecord(new Error('VPN agent is unavailable. Check that the nyxguard-vpn-agent container is running.'),{path:'/api/vpn-client/sites',method:'POST'});
 assert.equal(event.component,'VPN Agent');assert.equal(event.code,'INTEGRATION_UNAVAILABLE');assert.equal(event.cause_kind,'reported_error');assert.ok(!event.cause.includes('credentials'));
});

test('patched swallowed administrative/background failures propagate or persist with honest partial state',async(t)=>{
 const app=process.env.NYXGUARD_TEST_APP||'/app';try{await access(app+'/app.js');}catch{return t.skip('Pinned app filesystem required');}
 const fixture=await mkdtemp(tmpdir()+'/nyx-swallowed-patch-');
 try{
  for(const file of ['app.js','routes/professional-support.js','internal/nyxcloud-support/bundle.mjs','internal/certificate.js','internal/update-manager.js','frontend/assets/professional-support.js','frontend/assets/professional-support.css','routes/nyxguard/settings.js','internal/setting.js','internal/traffic-monitor.js']){await mkdir(fixture+'/'+file.split('/').slice(0,-1).join('/'),{recursive:true});await copyFile(app+'/'+file,fixture+'/'+file);}
  const patch=spawnSync(process.execPath,[new URL('../patch-operational-diagnostics.mjs',import.meta.url).pathname,fixture],{encoding:'utf8'});assert.equal(patch.status,0,patch.stderr);
  const settingSource=await readFile(fixture+'/internal/setting.js','utf8');
  let tests=0,reloads=0;
  const nginx={deleteConfig:async()=>{},generateConfig:async()=>{},test:async()=>{if(++tests===1)throw Error('invalid nginx password=CANARY');},reload:async()=>{reloads++;}};
  const model={query:()=>({where:()=>({patch:async()=>1})})};
  const setting=new Function('internalNginx','settingModel','errs','fs',settingSource.slice(settingSource.indexOf('const internalSetting ='),settingSource.indexOf('export default'))+';return internalSetting;')(nginx,model,{},{});
  setting.get=async()=>({id:'default-site',value:'404'});
  await assert.rejects(setting.update({can:async()=>{}},{id:'default-site',value:'404'}),error=>error.code==='NGINX_CONFIGURATION_FAILED'&&error.outcome==='partially_completed'&&!error.message.includes('CANARY'));
  assert.equal(reloads,1,'cleanup is awaited before administrative failure propagates');
  const globalSource=await readFile(fixture+'/routes/nyxguard/settings.js','utf8');
  const section=globalSource.slice(globalSource.indexOf('let partialSyncFailure;'),globalSource.indexOf('res.status(200).send(nextSettings);'));
  for(const failure of ['outer','perhost']){
   let applied=0;
   const error=Object.assign(new Error('database password=CANARY'),{code:'ER_LOCK_WAIT_TIMEOUT'});
   const db=table=>({where(){return this;},whereIn(){return this;},select:async()=>{if(failure==='outer')throw error;return [{proxy_host_id:4}];},update:async()=>{},first:async()=>{throw error;}});
   const task=new Function('db','data','internalNyxGuard','res','internalProxyHost','return(async()=>{'+section+'})()')(db,{authBypassEnabled:true},{settings:{update:async()=>({})},nginx:{apply:async()=>{applied++;}}},{locals:{access:{}}},{});
   await assert.rejects(task,e=>e.code==='DATABASE_OPERATION_FAILED'&&e.outcome==='partially_completed'&&!e.message.includes('CANARY'));assert.equal(applied,1,'existing final enforcement apply still attempted');
  }
  const trafficSource=(await readFile(fixture+'/internal/traffic-monitor.js','utf8')).replace(/^import .*;\n/gm,'').replace(/export default internalTrafficMonitor;?/,'');
  for(const scenario of ['retention','missing_table','missing_log','log_permission']){
   const recorded=[];const fault=Object.assign(new Error('ER_LOCK_WAIT_TIMEOUT password=CANARY'),{code:scenario==='missing_table'?'ER_NO_SUCH_TABLE':scenario==='missing_log'?'ENOENT':scenario==='log_permission'?'EACCES':'ER_LOCK_WAIT_TIMEOUT'});
   const query=()=>({select(){return this;},limit:async()=>{if(scenario==='missing_table')throw fault;return [];},then(resolve){resolve([]);},where(){return this;},delete:async()=>{if(scenario==='retention')throw fault;}});
   const files={readdir:async()=>scenario.includes('log')?['proxy-host-4_access.log']:[],stat:async()=>{throw fault;}};
   const {pollOnce}=new Function('db','fs','path','logger','recordTrafficFailure',trafficSource+';return {pollOnce};')(()=>query,files,{join:(...x)=>x.join('/')},{info:()=>{}},async(_db,e,context)=>recorded.push({e,context}));
   await pollOnce();assert.equal(recorded.length,['retention','log_permission'].includes(scenario)?1:0,scenario+': '+recorded.map(x=>x.context.operation+' '+x.e.message).join(';')); 
   if(recorded.length){assert.equal(recorded[0].context.component,'Traffic Monitor');const event=failureRecord(recorded[0].e,recorded[0].context);assert.ok(!JSON.stringify(event).includes('CANARY'));}
  }
 }finally{await rm(fixture,{recursive:true,force:true});}
});
