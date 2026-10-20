// Monitoring-only exposition adapter. No database, application volumes or Docker socket.
import {pathToFileURL} from 'node:url';import https from 'node:https';import fs from 'node:fs';
export function normalize(body){
 const contract=/^nyxguard_metrics_contract_version 1$/m.test(body);
 if(contract){
  const generation=Number(/^nyxguard_metrics_generated_timestamp_seconds ([0-9.]+)$/m.exec(body)?.[1]);
  if(!Number.isFinite(generation)||Math.abs(Date.now()/1000-generation)>90||!/^nyxguard_metrics_source_failures 0$/m.test(body))throw Error('Corrected exporter is stale or degraded');
  return body.replace(/\s*$/,'\n')+'# HELP nyxguard_monitoring_application_correction_pending Application metric correction is installed\n# TYPE nyxguard_monitoring_application_correction_pending gauge\nnyxguard_monitoring_application_correction_pending 0\n# HELP nyxguard_native_freshness_verified Native generation marker verified\n# TYPE nyxguard_native_freshness_verified gauge\nnyxguard_native_freshness_verified 1\n'+windowDays();
 }
 const lines=[],seen=new Set(),samples=new Set();let waf=0,wafSeen=false;
 const omit=n=>/^nyxguard_app_(?:requests|bytes_|status_)/.test(n)||['nyxguard_active_bans_total','nyxguard_auto_bans_total','nyxguard_bans_created_total','nyxguard_attacks_created_total','nyxguard_attacks_all_created_total','nyxguard_protected_hosts_total','nyxguard_ssl_certs_expiring_soon'].includes(n);
 for(const line of body.split('\n')){
  if(!line)continue;const m=/^# (HELP|TYPE) (\w+) (.*)$/.exec(line);
  if(m){if(omit(m[2]))continue;const key=m[1]+m[2];if(!seen.has(key)){seen.add(key);lines.push(line);}continue;}
  if(line.startsWith('#'))continue;const n=/^(\w+)(\{.*\})? ([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?)$/.exec(line);if(!n)throw Error('Invalid native exposition');
  if(omit(n[1])||n[1]==='nyxguard_attacks_total'&&/type="(?:waf|country_deny|auth_bypass)"/.test(n[2]||''))continue;
  const key=n[1]+(n[2]||'');if(samples.has(key))throw Error('Duplicate native sample');samples.add(key);
  if(n[1]==='nyxguard_app_waf_enabled'){waf+=Number(n[3]);wafSeen=true;}
  lines.push(line);
 }
 if(!samples.has('nyxguard_proxy_hosts_total')||!samples.has('nyxguard_users_total'))throw Error('Incomplete native source');
 if(wafSeen)lines.push('# HELP nyxguard_protected_hosts_total Sum of observed active-app WAF settings','# TYPE nyxguard_protected_hosts_total gauge',`nyxguard_protected_hosts_total ${waf}`);
 lines.push('# HELP nyxguard_monitoring_application_correction_pending Unsupported legacy application metrics withheld pending targeted correction','# TYPE nyxguard_monitoring_application_correction_pending gauge','nyxguard_monitoring_application_correction_pending 1','# HELP nyxguard_native_freshness_verified Native exporter has no generation marker; freshness unverified','# TYPE nyxguard_native_freshness_verified gauge','nyxguard_native_freshness_verified 0');
 lines.push('# HELP nyxguard_metric_supported Instrumentation availability; zero is not an event count','# TYPE nyxguard_metric_supported gauge','nyxguard_metric_supported{family="waf_rule_blocks"} 0','nyxguard_metric_supported{family="auth_bypass_hits"} 0');
 lines.push(windowDays().trimEnd());
 return lines.join('\n')+'\n';
}
function windowDays(){return '# HELP nyxguard_monitoring_window_days Fixed rolling window duration in days\n# TYPE nyxguard_monitoring_window_days gauge\n'+[['24h',1],['7d',7],['30d',30],['90d',90]].map(([w,n])=>`nyxguard_monitoring_window_days{window="${w}"} ${n}`).join('\n')+'\n';}
if(process.argv.includes('--normalize')){let input='';for await(const chunk of process.stdin)input+=chunk;process.stdout.write(normalize(input));}
else if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const P='/config/',token=fs.readFileSync(P+'integration-token','utf8').trim();
 const server=https.createServer({cert:fs.readFileSync(P+'server.crt'),key:fs.readFileSync(P+'server.key'),ca:fs.readFileSync(P+'ca.crt'),requestCert:true,rejectUnauthorized:true,minVersion:'TLSv1.2'},async(req,res)=>{
  if(req.url!=='/metrics'||req.method!=='GET'){res.writeHead(404);res.end();return;}
  try{const r=await fetch('http://nyxguard-manager:3000/api/integrations/metrics',{headers:{'X-Integration-Token':token},signal:AbortSignal.timeout(20000)});if(!r.ok)throw Error('Native exporter unavailable');const body=normalize(await r.text());res.writeHead(200,{'Content-Type':'text/plain; version=0.0.4; charset=utf-8','Cache-Control':'no-store'});res.end(body);}
  catch{res.writeHead(503);res.end('Native exporter unavailable or invalid\n');}
 });server.requestTimeout=25000;server.headersTimeout=10000;server.listen(9444,'0.0.0.0');
}
