import {licensingPolicies} from './nyxcloud-licensing/errors.mjs';
import {randomUUID,createHash} from 'node:crypto';
import {redact} from './nyxcloud-support/redaction.mjs';
import {open} from 'node:fs/promises';
import {constants} from 'node:fs';
const TABLE='operational_diagnostic';
// Existing redaction yields null-prototype objects; normalize selected safe data
// so repeated source/API/bundle passes accept the same contract.
const safe=value=>JSON.parse(JSON.stringify(redact(value)));
export const retentionDays=Math.max(1,Math.min(90,Number(process.env.NYXGUARD_DIAGNOSTIC_RETENTION_DAYS)||30));
const components=[[/certificates/,'Certificates / Certbot'],[/proxy-hosts/,'Proxy Hosts'],[/access-lists/,'Access Lists'],[/vpn/,'VPN Agent'],[/update|rollback/,'Update Manager'],[/professional-support/,'Licensing / Support'],[/users|tokens/,'User administration'],[/settings/,'Application settings'],[/shieldwall/,'GlobalGate Shieldwall'],[/waf/,'WAF'],[/rules|ip-management/,'Traffic Rules']];
const codes={
 HOST_UPGRADE_FAILED:['Host upgrade failed.','Review recovery status and the retained host transaction before retrying.'],
 HOST_BACKUP_FAILED:['Host upgrade backup failed.','Verify backup storage and integrity before restarting the upgrade.'],
 HOST_RECOVERY_INCOMPLETE:['Host upgrade recovery did not complete.','Keep the installation stopped until recovery state and restored database are verified.'],
 CERTIFICATE_RUNTIME_UNAVAILABLE:['Certbot runtime dependency is unavailable.','Check Manager image Certbot dependencies; contact support with this reference.'],
 CERTIFICATE_PLUGIN_FAILED:['DNS challenge plugin could not initialize.','Check the installed DNS provider plugin and runtime dependencies.'],
 CERTIFICATE_DNS_CREDENTIALS:['DNS provider authentication failed.','Verify credential permissions and DNS zone scope.'],
 CERTIFICATE_RATE_LIMIT:['Certificate authority rate limit was reported.','Observe the authority retry window.'],
 CERTIFICATE_DNS_FAILED:['DNS validation failed.','Check public records and challenge propagation.'],
 CERTIFICATE_CHALLENGE_FAILED:['Domain challenge failed.','Check HTTP routing or DNS challenge records.'],
 CERTIFICATE_NETWORK_FAILED:['Certificate service connection failed.','Check DNS and outbound connectivity.'],
 CERTIFICATE_STORAGE_FAILED:['Certificate storage access failed.','Check persistent storage permissions and free space.'],
 CERTIFICATE_OPERATION_FAILED:['Certificate operation failed; cause requires investigation.','Run diagnostics and contact support with this reference.'],
 NGINX_RELOAD_ACTIVATION_TIMEOUT:['Nginx reload did not finish activating the requested configuration.','Check Nginx workers and verify enforcement before retrying.'],
 DATABASE_OPERATION_FAILED:['Database operation failed.','Check database availability and migration status.'],
 NGINX_CONFIGURATION_FAILED:['Nginx configuration validation or reload failed.','Run diagnostics and review the affected configuration.'],
 INVALID_CONFIGURATION:['Operation rejected an invalid configuration.','Review the submitted resource configuration.'],
 INTEGRATION_UNAVAILABLE:['A dependency service is unavailable for this operation.','Check service configuration, availability and connectivity.'],
 OPERATION_TIMEOUT:['Operation exceeded its timeout.','Check dependency responsiveness and retry after investigation.'],
 OPERATION_FAILED:['Operation failed; the technical cause has not been established.','Run diagnostics and contact support with this reference.']};
