import fs from 'node:fs';
const root=process.argv[2]||'/app';
function patch(file,transform){const path=root+'/'+file;const old=fs.readFileSync(path,'utf8');const next=transform(old);if(next===old)throw Error('Diagnostics patch marker missing: '+file);fs.writeFileSync(path,next);}
patch('app.js',source=>{
 const start=source.indexOf('app.use((err, req, res, _) => {');const end=source.indexOf('\nexport default app;',start);
 if(start<0||end<0)throw Error('Error handler marker differs');
 return "import diagnosticDb from './db.js';\nimport {recordFailure} from './internal/operational-diagnostics.mjs';\n"+source.slice(0,start)+`app.use(async (err, req, res, _) => {
 const actorId=res.locals.access?.token?.getUserId(0);
 const operational=Number.isSafeInteger(actorId)&&actorId>0&&!['401','403','404'].includes(String(err.status));
 const event=operational?await recordFailure(diagnosticDb(),err,{path:req.originalUrl.split('?')[0],method:req.method,actorId}):null;
 const payload={error:{code:err.status||500,message:event?event.component+': '+event.summary+' Diagnostic reference: '+event.event_id+'. '+event.recommendation:err.public?err.message:'Request failed.'}};
 if(event){payload.error.diagnostic_id=event.event_id;payload.error.error_code=event.code;payload.error.correlation_id=event.correlation_id;}
 res.status(err.status||500).send(payload);
});
`+source.slice(end);
});
patch('routes/professional-support.js',source=>{
 source="import {recordFailure,recentFailures,runtimeChecks,retentionDays} from '../internal/operational-diagnostics.mjs';\n"+source;
 source=source.replace('catch (err) { sendError(res, err); }','catch (err) { const event=await recordFailure(db(),err,{component:"Licensing / Support",operation:method.toUpperCase()+" "+path,actorId:res.locals.access?.token?.getUserId(0)}); res.status(err.status||503).json({category:"support_unavailable",error:{message:event.summary+" Diagnostic reference: "+event.event_id+". "+event.recommendation,diagnostic_id:event.event_id,error_code:event.code}}); }');
 source=source.replace('const [openresty, backend] = await Promise.all([','const [openresty, backend, operational] = await Promise.all([').replace('recentBackendProblems({ windowMinutes }),','recentBackendProblems({ windowMinutes }),\n        recentFailures(db(),{windowMinutes,limit:40}).catch(()=>({problems:[],source_available:false})),');
 source=source.replace('problems: [...openresty, ...backend.problems]','problems: [...operational.problems, ...openresty, ...backend.problems]').replace('backendAvailable: backend.available','backendAvailable: backend.available || operational.source_available');
 source=source.replace('snapshot.migrationsCurrent = Boolean(row);', 'snapshot.migrationsCurrent = Boolean(row) && Boolean(await db()(\"migrations\").where(\"name\",\"20261011000000_operational_diagnostics.js\").first(\"id\").timeout(2000));');
 source=source.replace('const system = systemDiagnostics(snapshot);','const system = [...systemDiagnostics(snapshot), ...await runtimeChecks(execFileAsync)];');
 source=source.replace('recentProblems: baseline.problems,','recentProblems: baseline.problems.filter(item=>item.category!=="operational_failure"),\n        operationalEvents: {...await recentFailures(db(),{windowMinutes:retentionWindow(),limit:200}),retention_days:retentionDays,window_minutes:retentionWindow()}, operationalState: baseline.payload.operations,');
 source=source.replace('async function bundleData(entitlement, requester) {','function retentionWindow(){return retentionDays*24*60;}\nasync function bundleData(entitlement, requester) {');
 const marker='route("get", "/problems", async (req, res) => {';
 const pos=source.indexOf(marker);const end=source.indexOf('route("get", "/operations"',pos);
 if(pos<0||end<0)throw Error('Problems endpoint marker differs');
 source=source.slice(0,pos)+`route("get", "/problems", async (req, res) => {
 if (!await permitted(res)) return;
 const windowMinutes=Number(req.query.window??60),offset=Number(req.query.offset??0);
 if(![15,60,1440].includes(windowMinutes)||!Number.isSafeInteger(offset)||offset<0||offset>10000)return res.sendStatus(400);
 const {rows}=await activeHosts();
 const legacy=await currentProblems(rows.map(row=>row.id),windowMinutes);
 const operational=await recentFailures(db(),{windowMinutes,limit:10000});
 const legacyOnly=legacy.problems.filter(item=>item.category!=="operational_failure");
 const combined=[...operational.problems,...legacyOnly].sort((a,b)=>b.last_seen.localeCompare(a.last_seen));
 const problems=combined.slice(offset,offset+20);
 res.set("Cache-Control","no-store").json(redact({...operational,problems,total:combined.length,limit:20,offset,window_minutes:windowMinutes,generated_at:new Date().toISOString()}));
});
`+source.slice(end);
 return source;
});
patch('internal/nyxcloud-support/bundle.mjs',source=>source.replace('diagnosticsAt, diagnosticsStale = false,','operationalEvents, operationalState, diagnosticsAt, diagnosticsStale = false,').replace('const safeBundle = redact(bundle);',`bundle.operational_diagnostics=JSON.parse(JSON.stringify(operationalEvents??{problems:[],source_available:false}));
 bundle.operational_state=JSON.parse(JSON.stringify(operationalState??{}));
 bundle.manifest={included:['operational_diagnostics','operational_state','diagnostics','recent_problems','application'],omitted:['credentials','raw_command_output','raw_configuration','private_keys','sessions','sensitive_environment_values'],operational_window_days:operationalEvents?.retention_days??30,operational_host_source:operationalEvents?.host_source?.state??'not_tested',operational_group_limit:200,operational_truncated:(operationalEvents?.total??0)>(operationalEvents?.problems?.length??0)};
 const safeBundle = redact(bundle);`));

