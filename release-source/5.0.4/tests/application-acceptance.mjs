import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import db from '/app/db.js';
import userModel from '/app/models/user.js';
import authModel from '/app/models/auth.js';
import permissions from '/app/models/user_permission.js';
import proxyModel from '/app/models/proxy_host.js';

if(process.env.NYXGUARD_DISPOSABLE_ACCEPTANCE!=='1')throw new Error('Explicit disposable acceptance environment required');
process.umask(0o077);
const root=process.env.NYXGUARD_ACCEPTANCE_EVIDENCE;
if(!root)throw new Error('Private evidence location required');
const passwordFile=`${root}/acceptance-password`;
const identity='safety-admin@example.invalid';
const k=db();
let setupAPI=false;
try {
  let password;
  try{password=await fs.readFile(passwordFile,'utf8');}
  catch(error){if(error.code!=='ENOENT')throw error;password=crypto.randomBytes(32).toString('hex');await fs.writeFile(passwordFile,password,{mode:0o600});}
  if(process.env.NYXGUARD_ACCEPTANCE_SEED==='1') {
    let user=await userModel.query().findOne({email:identity});
    if(!user&&Number((await k('user').count('* as count').first()).count)===0) {
      const setup=await fetch('http://127.0.0.1:3000/api/users',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'Safety Acceptance',nickname:'Safety',email:identity,auth:{type:'password',secret:password}}),signal:AbortSignal.timeout(10000)});
      if(setup.status!==201)throw new Error('Fresh setup API failed');
      user=await userModel.query().findOne({email:identity});setupAPI=true;
    }
    if(!user) {
      user=await userModel.query().insertAndFetch({is_deleted:0,email:identity,name:'Safety Acceptance',nickname:'Safety',avatar:'',roles:['admin']});
      await authModel.query().insert({user_id:user.id,type:'password',secret:password,meta:{}});
      await permissions.query().insert({user_id:user.id,visibility:'all',proxy_hosts:'manage',redirection_hosts:'manage',
        dead_hosts:'manage',streams:'manage',access_lists:'manage',certificates:'manage'});
    }

  }
  const response=await fetch('http://127.0.0.1:3000/api/tokens',{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({identity,secret:password}),signal:AbortSignal.timeout(10000)});
  const login=await response.json();
  if(!response.ok||!login.token)throw new Error('Acceptance login failed');
  const headers={Authorization:`Bearer ${login.token}`};
  if(process.env.NYXGUARD_ACCEPTANCE_SEED==='1') {
    if(!await proxyModel.query().first()) {
      const create=await fetch('http://127.0.0.1:3000/api/nginx/proxy-hosts',{method:'POST',headers:{...headers,'Content-Type':'application/json'},
        body:JSON.stringify({domain_names:['safety.example.invalid'],forward_scheme:'http',forward_host:'127.0.0.1',forward_port:8080,
          certificate_id:0,access_list_id:0,ssl_forced:false,caching_enabled:false,block_exploits:true,allow_websocket_upgrade:false,
          http2_support:false,locations:[],advanced_config:'',hsts_enabled:false,hsts_subdomains:false}),signal:AbortSignal.timeout(20000)});
      if(create.status!==201)throw new Error('Proxy configuration setup API failed');
    }
    const proxy=await proxyModel.query().first();
    if(!await k('nyxguard_traffic_stat').where({proxy_host_id:proxy.id,bucket:'2026-10-01 00:00:00'}).first())
      await k('nyxguard_traffic_stat').insert({proxy_host_id:proxy.id,bucket:'2026-10-01 00:00:00',requests:31,bytes_in:1234,bytes_out:5678,status_2xx:30,status_4xx:1});
  }
  const proxy=await fetch('http://127.0.0.1:3000/api/nginx/proxy-hosts',{headers,signal:AbortSignal.timeout(10000)});
  const proxyData=await proxy.json();
  if(!proxy.ok||!Array.isArray(proxyData)||proxyData.length<1)throw new Error('Proxy Host acceptance failed');
  const settings=await fetch('http://127.0.0.1:3000/api/settings',{headers,signal:AbortSignal.timeout(10000)});
  if(!settings.ok)throw new Error('Settings API acceptance failed');
  const migration=await k('migrations').count('* as count').first();
  const tables=['user','auth','user_permission','setting','proxy_host','nyxguard_traffic_stat'];
  const fingerprints={};
  for(const table of tables){
    const rows=await k(table).select('*').orderBy(table==='setting'?'id':'id');
    fingerprints[table]={count:rows.length,sha256:crypto.createHash('sha256').update(JSON.stringify(rows)).digest('hex')};
  }
  const baselineFile=`${root}/baseline-fingerprints.json`;
  if(process.env.NYXGUARD_ACCEPTANCE_SEED==='1')await fs.writeFile(baselineFile,JSON.stringify(fingerprints),{mode:0o600});
  else {
    const before=JSON.parse(await fs.readFile(baselineFile,'utf8'));
    for(const table of tables)if(JSON.stringify(before[table])!==JSON.stringify(fingerprints[table]))throw new Error(`Persistent data changed: ${table}`);
  }
  const result={setupAPI,login:true,proxyAPI:true,proxyCount:proxyData.length,settingsAPI:true,traffic:true,dataPreserved:true,migrations:Number(migration.count),fingerprints};
  await fs.writeFile(`${root}/application-${process.env.NPM_BUILD_VERSION}.json`,JSON.stringify(result),{mode:0o600});
  console.log(JSON.stringify(result));
} finally {await k.destroy();}