Object.assign(codes, licensingPolicies, {CERTIFICATE_DNS_ZONE_NOT_FOUND:['The DNS provider could not find an accessible zone for a requested domain.','Check the exact requested domain and token zone scope; changing propagation time will not fix a missing zone.']});
export function failureRecord(error,context={}) {
 const raw=String(error?.message||'').slice(0,65536);let code=Object.hasOwn(codes,error?.code)?error.code:'OPERATION_FAILED';
 const allowedRuntimeCodes=new Set(['ECONNREFUSED','ENOTFOUND','EHOSTUNREACH','ETIMEDOUT','EACCES','ENOSPC','ER_ACCESS_DENIED_ERROR','ER_NO_SUCH_TABLE','ER_LOCK_WAIT_TIMEOUT','SQLITE_BUSY','SQLITE_ERROR']);
 const reportedCode=[error?.code,error?.nativeError?.code].find(value=>allowedRuntimeCodes.has(value));
 if(code==='OPERATION_FAILED') {
  if(/No module named ['"]certbot|ModuleNotFoundError.*certbot/i.test(raw))code='CERTIFICATE_RUNTIME_UNAVAILABLE';
  else if(/^(?:ER_|SQLITE_)/.test(reportedCode||'')||/ER_|SQLITE_|database|migration|knex/i.test(raw))code='DATABASE_OPERATION_FAILED';
  else if(/nginx.*(?:test|reload|configuration)|configuration.*test failed/i.test(raw))code='NGINX_CONFIGURATION_FAILED';
  else if(reportedCode==='ETIMEDOUT'||/timed? ?out|ETIMEDOUT/i.test(raw))code='OPERATION_TIMEOUT';
  else if(['ECONNREFUSED','ENOTFOUND','EHOSTUNREACH'].includes(reportedCode)||/ECONNREFUSED|ENOTFOUND|EHOSTUNREACH|authority_unavailable|endpoint_unavailable|VPN agent is unavailable/i.test(raw))code='INTEGRATION_UNAVAILABLE';
  else if(error?.status===400)code='INVALID_CONFIGURATION';
 }
 const details={};
 if(code.startsWith('LICENSING_')) {
  for(const key of ['dependency','failure_type','http_status','upstream_http_status','authority_category','dependency_reference']) {
   const value=error.details?.[key];
   if(typeof value==='number'&&Number.isInteger(value)&&value>=100&&value<=599)details[key]=value;
   else if(typeof value==='string'&&value.length<=80&&/^[A-Za-z0-9_-]+$/.test(value))details[key]=value;
  }
 }
 if(code==='CERTIFICATE_DNS_ZONE_NOT_FOUND') {
  details.failure_stage='zone_lookup';
  if(error.details?.dns_zone)details.dns_zone=error.details.dns_zone;
  details.dependency='dns_service';
 }

 if(/No module named ['"]certbot['"]/.test(raw)){details.missing_module='certbot';details.failure_type='python_import_error';}
 else if(/ModuleNotFoundError|No module named/.test(raw)){details.failure_type='python_import_error';}
 const errno=reportedCode||raw.match(/\b(ECONNREFUSED|ENOTFOUND|EHOSTUNREACH|ETIMEDOUT|EACCES|ENOSPC|ER_ACCESS_DENIED_ERROR|ER_NO_SUCH_TABLE|ER_LOCK_WAIT_TIMEOUT|SQLITE_BUSY|SQLITE_ERROR)\b/)?.[1];
 if(errno)details.runtime_error_code=errno;
 if(code.startsWith('NGINX_'))details.failure_type='nginx_configuration_activation';
 if(code.startsWith('CERTIFICATE_'))details.failure_stage=code.replace('CERTIFICATE_','').toLowerCase();
 if(context.hostEvidence)Object.assign(details,context.hostEvidence);
 const path=String(context.path||'');const component=context.component||components.find(([pattern])=>pattern.test(path))?.[1]||'Manager';
 const method=String(context.method||'BACKGROUND');const operation=context.operation||({POST:'Create or execute',PUT:'Update',PATCH:'Update',DELETE:'Delete',GET:'Read'}[method]||'Background operation');
 const resourceId=path.match(/\/(\d+)(?:\/|$)/)?.[1];const now=context.now||new Date().toISOString();
 const summary=code==='CERTIFICATE_DNS_ZONE_NOT_FOUND'&&details.dns_zone?'The DNS provider could not find an accessible zone for '+details.dns_zone+'.':codes[code][0];
 return safe({event_id:/^[a-f0-9-]{36}$/i.test(context.eventId||'')?context.eventId:randomUUID(),timestamp:now,severity:'error',component,operation,summary,code,details,cause:errno?'Runtime reported '+errno+'.':details.missing_module?'Python could not import the certbot module.':codes[code][0],cause_kind:code==='OPERATION_FAILED'||code==='CERTIFICATE_OPERATION_FAILED'?'unconfirmed':'reported_error',resource_type:component,resource_identity:resourceId?'#'+resourceId:'unspecified',outcome:['failed','timed_out','partially_completed','recovered'].includes(error?.outcome)?error.outcome:code==='NGINX_RELOAD_ACTIVATION_TIMEOUT'?'partially_completed':code==='OPERATION_TIMEOUT'?'timed_out':'failed',application_state:context.applicationState||'Persistence or runtime changes require verification.',correlation_id:context.correlationId||randomUUID(),recommendation:codes[code][1],version:context.version||String(process.env.NPM_BUILD_VERSION||'5.0.11'),status:error?.outcome==='recovered'&&context.applicationState==='rollback_verified'?'recovered':'unconfirmed',...(Number.isSafeInteger(context.actorId)?{actor_id:context.actorId}:{})});
}
export async function recordFailure(db,error,context={}) {
 const event=failureRecord(error,context);
 try {
  await db(TABLE).insert({event_id:event.event_id,created_on:event.timestamp,fingerprint:createHash('sha256').update([event.component,event.operation,event.code,event.resource_identity,event.cause_kind,JSON.stringify(event.details)].join('|')).digest('hex'),payload:JSON.stringify(event)}).onConflict('event_id').ignore().timeout(1500);
  await pruneDiagnostics(db);
 }catch { console.warn('operational_diagnostic_persistence_failed',event.event_id,event.code); }
 return event;
}
async function pruneDiagnostics(db){
  await db(TABLE).where('created_on','<',new Date(Date.now()-retentionDays*86400000).toISOString()).delete().timeout(1500);
  const excess=await db(TABLE).orderBy('created_on','desc').orderBy('event_id','desc').offset(10000).limit(10000).select('event_id').timeout(1500);
  if(excess.length)await db(TABLE).whereIn('event_id',excess.map(row=>row.event_id)).delete().timeout(1500);
}
export async function recentFailures(db,{windowMinutes=60,limit=40,offset=0,now=Date.now()}={}) {
 const hostSource=await importHostFailures(db);
 const rows=await db(TABLE).where('created_on','>=',new Date(now-windowMinutes*60000).toISOString()).orderBy('created_on','desc').limit(10000).select('payload').timeout(2000);
 const groups=new Map();
 for(const row of rows){let event;try{event=safe(JSON.parse(row.payload));}catch{continue;}
  const key=[event.component,event.operation,event.code,event.resource_identity,event.cause_kind,JSON.stringify(event.details)].join('|');const group=groups.get(key);
  if(group){group.count++;group.first_seen=event.timestamp;}else groups.set(key,{...event,category:'operational_failure',state:'FAIL',count:1,first_seen:event.timestamp,last_seen:event.timestamp});
 }
 const all=[...groups.values()];return {problems:all.slice(offset,offset+limit),total:all.length,occurrences:rows.length,limit,offset,source_available:true,host_source:hostSource};
}
export async function runtimeChecks(execute) {
 const checks=[];
 for(const [check,command,args] of [['certbot_runtime','/opt/certbot/bin/python3',['-c','import certbot']],['dns_challenge_plugin','/opt/certbot/bin/python3',['-c','import certbot_dns_cloudflare._internal.dns_cloudflare']],['certbot_executable','/opt/certbot/bin/certbot',['--version']],['certificate_storage','/usr/bin/test',['-r','/etc/letsencrypt']],['certificate_storage_write','/usr/bin/test',['-w','/etc/letsencrypt']]]){
  try{await execute(command,args,{timeout:3000,maxBuffer:1024});checks.push({check,state:'PASS',reason:'Dependency check passed.',recommendation:'Continue monitoring.',evidence:{}});}catch{checks.push({check,state:'FAIL',reason:'Dependency check failed.',recommendation:'Verify the installed runtime and persistent storage access.',evidence:{}});}
 }
 return checks;
}

const HOST_CODES=new Set(['HOST_UPGRADE_FAILED','HOST_BACKUP_FAILED','HOST_RECOVERY_INCOMPLETE']);
const HOST_STAGES=new Set(['backup','migration','rollback','readiness','version_gate','startup','prepare','stop','restore','start','recover']);
const HOST_STATES=new Set(['rollback_verified','services_restarted','recovery_incomplete']);
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
let hostImport;
export async function importHostFailures(db,{path='/data/.nyxguard-operational-updater.json',now=Date.now()}={}) {
 if(hostImport)return hostImport;
 hostImport=(async()=>{
  let handle;
  try{
   handle=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW);
   const info=await handle.stat();if(!info.isFile()||info.size>128*1024)throw Error('unsafe_host_summary');
   const data=JSON.parse(await handle.readFile('utf8'));
   if(data.format!=='nyxguard-host-operational-v1'||!Array.isArray(data.events)||data.events.length>64)throw Error('unsafe_host_summary');
   let imported=0,rejected=0;const events=[];
   for(const item of data.events){
    const timestamp=typeof item?.timestamp==='string'?Date.parse(item.timestamp):NaN;
    if(!HOST_CODES.has(item?.code)||!UUID.test(item?.event_id||'')||!UUID.test(item?.correlation_id||'')||!Number.isFinite(timestamp)||timestamp>now+60000||timestamp<now-retentionDays*86400000){rejected++;continue;}
    const error=Object.assign(new Error('Host updater reported failure'),{code:item.code,outcome:['failed','timed_out','partially_completed','recovered'].includes(item.outcome)?item.outcome:'failed'});
    const evidence={source:'host_updater'};
    if(HOST_STAGES.has(item.details?.stage))evidence.stage=item.details.stage;
    if(HOST_STATES.has(item.details?.recovery_state))evidence.recovery_state=item.details.recovery_state;
    events.push(failureRecord(error,{eventId:item.event_id,now:new Date(timestamp).toISOString(),component:'Update Manager',operation:item.code==='HOST_BACKUP_FAILED'?'Host upgrade backup':item.code==='HOST_RECOVERY_INCOMPLETE'?'Host upgrade recovery':'Host upgrade',correlationId:item.correlation_id,applicationState:HOST_STATES.has(item.application_state)?item.application_state:'Recovery state requires verification.',version:/^\d+\.\d+\.\d+$/.test(item.version||'')?item.version:'unknown',hostEvidence:evidence}));
    imported++;
   }
   if(events.length){await db(TABLE).insert(events.map(event=>({event_id:event.event_id,created_on:event.timestamp,fingerprint:createHash('sha256').update([event.component,event.operation,event.code,event.resource_identity,event.cause_kind,JSON.stringify(event.details)].join('|')).digest('hex'),payload:JSON.stringify(event)}))).onConflict('event_id').ignore().timeout(1500);await pruneDiagnostics(db);}
   return {state:'available',accepted:imported,rejected};
  }catch(error){return {state:error?.code==='ENOENT'?'not_configured':'unavailable',accepted:0};}
  finally{await handle?.close();}
 })();
 try{return await hostImport;}finally{hostImport=null;}
}
