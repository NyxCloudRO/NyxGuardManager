import assert from 'node:assert/strict';
import fs from 'node:fs';
import {validateCertificateDomains} from '../internal/certificate-domains.mjs';
import {runCertbot,certificateOperation} from '../internal/certificate-errors.mjs';

// Exercise the shipped module body, replacing only its external services. No
// database, nginx, provider credentials or real ACME calls participate.
const filename=process.argv[2]||'/app/internal/certificate.js';
const source=fs.readFileSync(filename,'utf8').replace(/^import .*;\r?\n/gm,'').replace('export default internalCertificate;','return internalCertificate;');
const logs=[],commands=[],events=[],files=new Map(),rows=new Map();
let failure=null,pluginFailure=null,nextId=1;
const logger=new Proxy({}, {get:()=>(...values)=>logs.push(values.map(value=>typeof value==='string'?value:JSON.stringify(value)).join(' '))});
const execFile=async(command,args,options)=>{
 commands.push({command,args,options});
 if(failure)throw new Error(failure);
 return 'provider-output synthetic-secret-token';
};
const model={knex:()=>({}),query:()=>({
 insertAndFetch:async(data)=>{const row={...data,id:nextId++};rows.set(row.id,row);return row;},
 deleteById:async(id)=>{events.push('delete:'+id);rows.delete(id);},
 patchAndFetchById:async(id,data)=>{events.push('patch:'+id);const row={...rows.get(id),...data};rows.set(id,row);return row;},
})};
const user={query:()=>({where(){return this;},andWhere(){return this;},first:async()=>({email:'operator@disposable.invalid'})})};
const fakeFs={promises:{rm:async(name)=>files.delete(name)},existsSync:()=>true,writeFile:(name,data,callback)=>{files.set(name,{data});callback();},mkdirSync:()=>{},writeFileSync:(name,data,options)=>files.set(name,{data,mode:options.mode}),unlink:(name,callback)=>{files.delete(name);callback?.();}};
const nginx=new Proxy({}, {get:(_,name)=>async()=>events.push(name)});
const notifications={send:async()=>events.push('notify')};
const audit={add:async()=>events.push('audit'),addSystem:async()=>events.push('audit')};
const utils={execFile,omitRow:()=>row=>row};
const moment=()=>({format:()=> '2030-01-01 00:00:00'});
const error={ValidationError:Error};
const args=['validateCertificateDomains','runCertbot','certificateOperation','fs','https','path','archiver','_','moment','ProxyAgent','tempWrite','dnsPlugins','installPlugin','useLetsencryptServer','useLetsencryptStaging','error','utils','debug','logger','certificateModel','tokenModel','userModel','internalAuditLog','internalHost','internalNginx','internalNotifications'];
const values=[validateCertificateDomains,runCertbot,certificateOperation,fakeFs,{}, {}, {},{assign:Object.assign,clone:value=>({...value}),pick:(value,keys)=>Object.fromEntries(keys.filter(key=>key in value).map(key=>[key,value[key]])),map:(value,fn)=>Object.entries(value).map(([key,item])=>fn(item,key))},moment,()=>{}, {},{cloudflare:{name:'Cloudflare',full_plugin_name:'dns-cloudflare'}},async()=>{if(pluginFailure)throw new Error(pluginFailure);events.push('installPlugin');},()=>false,()=>false,error,utils,false,logger,model,()=>({}),user,audit,{getHostsWithDomains:async()=>[]},nginx,notifications];
const cert=new Function(...args,source)(...values);
cert.getAdditionalCertbotArgs=()=>({args:[],opts:{}});
cert.disableInUseHosts=async()=>events.push('disable');
cert.enableInUseHosts=async()=>events.push('enable');
cert.getCertificateInfoFromFile=async()=>({dates:{to:1893456000}});
cert.addCreatedAuditLog=async()=>events.push('createdAudit');
cert.get=async(_,data)=>rows.get(data.id);
const access={can:async()=>({}),token:{getUserId:()=>1}};
const data=dns=>({provider:'letsencrypt',domain_names:['disposable.invalid'],meta:dns?{dns_challenge:true,dns_provider:'cloudflare',dns_provider_credentials:'synthetic-secret-token'}:{}});

