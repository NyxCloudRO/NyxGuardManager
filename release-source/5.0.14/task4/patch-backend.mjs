import fs from 'node:fs';import path from 'node:path';import {createHash}from'node:crypto';
const root=process.argv[2],src=path.dirname(new URL(import.meta.url).pathname),hash=b=>createHash('sha256').update(b).digest('hex');
for(const[n,h]of Object.entries(JSON.parse(fs.readFileSync(path.join(src,'backend-prerequisites.json')))))if(hash(fs.readFileSync(path.join(root,n)))!==h)throw Error('Backend prerequisite differs: '+n);
function patch(name,fn){const f=path.join(root,name);fs.writeFileSync(f,fn(fs.readFileSync(f,'utf8')));}
function once(s,a,b){if(s.split(a).length!==2)throw Error('Patch prerequisite differs '+a);return s.replace(a,b);}
patch('internal/nyxguard/nginx.js',s=>{
 s='import {observationConfig} from "../blocked-policy.mjs";\nlet observationHostsReady=false;\n'+s;
 s=once(s,'\t\tconst httpLines = [];','\t\tawait fs.mkdir("/run/nginx/nyxguard-blocked",{recursive:true,mode:0o700});\n\t\tconst httpLines = [];\n\t\thttpLines.push(await observationConfig(db,{rules,countryRules:currentCountryRules,denyList,denyPerHostEntries,geoipAvailable,ip2Enabled}));');
 s=once(s,'set $nyxguard_attack_type "deny"; set $nyxguard_block 1;','set $nyxguard_attack_type "deny"; set $nyxguard_observed_candidate $nyxguard_observed_ip; set $nyxguard_block 1;');
 s=once(s,'set $nyxguard_attack_type "country_deny"; set $nyxguard_block 1;','set $nyxguard_attack_type "country_deny"; set $nyxguard_observed_candidate $nyxguard_observed_country; set $nyxguard_block 1;');
 s=once(s,'if ($nyxguard_block = 1) { return 403; }','if ($nyxguard_block = 1) { set $nyxguard_observed $nyxguard_observed_candidate; return 403; }');
 s=once(s,'if ($nyxguard_global_block = 1) { return 403','if ($nyxguard_global_block = 1) { set $nyxguard_observed $nyxguard_observed_ip; return 403');
 s=once(s,'\t\tawait internalNginx.reload();',`		if(!observationHostsReady){
   const observationHosts=await proxyHostModel.query().where('is_deleted',0).withGraphFetched('[certificate,access_list.[clients,items]]');
   const missing=[];
   for(const host of observationHosts){let conf='';try{conf=await fs.readFile('/data/nginx/proxy_host/'+host.id+'.conf','utf8');}catch{}if(!conf.includes('set $nyxguard_observed_app '+host.id+';'))missing.push(host);}
   if(missing.length)await internalNginx.bulkGenerateConfigs('proxy_host',missing);
   observationHostsReady=true;
  }
		await internalNginx.reload();`);
 s=once(s,'spLines.push("# Managed by NyxGuard Manager - global IP ban enforcement.");','spLines.push("# Managed by NyxGuard Manager - global IP ban enforcement.");\n\t\t\tspLines.push("log_by_lua_file /app/internal/blocked-log.lua;");');return s;
});
patch('templates/proxy_host.conf',s=>once(s,'server {','server {\n  set $nyxguard_observed_app {{ id }};'));
patch('index.js',s=>once(s,'import app from','import blockedMonitor from "./internal/blocked-store.mjs";\nimport app from').replace('internalAttackMonitor.initTimer();','internalAttackMonitor.initTimer();\n\t\t\tblockedMonitor.initTimer();'));
patch('routes/nyxguard/index.js',s=>'import blockedRoutes from "./blocked-routes.js";\n'+s.replace('router.use("/", attackLogRoutes);','router.use("/", blockedRoutes);\nrouter.use("/", attackLogRoutes);'));
patch('internal/monitoring-policy.mjs',s=>once(s,'|waf-rules)$/','|waf-rules|blocked-requests)$/'));
patch('internal/monitoring-routes.mjs',s=>once(s,"'/nyxguard/summary',","'/nyxguard/blocked-requests', '/nyxguard/summary',"));
for(const name of ['blocked-groups.mjs','blocked-policy.mjs','blocked-store.mjs','blocked-queue.lua','blocked-log.lua','blocked-control.lua'])fs.copyFileSync(path.join(src,name),path.join(root,'internal',name));
fs.copyFileSync(path.join(src,'blocked-routes.js'),path.join(root,'routes/nyxguard/blocked-routes.js'));
fs.copyFileSync(path.join(src,'migration.js'),path.join(root,'migrations/20261016000000_blocked_requests.js'));
console.log('Task 4 backend patch applied with exact Task 3 prerequisites');

patch('internal/release-policy.json',s=>{const p=JSON.parse(s);if(p.schema!==46)throw Error('Schema prerequisite differs');p.schema=48;return JSON.stringify(p,null,2)+'\n';});
patch('internal/readiness.mjs',s=>once(s,"'certificate','access_list',","'nyxguard_blocked_bucket','nyxguard_blocked_state','certificate','access_list',"));

patch('routes/settings.js',s=>{
 s='import {maintenance as blockedMaintenance} from "../internal/blocked-store.mjs";\n'+s;
 s=once(s,'\t\t\tconst tables = {};','\t\t\tconst tables = await blockedMaintenance(async()=>{\n\t\t\tconst tables = {};');
 s=once(s,'\n\t\t\tconst payload = {','\n\t\t\treturn tables;});\n\t\t\tconst payload = {');
 s=once(s,'await knex.transaction(async (trx) => {','await blockedMaintenance(()=>knex.transaction(async (trx) => {');
 s=once(s,'\t\t\t});\n\n\t\t\tres.status(200).send({\n\t\t\t\tsuccess: true,','\t\t\t}),{restore:true});\n\n\t\t\tres.status(200).send({\n\t\t\t\tsuccess: true,');
 return s;
});

fs.copyFileSync(path.join(src,'group-migration.js'),path.join(root,'migrations/20261016000001_blocked_request_groups.js'));
