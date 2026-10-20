import {parse,tokenizer}from'acorn';import{walk,applyEdits}from'./catalogs.mjs';
export function patchDynamic(source,name){
 const functions={},edits=[];walk(parse(source,{ecmaVersion:'latest',sourceType:'module'}),n=>{if(n.type==='FunctionDeclaration'&&n.id)functions[n.id.name]=n;});
 function replaceFunction(id,next){const node=functions[id];if(!node)throw Error('Missing reviewed legacy function '+id);edits.push({start:node.start,end:node.end,value:next});}
 if(name.startsWith('vpn-client-4014-')){
  replaceFunction('formatHandshake',`function formatHandshake(value){if(!value)return window.NyxI18n.t("No handshake yet");const timestamp=new Date(value).getTime();if(!Number.isFinite(timestamp))return window.NyxI18n.t("Unavailable");const seconds=Math.max(0,Math.round((Date.now()-timestamp)/1000));const unit=seconds<60?"second":seconds<3600?"minute":"hour",count=unit==="second"?seconds:unit==="minute"?Math.floor(seconds/60):Math.floor(seconds/3600);return new Intl.RelativeTimeFormat(window.NyxI18n.locale,{numeric:"always"}).format(-count,unit);}`);
  replaceFunction('formatBytes',`function formatBytes(value){const bytes=Number(value)||0,index=bytes<1024?0:bytes<1048576?1:bytes<1073741824?2:3;return window.NyxI18n.number(bytes/1024**index,{minimumFractionDigits:index===0?0:index===3?2:1,maximumFractionDigits:index===0?0:index===3?2:1})+" "+["B","KiB","MiB","GiB"][index];}`);
  replaceFunction('summaryMarkup',`function summaryMarkup(){if(currentData.error)return '<span><strong>'+escapeHtml(window.NyxI18n.t('Unavailable'))+'</strong> · VPN Agent</span>';const summary=currentData.summary||{};return '<span>'+nyxVpnCount('{count, plural, one {# connected site} other {# connected sites}}',Number(summary.connected||0))+'</span><span>'+nyxVpnCount('{count, plural, one {# configured site} other {# configured sites}}',Number(summary.total||0))+'</span>';}`);
 }
 if(name.startsWith('professional-support-')){
  replaceFunction('managerProcessDuration',`function managerProcessDuration(seconds){if(!Number.isSafeInteger(seconds)||seconds<0)return window.NyxI18n.t("Unavailable");const minutes=Math.floor(seconds/60);if(minutes<1)return window.NyxI18n.t("Less than a minute");const hours=Math.floor(minutes/60),days=Math.floor(hours/24),values=[];if(days)values.push(new Intl.NumberFormat(window.NyxI18n.locale,{style:"unit",unit:"day",unitDisplay:"long"}).format(days));if(hours%24)values.push(new Intl.NumberFormat(window.NyxI18n.locale,{style:"unit",unit:"hour",unitDisplay:"long"}).format(hours%24));if(minutes%60)values.push(new Intl.NumberFormat(window.NyxI18n.locale,{style:"unit",unit:"minute",unitDisplay:"long"}).format(minutes%60));return new Intl.ListFormat(window.NyxI18n.locale,{style:"long",type:"conjunction"}).format(values);}`);
  replaceFunction('friendlyCheck',`function friendlyCheck(name){return nyxCheckLabel(name);}`);
 }
 source=applyEdits(source,edits);
 if(name.startsWith('vpn-client-4014-')){
  const transfer='formatBytes(site.transferRx) + " received / " + formatBytes(site.transferTx) + " sent"';if(!source.includes(transfer))throw Error('VPN transfer presentation prerequisite changed');source=source.replace(transfer,'window.NyxI18n.t("{received} received / {sent} sent",{received:formatBytes(site.transferRx),sent:formatBytes(site.transferTx)})');
  const help="<p>Ping an address through <code>' + escapeHtml(site.interface) + '</code>.</p>";if(!source.includes(help))throw Error('VPN test presentation prerequisite changed');source=source.replace(help,"<p>' + nyxVpnTestHelp(site.interface) + '</p>");
  source+=`\nfunction nyxVpnCount(pattern,count){const number=window.NyxI18n.escape(window.NyxI18n.number(count));return window.NyxI18n.escape(window.NyxI18n.t(pattern,{count})).replace(number,'<strong>'+number+'</strong>');}\nfunction nyxVpnTestHelp(value){return window.NyxI18n.escape(window.NyxI18n.t('Ping an address through {interface}.',{interface:'\\uE000'})).replace('\\uE000','<code>'+window.NyxI18n.escape(value)+'</code>');}\n`;
  const vpnSentences=[
   ['aria-label="Connect \' + escapeHtml(site.name) + \'','aria-label="\' + escapeHtml(window.NyxI18n.t("Connect {name}",{name:site.name})) + \''],
   ["'Delete VPN site “'+site.name+'”?'",'window.NyxI18n.t("Delete VPN site “{name}”?",{name:site.name})'],
   ["'<span class=\"nyx-vpn-site-dot is-connected\"></span><span><strong>' + escapeHtml(file.name) + '</strong> selected. Ready to validate and add.</span>'",'\'<span class="nyx-vpn-site-dot is-connected"></span><span>\'+escapeHtml(window.NyxI18n.t("{filename} selected. Ready to validate and add.",{filename:file.name}))+\'</span>\''],
   ['site.interface + (site.interfaceUp ? " (up)" : " (down)")','site.interface+" ("+window.NyxI18n.t(site.interfaceUp?"Interface up":"Disconnected")+")"'],
   ['"Testing " + target + " through " + site.interface + "…"','window.NyxI18n.t("Testing {target} through {interface}…",{target,interface:site.interface})'],
   ['escapeHtml(warning)','escapeHtml(window.NyxI18n.errorMessage(warning))'],
  ];
  for(const[old,next]of vpnSentences){if(!source.includes(old))throw Error('VPN sentence prerequisite changed: '+old);source=source.replace(old,next);}
  const old='throw new Error(result.error && result.error.message ? result.error.message : "HTTP " + response.status)';if(!source.includes(old))throw Error('VPN error prerequisite changed');source=source.replace(old,'throw new Error(result.error && result.error.message ? window.NyxI18n.apiError(result.error,response.status) : window.NyxI18n.message("dynamic.request-failed",{status:response.status}))');
 }

 if(name.startsWith('professional-support-')){
  const sentences=[
   ['"Could not request recovery. " + error.message + " Try again or contact support."','window.NyxI18n.t("Could not request recovery. {detail} Try again or contact support.",{detail:error.message})'],
   ['"Could not confirm recovery. Check the code and try again, or contact support. " + error.message','window.NyxI18n.t("Could not confirm recovery. Check the code and try again, or contact support. {detail}",{detail:error.message})'],
   ['(database.migrationsCurrent ? " current" : " · Warning")','(database.migrationsCurrent?" "+window.NyxI18n.t("current"):" · "+window.NyxI18n.t("Warning"))'],
   ['"Ready · " + (update.currentVersion || "Unknown")','window.NyxI18n.t("Ready · {version}",{version:update.currentVersion||window.NyxI18n.t("Unknown")})'],
   ['friendlyCheck(update.stage)','nyxSupportEnum(update.stage)'],
   ['"Generated " + dateLabel(lastBundle.generated_at)','window.NyxI18n.t("Generated {date}",{date:dateLabel(lastBundle.generated_at)})'],
   ['pair[0]+": "+pair[1]','window.NyxI18n.t(pair[0])+": "+pair[1]'],
   ['"Proxy host #" + host.id','window.NyxI18n.message("ui.cda6344c797b7a4b",{id:host.id})'],
   ['"Proxy host " + row.id','window.NyxI18n.message("ui.cda6344c797b7a4b",{id:row.id})'],
   ['"PASS " + counts.PASS + " · WARNING " + counts.WARNING + " · FAIL " + counts.FAIL + " · SKIPPED " + counts.SKIPPED','window.NyxI18n.t("Pass: {pass, number} · Warning: {warning, number} · Fail: {fail, number} · Skipped: {skipped, number}",{pass:counts.PASS,warning:counts.WARNING,fail:counts.FAIL,skipped:counts.SKIPPED})'],
   ['element("span", "nyx-support-state state-" + (!host.enabled ? "skipped" : counts.FAIL ? "fail" : counts.WARNING ? "warning" : "pass"), state)','element("span", "nyx-support-state state-" + (!host.enabled ? "skipped" : counts.FAIL ? "fail" : counts.WARNING ? "warning" : "pass"), nyxSupportEnum(state))'],
   ['lastBundleBytes.length.toLocaleString() + " bytes"','window.NyxI18n.number(lastBundleBytes.length,{style:"unit",unit:"byte",unitDisplay:"long"})'],
   ['"Upload accepted. Support ID: " + lastSupportId','window.NyxI18n.t("Upload accepted. Support ID: {id}",{id:lastSupportId})'],
  ];
  for(const[old,next]of sentences){if(!source.includes(old))throw Error('Support sentence prerequisite changed: '+old);source=source.replaceAll(old,next);}
  const replacements=[
   ['new Intl.DateTimeFormat(undefined,','new Intl.DateTimeFormat(window.NyxI18n.locale,'],
   ['evidence.days_remaining + " days remaining"','window.NyxI18n.message("dynamic.days-remaining",{count:evidence.days_remaining})'],
   ['evidence.seconds + " seconds process uptime"','window.NyxI18n.message("dynamic.uptime-seconds",{count:evidence.seconds})'],
   ['evidence.count + " occurrences"','window.NyxI18n.message("dynamic.occurrences",{count:evidence.count})'],
   ['item.count + " occurrences"','window.NyxI18n.message("dynamic.occurrences",{count:item.count})'],
   ['(offset + 1) + "–" + Math.min(offset + 20, data.total) + " of " + data.total + " grouped problems"','window.NyxI18n.message("dynamic.grouped-problems",{start:offset+1,end:Math.min(offset+20,data.total),total:data.total})'],
   ['hosts.length + " configured hosts · select a host to see every check and its troubleshooting action."','window.NyxI18n.message("dynamic.configured-hosts",{count:hosts.length})'],
   ['"Request failed (HTTP " + response.status + ")."','window.NyxI18n.message("dynamic.request-failed",{status:response.status})'],
  ];
  for(const[old,next]of replacements){
   const tokens=[...tokenizer(old,{ecmaVersion:'latest'})].map(t=>old.slice(t.start,t.end));
   const escaped=t=>t.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
   const pattern=new RegExp(tokens.map(escaped).join('\\s*'),'g');
   if(!pattern.test(source))throw Error('Reviewed dynamic prerequisite differs: '+old);pattern.lastIndex=0;source=source.replace(pattern,()=>next);
  }
  const recordText=(field,recommendation=false)=>`nyxDiagnosticText(record,${field},${recommendation})`;
  source=source.replace('record.summary.slice(0, 240)',recordText('record.summary')+'.slice(0, 240)');
  source=source.replace('"nyx-support-guidance", recommendation)', '"nyx-support-guidance", '+recordText('recommendation',true)+')');
  source=source.replace('Math.round(evidence.free_percent) + "% free"','window.NyxI18n.message("ui.de6074abfba5ebc5",{percent:evidence.free_percent/100})');
  source=source.replace('"Proxy host #" + evidence.host_id','window.NyxI18n.message("ui.cda6344c797b7a4b",{id:evidence.host_id})');
  source+=`\nfunction nyxDiagnosticText(record,text,recommendation){const raw=String(text||""),name=String(record.check||"").replaceAll("_"," ");if(raw===(recommendation?"Collect an observation for "+name+".":name+" was not observed."))return window.NyxI18n.message(recommendation?"ui.279be4421110deb6":"ui.702e8d7b8f8032a0",{check:nyxCheckLabel(record.check)});return window.NyxI18n.t(raw);}`;
  source+="\nfunction nyxCheckLabel(name){const names={\"uptime\": \"Manager Process Uptime\", \"openresty_health\": \"OpenResty Health\", \"cpu_usage\": \"CPU Usage\", \"dns_resolution\": \"DNS Resolution\", \"upstream_tcp\": \"Upstream TCP\", \"upstream_tls\": \"Upstream TLS\", \"upstream_http\": \"Upstream HTTP\", \"websocket_ready\": \"WebSocket Ready\", \"san_match\": \"SAN Match\", \"acme_ready\": \"ACME Ready\", \"dns_challenge_ready\": \"DNS Challenge Ready\", \"openresty_error\": \"OpenResty Error\", \"tls_handshake\": \"TLS Handshake\", \"upstream_http_error\": \"Upstream HTTP Error\", \"dns_challenge_plugin\": \"DNS Challenge Plugin\", \"certificate_storage_write\": \"Certificate Storage Write\"};const label=names[name]||String(name||\"Check\").replaceAll(\"_\",\" \").replace(/\\b\\w/g,letter=>letter.toUpperCase());return window.NyxI18n.t(label);}\n";
  const supportPresentation=[["element(\"strong\", \"\", title), element(\"span\", \"nyx-support-state state-\" + state.toLowerCase(), state)", "element(\"strong\", \"\", window.NyxI18n.t(title)), element(\"span\", \"nyx-support-state state-\" + state.toLowerCase(), nyxSupportEnum(state))"], ["element(\"span\", \"nyx-support-state state-\" + state.toLowerCase(), state)", "element(\"span\", \"nyx-support-state state-\" + state.toLowerCase(), nyxSupportEnum(state))"], ["manager.health || \"unknown\"", "nyxSupportEnum(manager.health || \"unknown\")"], ["vpn.health || \"unknown\"", "nyxSupportEnum(vpn.health || \"unknown\")"], ["(database.migrationsCurrent ? \" current\" : \" needs attention\")", "(\" \"+window.NyxI18n.t(database.migrationsCurrent?\"current\":\"needs attention\"))"], ["(update.currentVersion || \"Unknown\") + \" · \" + update.stage", "(update.currentVersion || window.NyxI18n.t(\"Unknown\")) + \" · \" + nyxSupportEnum(update.stage)"], ["\"nyx-support-evidence\", item.summary)", "\"nyx-support-evidence\", nyxProblemText(item,item.summary))"], ["\"Proxy host #\" + item.host_id", "window.NyxI18n.message(\"ui.cda6344c797b7a4b\",{id:item.host_id})"], ["\"Last seen \" + dateLabel(item.last_seen)", "window.NyxI18n.message(\"ui.76a9a5ad70d95629\",{date:dateLabel(item.last_seen)})"], ["\"Status: \" + item.status", "window.NyxI18n.message(\"ui.8b586fc084ef8f06\",{status:nyxSupportEnum(item.status)})"], ["\"Troubleshoot host #\" + item.host_id", "window.NyxI18n.message(\"ui.d7ed6ffe553dcbf0\",{id:item.host_id})"], ["[\"Operation\",item.operation]", "[\"Operation\",window.NyxI18n.t(item.operation)]"], ["[\"Cause classification\",item.cause_kind]", "[\"Cause classification\",nyxSupportEnum(item.cause_kind)]"], ["[\"Cause\",item.cause]", "[\"Cause\",nyxProblemText(item,item.cause)]"], ["[\"Outcome\",item.outcome]", "[\"Outcome\",nyxSupportEnum(item.outcome)]"], ["[\"Application state\",item.application_state]", "[\"Application state\",nyxSupportEnum(item.application_state)]"], ["[\"Recommended action\",item.recommendation]", "[\"Recommended action\",window.NyxI18n.t(item.recommendation)]"], ["throw new Error(safeMessage);", "throw new Error(reported && safeMessage===reported.message?window.NyxI18n.apiError(reported,response.status):safeMessage);"]];
  for(const[old,next]of supportPresentation){if(!source.includes(old))throw Error("Support presentation prerequisite changed: "+old);source=source.replaceAll(old,next);}
  source+="\nfunction nyxSupportEnum(value){if(typeof value!==\"string\")return value;const labels={PASS:\"Pass\",WARNING:\"Warning\",FAIL:\"Fail\",SKIPPED:\"Skipped\",healthy:\"Healthy\",unhealthy:\"Unhealthy\",starting:\"Starting\",unavailable:\"Unavailable\",available:\"Available\",unknown:\"Unknown\",idle:\"Idle\",checking:\"Checking\",update_available:\"Update available\",downloading:\"Downloading\",downloaded:\"Downloaded\",activating:\"Activating\",restart_pending:\"Restart pending\",success:\"Success\",recovery_required:\"Recovery required\",unconfirmed:\"Unconfirmed\",reported_error:\"Reported error\",failed:\"Failed\",timed_out:\"Timed out\",partially_completed:\"Partially completed\",recovered:\"Recovered\",rollback_verified:\"Rollback verified\"};return window.NyxI18n.t(labels[value]||value);}\nfunction nyxProblemText(item,text){const raw=String(text||\"\"),code=item.details?.runtime_error_code,zone=item.details?.dns_zone;if(code&&raw===\"Runtime reported \"+code+\".\")return window.NyxI18n.message(\"ui.cc9fda6e6388b669\",{code});if(item.code===\"CERTIFICATE_DNS_ZONE_NOT_FOUND\"&&zone&&raw===\"The DNS provider could not find an accessible zone for \"+zone+\".\")return window.NyxI18n.message(\"ui.dc4120ef358e63a0\",{zone});return window.NyxI18n.t(raw);}\n";
  source=source.replaceAll('.toLocaleString()', '.toLocaleString(window.NyxI18n.locale)');
 }
 return source;
}