for(const dns of [false,true]){
 commands.length=0;events.length=0;
 const created=await cert.create(access,data(dns));
 assert(rows.has(created.id));assert(created.expires_on);
 assert(events.includes('enable'));
 const command=commands.at(-1);
 assert.equal(command.command,'certbot');assert.equal(command.args[0],'certonly');
 assert(command.args.includes(dns?'dns':'http'));
 if(dns){const credential=files.get(`/etc/letsencrypt/credentials/credentials-${created.id}`);assert.equal(credential.mode,0o600);}
 commands.length=0;
 const renewed=await cert.renew(access,{id:created.id});
 assert.equal(renewed.id,created.id);assert(commands[0].args.includes('renew'));
 assert(commands[0].args.includes(dns?'dns':'http'));assert(events.includes('audit'));assert(events.includes('notify'));
}
for(const [problem,code] of [
 ["ModuleNotFoundError: No module named 'certbot' synthetic-secret-token",'CERTIFICATE_RUNTIME_UNAVAILABLE'],
 ['invalid Cloudflare API token synthetic-secret-token','CERTIFICATE_DNS_CREDENTIALS'],
 ['DNS problem: NXDOMAIN synthetic-secret-token','CERTIFICATE_DNS_FAILED'],
 ['Connection refused synthetic-secret-token','CERTIFICATE_NETWORK_FAILED'],
 ['unauthorized challenge failed synthetic-secret-token','CERTIFICATE_CHALLENGE_FAILED'],
]){
 for(const dns of [false,true]){
  failure=problem;events.length=0;const id=nextId;
  await assert.rejects(cert.create(access,data(dns)),err=>err.code===code&&err.status===400&&!err.message.includes('synthetic-secret-token')&&!err.cause);
  assert(!rows.has(id),'Failed issuance retained a usable record');assert(events.includes('enable'));
  assert(!files.has(`/etc/letsencrypt/credentials/credentials-${id}`),'Failed DNS issuance retained credentials');
  if(!dns)assert(events.includes('deleteLetsEncryptRequestConfig'));
 }
}
failure=null;pluginFailure='DNS plugin packaging initialization failed synthetic-secret-token';
const pluginId=nextId;
await assert.rejects(cert.create(access,data(true)),err=>err.code==='CERTIFICATE_PLUGIN_FAILED'&&!err.message.includes('synthetic-secret-token'));
assert(!rows.has(pluginId),'Failed plugin initialization retained a usable record');
assert(!files.has(`/etc/letsencrypt/credentials/credentials-${pluginId}`));
pluginFailure=null;
const existing=rows.values().next().value;
events.length=0;failure='Connection refused synthetic-secret-token';
await assert.rejects(cert.renew(access,{id:existing.id}),err=>err.code==='CERTIFICATE_NETWORK_FAILED');
assert(rows.has(existing.id),'Failed renewal deleted existing certificate');
assert(!events.includes('patch:'+existing.id),'Failed renewal changed expiry');
await cert.writeCustomCert({id:999,provider:'other',meta:{certificate:'synthetic-secret-token',certificate_key:'synthetic-secret-token'}});
rows.set(999,{id:999,provider:'other',meta:{}});
cert.validate=async()=>({certificate:{dates:{to:1893456000},cn:'disposable.invalid'}});
cert.update=async()=>({id:999,provider:'other',meta:{}});
const uploaded=await cert.upload(access,{id:999,files:{certificate:{data:Buffer.from('synthetic-secret-token')},certificate_key:{data:Buffer.from('synthetic-secret-token')}}});
assert.deepEqual(uploaded,{certificate:true,certificate_key:true});
assert(!JSON.stringify(uploaded).includes('synthetic-secret-token'),'Upload response exposed private certificate material');
assert(!logs.some(x=>x.includes('synthetic-secret-token')),'Provider output or credentials reached application logs');
console.log('PASS: shipped HTTP/DNS creation and renewal logic, failed issuance cleanup, failed renewal preservation, sanitized logs/errors (mock services)');