patch('internal/certificate.js',source=>{
 source="import operationalDb from '../db.js';\nimport {recordFailure as recordOperationalFailure} from './operational-diagnostics.mjs';\n"+source;
 const stop=source.indexOf('\n\t/**',source.indexOf('processExpiringHosts: () => {')+1);
 const start=source.indexOf('processExpiringHosts: () => {');
 if(start<0||stop<0)throw Error('Renewal background marker differs');
 let timer=source.slice(start,stop);
 timer=timer.replace('logger.warn(`Certificate expiring notification failed: ${err?.message ?? err}`);','void recordOperationalFailure(operationalDb(),err,{component:"Certificates / Certbot",operation:"Certificate expiry notification"});');
 timer=timer.replace('logger.error(err.message);','void recordOperationalFailure(operationalDb(),err,{component:"Certificates / Certbot",operation:"Scheduled certificate renewal"});').replace('logger.error(err);','void recordOperationalFailure(operationalDb(),err,{component:"Certificates / Certbot",operation:"Scheduled renewal database query"});');
 return source.slice(0,start)+timer+source.slice(stop);
});
patch('frontend/assets/professional-support.js',source=>{
 source=source.replace('if (!response.ok) throw new Error("Request failed (HTTP " + response.status + ").");', `if (!response.ok) {
      var failure = await response.json().catch(function(){ return null; });
      var reported = failure && failure.error;
      var safeMessage = reported && /^[a-f0-9-]{36}$/i.test(reported.diagnostic_id || "") && typeof reported.message === "string" && reported.message.length <= 600 && !/(?:password|secret|token|authorization|cookie|credential)\\s*[:=]|-----BEGIN|\\bat\\s+.+:\\d+/i.test(reported.message) ? reported.message : "Request failed (HTTP " + response.status + ").";
      throw new Error(safeMessage);
    }`);

 source=source.replace('var systemChecks = new Set([','var systemChecks = new Set(["certbot_runtime","dns_challenge_plugin","certbot_executable","certificate_storage","certificate_storage_write",');
 const start=source.indexOf('  function problemsPanel(parent, compact) {');const end=source.indexOf('  function renderDiagnostics(parent, data) {',start);
 if(start<0||end<0)throw Error('Recent problems UI marker differs');
 let section=source.slice(start,end);
 section=section.replace('var controls =','var offset = 0;\n    var controls =').replace('windowSelect.addEventListener("change", load);','windowSelect.addEventListener("change", function(){offset=0;load();});');
 section=section.replace('var refresh = button("Refresh problems", load,','var refresh = button("Refresh problems", function(){offset=0;load();},');
 section=section.replace('"/api/professional-support/problems?window=" + windowSelect.value','"/api/professional-support/problems?window=" + windowSelect.value + "&offset=" + offset');
 section=section.replace('var title = /^[a-z]', 'var title = item.component || /^[a-z]');
 // Parenthesize the existing conditional so a component is used verbatim.
 section=section.replace('var title = item.component || /^[a-z][a-z0-9_]{0,63}$/.test(item.category || "") ? friendlyCheck(item.category) : "Service problem";', 'var title = item.component || (/^[a-z][a-z0-9_]{0,63}$/.test(item.category || "") ? friendlyCheck(item.category) : "Service problem");');
 section=section.replace('row.append(heading);','row.append(heading);\n          if(item.summary) row.append(element("p", "nyx-support-evidence", item.summary));');
 section=section.replace('if (details.length) row.append', 'if(item.status) details.push("Status: " + item.status);\n          if (details.length) row.append');
 section=section.replace('output.append(row);',`if(item.event_id){
            var more=element("details", "nyx-support-operational-details");
            more.append(element("summary", "", "Details and recommended action"));
            [["Diagnostic reference",item.event_id],["Operation",item.operation],["Resource",item.resource_identity],["Cause classification",item.cause_kind],["Cause",item.cause],["Technical evidence",item.details?Object.entries(item.details).map(function(entry){return entry.join(": ");}).join(" · "):""],["Outcome",item.outcome],["Application state",item.application_state],["Recommended action",item.recommendation],["Correlation",item.correlation_id],["First seen",dateLabel(item.first_seen)],["Last seen",dateLabel(item.last_seen)]].forEach(function(pair){if(pair[1])more.append(element("p","nyx-support-evidence",pair[0]+": "+pair[1]));});
            row.append(more);
          }
          output.append(row);`);
 section=section.replace('      } catch (error)',`        if(data.total>20){
          var pages=element("div","nyx-support-actions");
          var previous=button("Previous problems",function(){offset=Math.max(0,offset-20);load();},"nyx-support-button-secondary");previous.disabled=offset===0;
          var next=button("Next problems",function(){offset+=20;load();},"nyx-support-button-secondary");next.disabled=offset+20>=data.total;
          pages.append(previous,element("span","nyx-support-muted",(offset+1)+"–"+Math.min(offset+20,data.total)+" of "+data.total+" grouped problems"),next);output.append(pages);
        }
      } catch (error)`);
 return source.slice(0,start)+section+source.slice(end);
});
patch('frontend/assets/professional-support.css',source=>source+'\n/* 5.0.11: scoped operational details; retain established page design. */\n.nyx-support-operational-details{font-size:12px;overflow-wrap:anywhere}.nyx-support-operational-details summary{cursor:pointer;color:var(--app-text-secondary,#b7cbda)}\n.nyx-support-problems{max-height:640px;overflow-y:auto}\n');
patch('internal/update-manager.js',source=>{
 source="import operationalDb from '../db.js';\nimport {recordFailure as recordOperationalFailure} from './operational-diagnostics.mjs';\n"+source;
 const marker='_finishJob(job, status, result = null) {';
 if(!source.includes(marker))throw Error('Update completion marker differs');
 return source.replace(marker,marker+`\n        if(status==='failed')void recordOperationalFailure(operationalDb(),new Error(result?.error||result?.message||'Update job failed'),{component:'Update Manager',operation:'Background update job'});`);
});
patch('routes/nyxguard/settings.js',source=>{
 const start=source.indexOf('const nextSettings = await internalNyxGuard.settings.update(db(), data);');
 const end=source.indexOf('res.status(200).send(nextSettings);',start);
 if(start<0||end<0)throw Error('Global auth bypass synchronization marker differs');
 let section=source.slice(start,end);
 section='let partialSyncFailure;\n            '+section;
 const remember=`partialSyncFailure ||= Object.assign(new Error('Global auth bypass synchronization database operation failed'), {code:'DATABASE_OPERATION_FAILED',outcome:'partially_completed'});`;
 section=section.replace('// ignore per-host meta sync errors',remember).replace('// ignore; non-fatal',remember);
 if(!section.includes(remember))throw Error('Global auth bypass catch marker differs');
 return source.slice(0,start)+section+'if(partialSyncFailure)throw partialSyncFailure;\n            '+source.slice(end);
});
patch('internal/setting.js',source=>{
 const marker='.catch((/*err*/) => {';
 const start=source.indexOf(marker);const end=source.indexOf('\n\t\t\t\treturn row;',start);
 if(start<0||end<0)throw Error('Default site failed configuration cleanup marker differs');
 let section=source.slice(start,end).replace('internalNginx\n','return internalNginx\n');
 section=section.replace('throw new errs.ValidationError("Could not reconfigure Nginx. Please check logs.");',`throw Object.assign(new Error('Default site Nginx configuration failed; the rejected configuration was removed.'), {code:'NGINX_CONFIGURATION_FAILED',outcome:'partially_completed'});`);
 return source.slice(0,start)+section+source.slice(end);
});
patch('internal/traffic-monitor.js',source=>{
 source="import {recordFailure as recordTrafficFailure} from './operational-diagnostics.mjs';\n"+source;
 source=source.replace("\t} catch {\n\t\treturn; // file doesn't exist yet", "\t} catch (error) {\n        if(error.code!=='ENOENT')throw error;\n\t\treturn; // file doesn't exist yet");
 source=source.replace('async function pollOnce() {',`async function reportTrafficFailure(error,operation,proxyHostId) {
 if(error?.code==='ENOENT')return;
 await recordTrafficFailure(db(),error,{component:'Traffic Monitor',operation,path:proxyHostId?'/traffic/'+proxyHostId:'/traffic'});
}
async function pollOnce() {`);
 source=source.replace('\t} catch {\n\t\treturn;\n\t}\n\n\t// Discover', "\t} catch (error) {\n        if(!['ER_NO_SUCH_TABLE','ER_BAD_TABLE_ERROR'].includes(error.code))await reportTrafficFailure(error,'Traffic database availability');\n\t\treturn;\n\t}\n\n\t// Discover");
 source=source.replace('\t} catch {\n\t\treturn;\n\t}\n\n\tlet totalLines', "\t} catch (error) {\n        await reportTrafficFailure(error,'Traffic log discovery');\n\t\treturn;\n\t}\n\n\tlet totalLines");
 source=source.replace('\t\t} catch {\n\t\t\t// ignore per-file errors', "\t\t} catch (error) {\n            await reportTrafficFailure(error,'Traffic aggregation',proxyHostId);\n\t\t\t// Continue processing independent host logs");
 source=source.replace('\t} catch {\n\t\t// ignore\n\t}', "\t} catch (error) {\n        await reportTrafficFailure(error,'Traffic retention cleanup');\n\t}");
 source=source.replaceAll('pollOnce().catch(() => {});', "pollOnce().catch(error=>reportTrafficFailure(error,'Traffic polling'));");
 return source;
});
