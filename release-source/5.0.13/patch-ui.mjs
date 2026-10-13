import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const root=process.argv[2]||'/app',assets=root+'/frontend/assets';
const inputs=process.argv[3]||'/tmp/nyxguard-ui';
function replace(source,old,next,label=old.slice(0,70)) {
  if(source.split(old).length!==2)throw Error('Certified 5.0.12 prerequisite differs: '+label);
  return source.replace(old,next);
}
const packageFile=root+'/package.json',pkg=JSON.parse(fs.readFileSync(packageFile));
if(pkg.version!=='5.0.12')throw Error('Expected immutable Manager 5.0.12 base');
pkg.version='5.0.13';fs.writeFileSync(packageFile,JSON.stringify(pkg,null,2)+'\n');
const notes=fs.readFileSync('/tmp/nyxguard-release-notes.md','utf8').replaceAll('../../docs/','https://github.com/NyxCloudRO/NyxGuardManager/blob/main/docs/');
fs.writeFileSync(root+'/CHANGELOG_PUBLIC.md',notes+'\n\n'+fs.readFileSync(root+'/CHANGELOG_PUBLIC.md','utf8'));
for(const name of ['index-DJfFx4nu.js','index-DTnhxNQ_.js','notification-visibility-4010.js','index-CTHAIRmi-409dev-4012certfix4-threatpagination3.js']){
 const file=assets+'/'+name;fs.writeFileSync(file,replace(fs.readFileSync(file,'utf8'),'5.0.12','5.0.13',name+' version'));
}
const updaterFile=root+'/internal/update-manager.js';
let updater=fs.readFileSync(updaterFile,'utf8');
updater='import{compatibleDockerPlatform,verifiedCachedPlatform}from"./update-platform.mjs";\n'+updater;
updater=replace(updater,'if (!force && state.lastCheckAt && Date.now() - new Date(state.lastCheckAt).getTime() < 10 * 60 * 1000) {','if (!force && verifiedCachedPlatform(state) && Date.now() >= Date.parse(state.lastCheckAt) && Date.now() - Date.parse(state.lastCheckAt) < 10 * 60 * 1000) {','legacy cache requires verified existing platform metadata');
updater=replace(updater,'const tags = [];','const tags = [];\n\t\t\tconst publishedTagMetadata = new Map();');
updater=replace(updater,'if (isStrictSemver(it?.name)) tags.push(String(it.name));','if (isStrictSemver(it?.name)) { tags.push(String(it.name)); publishedTagMetadata.set(String(it.name), it); }');
updater=replace(updater,'state.lastCheckAt = nowIso();\n\t\t\tstate.lastCheckError = null;\n\t\t\tawait this.saveState(state);','state.lastCheckAt = nowIso();\n\t\t\tstate.latestPlatform = { version: latestPublished, checkedAt: state.lastCheckAt, compatible: compatibleDockerPlatform(publishedTagMetadata.get(latestPublished)) };\n\t\t\tstate.lastCheckError = null;\n\t\t\tawait this.saveState(state);','verified Docker platform from existing tag response');
updater=replace(updater,'latestPublished,\n\t\t\tupdateAvailable:','latestPublished,\n\t\t\tlatestCompatible: !!(verifiedCachedPlatform(state) && state.latestPlatform.compatible),\n\t\t\tupdateAvailable:');
fs.writeFileSync(updaterFile,updater);execFileSync(process.execPath,['--check',updaterFile]);
// Classify known VPN validation failures without exposing profile material.
const vpnRouteFile=root+'/routes/vpn-client.js';let vpnRoute=fs.readFileSync(vpnRouteFile,'utf8');
vpnRoute=replace(vpnRoute,'throw new errs.ConfigurationError(payload?.error || `VPN agent returned HTTP ${response.status}`);','const message=String(payload?.error||"");const failure=new errs.ConfigurationError(message||`VPN agent returned HTTP ${response.status}`);if(message.startsWith("This profile uses a default route."))failure.code="VPN_FULL_TUNNEL_AGENT_REQUIRED";else if(/^(PrivateKey|PublicKey|PresharedKey) is not a valid WireGuard base64 key\\.$/.test(message))failure.code="VPN_INVALID_KEY";else if(message.includes("overlaps")||message.startsWith("Another full-tunnel VPN"))failure.code="VPN_ROUTE_CONFLICT";throw failure;');
fs.writeFileSync(vpnRouteFile,vpnRoute);execFileSync(process.execPath,['--check',vpnRouteFile]);
const diagnosticFile=root+'/internal/operational-diagnostics.mjs';let diagnostics=fs.readFileSync(diagnosticFile,'utf8');
diagnostics=replace(diagnostics,'const codes={','const codes={\n VPN_FULL_TUNNEL_AGENT_REQUIRED:["The installed VPN Agent requires an update to support this full-tunnel profile.","Update the VPN Agent using this Manager release, then upload again. Explicit remote networks remain optional for limiting the tunnel."],\n VPN_INVALID_KEY:["The WireGuard profile contains an invalid key.","Use the original exported client profile with valid WireGuard keys."],\n VPN_ROUTE_CONFLICT:["This VPN route conflicts with another connected tunnel or a local network.","Keep site networks distinct; disconnect the other full tunnel for the same IP family before connecting this one."],');
fs.writeFileSync(diagnosticFile,diagnostics);execFileSync(process.execPath,['--check',diagnosticFile]);
const notificationsFile=root+'/internal/notifications.js';let notifications=fs.readFileSync(notificationsFile,'utf8');
notifications=replace(notifications,'return typeof raw === "string" ? JSON.parse(raw) : raw || {};','const config=typeof raw === "string" ? JSON.parse(raw) : raw || {};if(config.webhook_url!==undefined&&config.webhookUrl===undefined){const {webhook_url,...rest}=config;return {...rest,webhookUrl:webhook_url};}return config;');
notifications=replace(notifications,'const config = data.config || {};','const config = parseConfig(data.config || {});');
notifications=replace(notifications,'let config = data.config !== undefined ? data.config : existing.config;','let config = parseConfig(data.config !== undefined ? data.config : existing.config);');
notifications=replace(notifications,'function rowToApi(row) {\n\tconst config = parseConfig(row.config_json);\n\treturn {\n\t\t...row,','function rowToApi(row) {\n\tconst config = parseConfig(row.config_json);\n\tconst {config_json,...publicRow}=row;\n\treturn {\n\t\t...publicRow,');
fs.writeFileSync(notificationsFile,notifications);execFileSync(process.execPath,['--check',notificationsFile]);
// Preserve the submitted first-match ACL policy order across create/edit saves.
const aclInternalFile=root+'/internal/access-list.js';let aclInternal=fs.readFileSync(aclInternalFile,'utf8');
aclInternal='import{insertOrderedClients}from"./access-list-order.mjs";\n'+aclInternal;
const originalCreateClients=`\t\t// Clients
\t\tdata.clients?.map((client) => {
\t\t\tpromises.push(
\t\t\t\taccessListClientModel.query().insert({
\t\t\t\t\taccess_list_id: row.id,
\t\t\t\t\taddress: client.address,
\t\t\t\t\tdirective: client.directive,
\t\t\t\t}),
\t\t\t);
\t\t\treturn true;
\t\t});`;
aclInternal=replace(aclInternal,originalCreateClients,'\t\t// Persist client IDs in the submitted policy order.\n\t\tawait insertOrderedClients(client=>accessListClientModel.query().insert({access_list_id:row.id,address:client.address,directive:client.directive}),data.clients||[]);');
const originalUpdateClients=`\t\t\tconst clientPromises = [];
\t\t\tdata.clients.map((client) => {
\t\t\t\tif (client.address) {
\t\t\t\t\tclientPromises.push(
\t\t\t\t\t\taccessListClientModel.query().insert({
\t\t\t\t\t\t\taccess_list_id: data.id,
\t\t\t\t\t\t\taddress: client.address,
\t\t\t\t\t\t\tdirective: client.directive,
\t\t\t\t\t\t}),
\t\t\t\t\t);
\t\t\t\t}
\t\t\t\treturn true;
\t\t\t});

\t\t\tconst query = accessListClientModel.query().delete().where("access_list_id", data.id);
\t\t\tawait query;
\t\t\t// Add new clitens
\t\t\tif (clientPromises.length) {
\t\t\t\tawait Promise.all(clientPromises);
\t\t\t}`;
aclInternal=replace(aclInternal,originalUpdateClients,'\t\t\tawait accessListClientModel.query().delete().where("access_list_id", data.id);\n\t\t\tawait insertOrderedClients(client=>accessListClientModel.query().insert({access_list_id:data.id,address:client.address,directive:client.directive}),data.clients.filter(client=>client.address));');
fs.writeFileSync(aclInternalFile,aclInternal);execFileSync(process.execPath,['--check',aclInternalFile]);
aclInternal=replace(aclInternal,'.execFile("openssl", ["passwd", "-apr1", item.password])','.execFile("openssl", ["passwd", "-apr1", "--", item.password])');
fs.writeFileSync(aclInternalFile,aclInternal);execFileSync(process.execPath,['--check',aclInternalFile]);
const accessPortalFile=root+'/routes/nginx/access_portal.js';let accessPortal=fs.readFileSync(accessPortalFile,'utf8');
accessPortal=replace(accessPortal,'["passwd", "-apr1", "-salt", salt, String(password ?? "")]','["passwd", "-apr1", "-salt", salt, "--", String(password ?? "")]');
fs.writeFileSync(accessPortalFile,accessPortal);execFileSync(process.execPath,['--check',accessPortalFile]);
const aclModelFile=root+'/models/access_list.js';let aclModel=fs.readFileSync(aclModelFile,'utf8');
aclModel=replace(aclModel,'to: "access_list_client.access_list_id",\n\t\t\t\t},','to: "access_list_client.access_list_id",\n\t\t\t\t},\n\t\t\t\tmodify: qb=>qb.orderBy("access_list_client.id","ASC"),');fs.writeFileSync(aclModelFile,aclModel);execFileSync(process.execPath,['--check',aclModelFile]);
const appsRoute=root+'/routes/nyxguard/attack-log.js';
let route=fs.readFileSync(appsRoute,'utf8');
route=replace(route,'enabled: !!r.enabled,\n\t\t\t\t\tdomains:', 'enabled: !!r.enabled,\n\t\t\t\t\tconfigurationApplied: !!r.enabled && r.meta?.nginx_online === true,\n\t\t\t\t\tapplicationState: !r.enabled ? "disabled" : r.meta?.nginx_online === true ? "applied" : r.meta?.nginx_online === false ? "apply_failed" : "unknown",\n\t\t\t\t\tdomains:');
fs.writeFileSync(appsRoute,route);
execFileSync(process.execPath,['--check',appsRoute]);
const mainFile=assets+'/index-CTHAIRmi-409dev-4012certfix4-threatpagination3.js';
let main=fs.readFileSync(mainFile,'utf8');
main=replace(main,'function wt({children:e,className:t,onClick:n,type:a,actionType:i,variant:o,size:l,color:c,fullWidth:d,isLoading:f,disabled:h})','function wt({children:e,className:t,onClick:n,type:a,actionType:i,variant:o,size:l,color:c,fullWidth:d,isLoading:f,disabled:h,title:nyxTitle,"aria-label":nyxLabel})');
main=replace(main,'type:a||"button",className:y,onClick:m,disabled:h,children:e','type:a||"button",className:y,onClick:m,disabled:h,title:nyxTitle,"aria-label":nyxLabel,children:e');
const start=main.indexOf('Tge=$t.create('),end=main.indexOf(',Whe=',start);
if(start<0||end<0)throw Error('Proxy wizard boundary differs');
let wizard=main.slice(start,end);
wizard=replace(wizard,'const{data:a,','const nyxForm=I.useRef(null),nyxClose=()=>{if(!y&&(!nyxForm.current?.dirty||window.confirm("Discard unsaved Proxy Host changes?")))n()};const{data:a,');
wizard=replace(wizard,'show:t,onHide:n,centered:!0,scrollable:!0','show:t,onHide:nyxClose,container:document.body,className:"nyx-proxy-wizard",dialogClassName:"nyx-proxy-wizard-dialog","aria-labelledby":"nyx-proxy-wizard-title",centered:!0,scrollable:!0,animation:!1,backdrop:"static"');
wizard=replace(wizard,'g.jsx(nr,{initialValues:','g.jsx(nr,{innerRef:nyxForm,validate:NyxValidateProxyLocations,initialValues:');
wizard=replace(wizard,'g.jsx(Ve.Title,{children:','g.jsx(Ve.Title,{id:"nyx-proxy-wizard-title",children:');
wizard=replace(wizard,'className:"nav nav-tabs card-header-tabs","data-bs-toggle":"tabs"','className:"nav nav-tabs card-header-tabs",role:"tablist","aria-label":"Proxy Host steps","data-bs-toggle":"tabs"');
wizard=replace(wizard,'title:"Settings","data-bs-toggle":"tab"','title:"Advanced settings","aria-label":"Advanced settings","data-bs-toggle":"tab"');
wizard=replace(wizard,'children:[g.jsx(Ve.Header,','children:[g.jsx(NyxWizardAccessibility,{}),g.jsx(Ve.Header,');
wizard=replace(wizard,'"data-bs-dismiss":"modal",onClick:n,disabled:y','onClick:nyxClose,disabled:y');
wizard=replace(wizard,'}),g.jsx(Cm,{section:tL,permission:nL','}),g.jsx(NyxWizardSteps,{busy:y}),g.jsx(Cm,{section:tL,permission:nL');
wizard=replace(wizard,'g.jsx("div",{className:"card-body",children:g.jsxs("div",{className:"tab-content",','g.jsxs("div",{className:"card-body nyx-wizard-body-grid",children:[g.jsxs("div",{className:"tab-content",');
wizard=replace(wizard,'children:g.jsx(a1,{})})]})})]})]})','children:g.jsx(a1,{})})]}),g.jsx(NyxProxySummary,{})]})]})]})');
wizard=replace(wizard,'g.jsxs("div",{className:"tab-pane active show",id:"tab-details"','g.jsxs(NyxWizardDetails,{className:"tab-pane active show",id:"tab-details"');
wizard=replace(wizard,'g.jsx("div",{className:"tab-pane",id:"tab-locations"','g.jsx(NyxWizardLocations,{className:"tab-pane",id:"tab-locations"');
wizard=replace(wizard,'g.jsxs("div",{className:"tab-pane",id:"tab-ssl"','g.jsxs(NyxWizardSsl,{className:"tab-pane",id:"tab-ssl"');
for(const [index,id] of [[1,'column.details'],[2,'proxy-host.protection'],[3,'column.custom-locations'],[4,'column.ssl']]){
 const original='role:"tab",children:g.jsx(K,{id:"'+id+'"})';
 wizard=replace(wizard,original,'role:"tab",children:g.jsxs(g.Fragment,{children:[g.jsx("span",{className:"nyx-step-number","aria-hidden":true,children:"'+index+'"}),g.jsx(K,{id:"'+id+'"})]})');
}
main=main.slice(0,start)+wizard+main.slice(end);
// Retain incomplete location edits so validation cannot silently drop them.
const locationStart=main.indexOf('function Rse('),locationEnd=main.indexOf('function a1(',locationStart);
if(locationStart<0||locationEnd<0)throw Error('Custom location component differs');
let locations=main.slice(locationStart,locationEnd);
locations=replace(locations,'f=()=>{a([...n,c])}','f=()=>{const next=[...n,c];a(next),y(next)}');
locations=replace(locations,'y=v=>{const A=v.filter(T=>T?.path?.trim()!=="");i(t,A)}','y=v=>{i(t,v)}');
locations=replace(locations,'placeholder:"/path",autoComplete:"off"','placeholder:"/path",id:"nyx-location-"+A+"-path","aria-label":"Location "+(A+1)+" path",autoComplete:"off"');
for(const field of ['forwardScheme','forwardHost','forwardPort']){
 locations=locations.replaceAll('id:"'+field+'"','id:"nyx-location-"+A+"-'+field+'"').replaceAll('htmlFor:"'+field+'"','htmlFor:"nyx-location-"+A+"-'+field+'"');
}
locations=replace(locations,'g.jsx("input",{type:"text",className:"form-control",placeholder:"/path"','g.jsx(NyxLocationInput,{locationIndex:A,fieldName:"path",type:"text",className:"form-control",placeholder:"/path"');
for(const field of ['forwardHost','forwardPort']){
 locations=replace(locations,'g.jsx("input",{id:"nyx-location-"+A+"-'+field+'"','g.jsx(NyxLocationInput,{locationIndex:A,fieldName:"'+field+'",id:"nyx-location-"+A+"-'+field+'"');
}
locations=replace(locations,'g.jsxs("select",{id:"nyx-location-"+A+"-forwardScheme"','g.jsxs(NyxLocationInput,{locationIndex:A,fieldName:"forwardScheme",as:"select",id:"nyx-location-"+A+"-forwardScheme"');
main=main.slice(0,locationStart)+locations+main.slice(locationEnd);
main+='\n'+fs.readFileSync(inputs+'/wizard-component.js','utf8');
// Show a sidebar notification only for freshly verified newer stable images.
main=replace(main,'i=!!t&&!!a.data?.updateAvailable','nyxUpdate=window.NyxUpdatePresentation(a.data,{error:a.isError||a.failureCount>0,checking:a.isPending}),i=!!t&&nyxUpdate.available');
main=replace(main,'children:[g.jsxs("button",{type:"button",className:We.sideUpdateBadge','children:[i&&g.jsxs("button",{type:"button",className:We.sideUpdateBadge');
main=replace(main,'className:We.sideUpdateBadge,onClick:','className:We.sideUpdateBadge+" nyx-update-entry","data-update-state":nyxUpdate.state,"aria-label":"Update Manager",title:nyxUpdate.label,onClick:');
main=replace(main,'children:i?[g.jsx(K,{id:"site-header.update-available"}),a.data?.latest?` v${a.data.latest}`:""]:[g.jsx(K,{id:"site-header.update-manager"})]','children:[g.jsx(K,{id:"site-header.update-available"}),g.jsx("small",{className:"nyx-update-entry-status",children:"v"+a.data?.latest})]');
main=replace(main,'H=I.useMemo(()=>T.data?.updateAvailable?o?!0:c:!1,[c,o,T.data?.updateAvailable])','H=I.useMemo(()=>window.NyxUpdatePresentation(T.data,{error:T.isError}).available?o?!0:c:!1,[c,o,T.data,T.isError])');
main=replace(main,'T.isPending?"Checking for updates…":T.isError||T.data?.lastCheckError?"Update check unavailable. Use Check now to retry.":T.data?.updateAvailable?','T.isPending||O.isPending||T.data?.stage==="checking"?"Checking for updates…":window.NyxUpdatePresentation(T.data,{error:T.isError}).state==="unknown"?"Update check unavailable. Use Check now to retry.":window.NyxUpdatePresentation(T.data).available?');
// A manual check updates the same existing query cache; no second checker.
main=replace(main,'function Mle(){const{data:e}=ql("me"),t=','function Mle(){const{data:e}=ql("me"),nyxUpdateClient=Va(),t=');
main=replace(main,'O=Mr({mutationFn:()=>q6(),onSuccess:()=>T.refetch()})','O=Mr({mutationFn:()=>q6(),onMutate:()=>{const previous=nyxUpdateClient.getQueryData(["update-manager","status"]);nyxUpdateClient.setQueryData(["update-manager","status"],status=>status?{...status,stage:"checking"}:status);return previous},onSuccess:()=>T.refetch(),onError:(error,variables,previous)=>nyxUpdateClient.setQueryData(["update-manager","status"],status=>status?{...status,stage:previous?.stage||"idle",lastCheckError:"Manual version check could not complete"}:status)})');
fs.writeFileSync(mainFile,main);
// Preserve manual access in the existing Settings version header.
const settingsFile=assets+'/index-DTnhxNQ_.js';let settings=fs.readFileSync(settingsFile,'utf8');
settings='import{aw as NyxCurrentUser}from"./index-CTHAIRmi-409dev-4012certfix4-threatpagination3.js";'+settings;
const versionTag='e.jsx("div",{className:t.versionTag,children:e.jsx(s,{id:"settings.backup.current-version",data:{version:K}})})';
settings=replace(settings,versionTag,'e.jsxs("div",{className:"nyx-settings-version-actions",children:['+versionTag+',e.jsx(NyxManualUpdateEntry,{})]})');
settings+='\nfunction NyxManualUpdateEntry(){const{data:user}=NyxCurrentUser("me");return user?.roles.includes("admin")?e.jsx("button",{type:"button",className:"nyx-update-manual-entry",title:"Check versions and manage updates",onClick:()=>window.dispatchEvent(new CustomEvent("nyxguard:open-update")),children:"Update Manager"}):null}\n';
settings='import{aL as NyxChannelSelect}from"./index-CTHAIRmi-409dev-4012certfix4-threatpagination3.js";'+settings;
const oldChannelSelect='e.jsxs("select",{className:t.notifInput,value:d.draft.type,onChange:n=>l(p=>({...p,draft:{...p.draft,type:n.target.value,config:{}}})),children:[e.jsx("option",{value:"webhook",children:r.formatMessage({id:"settings.notifications.type-webhook"})}),e.jsx("option",{value:"slack",children:r.formatMessage({id:"settings.notifications.type-slack"})}),e.jsx("option",{value:"email",children:r.formatMessage({id:"settings.notifications.type-email"})})]})';
settings=replace(settings,oldChannelSelect,'e.jsx(NyxChannelSelect,{inputId:"nyx-notification-channel-type","aria-label":r.formatMessage({id:"settings.notifications.channel-type"}),className:"react-select-container nyx-notification-channel-type",classNamePrefix:"react-select",isSearchable:false,isClearable:false,menuPlacement:"auto",options:["webhook","slack","email"].map(type=>({value:type,label:r.formatMessage({id:"settings.notifications.type-"+type})})),value:{value:d.draft.type,label:r.formatMessage({id:"settings.notifications.type-"+d.draft.type})},onChange:n=>l(p=>({...p,draft:{...p.draft,type:n.value,config:{}}}))})');
settings=replace(settings,'function Ft(){const a=A(),','function Ft(){const nyxChannelSave=y.useRef(false);const a=A(),');
settings=replace(settings,'onChange:n=>l(p=>({...p,draft:{...p.draft,type:n.value,config:{}}}))','onChange:n=>l(p=>p.draft.type===n.value?p:({...p,draft:{...p.draft,type:n.value,config:{}}}))');
settings=replace(settings,'const p=zt(n.config_json),w=H(n.events);','const p=zt(n.config||n.configJson||n.config_json),w=H(n.events);');
settings=replace(settings,'onClick:()=>g.mutate({editId:d.editId,draft:d.draft})','onClick:()=>{if(nyxChannelSave.current)return;nyxChannelSave.current=true;g.mutate({editId:d.editId,draft:d.draft},{onSettled:()=>{nyxChannelSave.current=false}})}');
fs.writeFileSync(settingsFile,settings);
// Keep page Help content/callbacks; strengthen labels and reuse existing icons.
for(const [name,jsx,icon,callback] of [
 ['index-Dd_E7hOB.js','e','X','S("ProxyHosts","lime")'],
 ['index-C40Q8nCD.js','e','P','L("AccessLists","cyan")'],
 ['index-BfJf9XXp-4012certfix4.js','l','Xr','kr("Certificates","pink")']
]) {
 const file=assets+'/'+name;let source=fs.readFileSync(file,'utf8');
 source=replace(source,`className:"nyx-help-pill",onClick:()=>${callback}`,`className:"nyx-help-pill",title:"Help","aria-label":"Help",onClick:()=>${callback}`);
 source=replace(source,`children:${jsx}.jsx(${icon},{size:15,stroke:2})`,`children:${jsx}.jsxs(${jsx}.Fragment,{children:[${jsx}.jsx(${icon},{size:18,stroke:2,"aria-hidden":true})]})`);
 source=source.replace(/,"aria-label":"Open (?:NyxGuard Proxy Host|access list|certificates) help"/,'');
 fs.writeFileSync(file,source);
}
for(const [name,jsx,translation,object] of [
 ['index-Dd_E7hOB.js','e','n','proxy-host'],['index-C40Q8nCD.js','e','t','access-list'],
 ['index-BfJf9XXp-4012certfix4.js','l','N','certificate'],['index-K4lT3P_L.js','e','o','user']
]){
 const file=assets+'/'+name;let source=fs.readFileSync(file,'utf8');
 const add=`${jsx}.jsx(${translation},{id:"object.add",tData:{object:"${object}"}})`;
 if(!source.includes(add))throw Error('Add action prerequisite differs: '+name);
 source='import{PlusIcon as NyxToolbarPlus}from"./toolbar-primitives.js";'+source.replaceAll(add,`${jsx}.jsxs(${jsx}.Fragment,{children:[${jsx}.jsx(NyxToolbarPlus,{}),${add}]})`);
 fs.writeFileSync(file,source);
}
for(const name of fs.readdirSync(assets).filter(n=>n.endsWith('.js'))){
 const file=assets+'/'+name;let source=fs.readFileSync(file,'utf8');
 if(source.includes('className:"nyx-dashboard-action-row"')||source.includes('nyx-users-header-actions')){
  source=source.replaceAll('className:"ms-auto d-flex flex-wrap btn-list nyx-users-header-actions"','className:"nyx-page-toolbar"');
  source=source.replaceAll('className:"nyx-dashboard-action-row"','className:"nyx-dashboard-action-row nyx-page-toolbar"');
  source=source.replaceAll('id:"advanced-table-search",type:"text"','id:"advanced-table-search","aria-label":"Search",placeholder:"Search…",type:"text"');
  fs.writeFileSync(file,source);
 }
}
let apps=fs.readFileSync(assets+'/index-C8uhQqRV.js','utf8');
apps=replace(apps,'||a.domains?.[0]||','||');
apps=replace(apps,'n.jsx("div",{className:"nyx-app-domains",children:(a.domains??[]).map(domain=>n.jsx("span",{children:domain},domain))})','null');
apps=replace(apps,'children:e?t.formatMessage({id:"nyxguard.apps.status.protected"}):t.formatMessage({id:"nyxguard.apps.status.monitoring"})','children:!i.data||a.applicationState==="unknown"?"Unverified":!a.enabled?"Disabled":!a.configurationApplied?"Apply failed":j?t.formatMessage({id:"nyxguard.apps.status.protected"}):e?"Partial":t.formatMessage({id:"nyxguard.apps.status.monitoring"})');
const headers=['Application','Status','WAF','Bot Defence','DDoS','SQL Shield','Auth Bypass'];
const header='n.jsxs("div",{className:"nyx-app-table-head",role:"row",children:'+JSON.stringify(headers)+'.map(label=>n.jsx("span",{role:"columnheader",children:label},label))})';
apps=replace(apps,':(p.data?.items??[]).map(a=>{',':n.jsxs("div",{className:"nyx-app-table",role:"table","aria-label":"Protected Applications",children:['+header+',...(p.data?.items??[]).map(a=>{');
apps=replace(apps,']},a.id)}),d.isError',']},a.id)})]}),d.isError');
apps=replace(apps,'className:s.row,children:','className:s.row,role:"row",children:');
apps=replace(apps,'className:"nyx-app-identity",children:','className:"nyx-app-identity",role:"cell",children:');
apps=replace(apps,'className:u(s.badge,s.status,','role:"cell",className:u(s.badge,s.status,');
for(const [old,short] of [
 ['e?t.formatMessage({id:"nyxguard.apps.action.disable-waf"}):t.formatMessage({id:"nyxguard.apps.action.enable-waf"})','e?"On":"Off"'],
 ['m?t.formatMessage({id:"nyxguard.apps.action.bot-global-off"}):c?t.formatMessage({id:"nyxguard.apps.action.disable-bot"}):t.formatMessage({id:"nyxguard.apps.action.enable-bot"})','m?"Global off":c?"On":"Off"'],
 ['x?t.formatMessage({id:"nyxguard.apps.action.ddos-global-off"}):f?t.formatMessage({id:"nyxguard.apps.action.disable-ddos"}):t.formatMessage({id:"nyxguard.apps.action.enable-ddos"})','x?"Global off":f?"On":"Off"'],
 ['E?t.formatMessage({id:"nyxguard.apps.action.sqli-global-off"}):y?t.formatMessage({id:"nyxguard.apps.action.disable-sqli"}):t.formatMessage({id:"nyxguard.apps.action.enable-sqli"})','E?"Global off":y?"On":"Off"'],
 ['b?t.formatMessage({id:"nyxguard.apps.action.disable-auth"}):t.formatMessage({id:"nyxguard.apps.action.enable-auth"})','e&&b?"On":"Off"']
])apps=replace(apps,'children:'+old,'"aria-label":('+old+')+" for "+r,children:'+short);
apps=replace(apps,'"aria-pressed":e&&M&&b','"aria-pressed":e&&b');
apps=replace(apps,'b&&!M?t.formatMessage({id:"nyxguard.apps.tooltip.auth-bypass-on-global-off"}):b?','b&&!M?"This application override is enabled. Recognized authenticated traffic bypasses applicable bot, SQL injection and rate checks.":b?');
apps=replace(apps,'onSuccess:async(a,r)=>{await l.invalidateQueries({queryKey:["nyxguard","apps"]})','onSettled:async(a,error,r)=>{await l.invalidateQueries({queryKey:["nyxguard","apps"]})');
apps=apps.replaceAll('n.jsx("button",{','n.jsx(NyxAppControl,{applied:a.configurationApplied,');
apps=replace(apps,'className:s.actions,role:"group"','className:s.actions,role:"presentation"');
apps+='\nfunction NyxAppControl(props){const {children,applied,...native}=props,checked=!!applied&&!!native["aria-pressed"];delete native["aria-pressed"];return n.jsx("span",{role:"cell",className:"nyx-app-control-cell",children:n.jsxs("button",{...native,role:"switch","aria-checked":checked,className:native.className+" nyx-app-switch",title:applied?(native.title||native["aria-label"]):"Configuration is not verified as applied",disabled:native.disabled||!applied,children:[n.jsx("span",{className:"nyx-switch-track","aria-hidden":true,children:n.jsx("span",{className:"nyx-switch-thumb"})}),n.jsx("span",{className:"nyx-switch-state","aria-hidden":true,children:applied?children:"Unapplied"})]})})}\n';
apps='import{requestConfirmation as NyxRequestConfirmation,useConfirmationBusy as NyxConfirmationBusy}from"./confirmation-dialog.js";'+apps;
const confirmationFlows=[
 ['e','Disable WAF','wafEnabled:!e','Disabling WAF removes web application firewall protection and its dependent security controls from this application.'],
 ['c','Disable Bot Defence','wafEnabled:!0,botDefenseEnabled:!c','Disabling Bot Defence allows traffic that this application’s bot checks would otherwise block.'],
 ['f','Disable DDoS protection','wafEnabled:!0,ddosEnabled:!f','Disabling DDoS Shield removes this application’s request and connection rate protections.'],
 ['y','Disable SQL Shield','wafEnabled:!0,sqliEnabled:!y','Disabling SQL Shield removes SQL injection detection from this application’s traffic.'],
 ['b','Enable Auth Bypass','wafEnabled:!0,authBypassEnabled:!b','Enabling Authenticated Traffic Bypass exempts traffic recognized as authenticated from applicable bot, SQL injection and rate protections. It does not authenticate users or grant application access.']
];
for(const [flag,action,payload,impact] of confirmationFlows){
 const originalMessage=action+' for "+r+"? '+(flag==='e'?'This removes its WAF protection.':'This changes the protection applied to its traffic.');
 const condition=flag==='b'?'b':'!'+flag;
 const original='onClick:()=>{if('+condition+'||window.confirm("'+originalMessage+'"))d.mutate({id:a.id,'+payload+'})}';
 const replacement='onClick:()=>{if('+condition+')d.mutate({id:a.id,'+payload+'});else NyxRequestConfirmation({title:"'+action+'?",action:"'+action+'",reducesProtection:true,message:"Application: "+r+". '+impact+'",onConfirm:()=>d.mutateAsync({id:a.id,'+payload+'})})}';
 apps=replace(apps,original,replacement,'Protected Apps confirmation '+action);
}
apps=replace(apps,'function NyxAppControl(props){const {children,applied,...native}=props','function NyxAppControl(props){const confirming=NyxConfirmationBusy();const {children,applied,...native}=props');
apps=replace(apps,'disabled:native.disabled||!applied','disabled:native.disabled||!applied||confirming');
fs.writeFileSync(assets+'/index-C8uhQqRV.js',apps);
// Scope density changes to the Diagnostics tab; Overview remains unchanged.
const supportFile=assets+'/professional-support.js';
let support=fs.readFileSync(supportFile,'utf8');
support=replace(support,'function problemsPanel(parent, compact) {','function problemsPanel(parent, compact) {\n    if (!compact) parent.classList.add("nyx-support-recent-problems");');
support=replace(support,'var output = element("div", "nyx-support-problems");','var output = element("div", "nyx-support-problems" + (compact ? "" : " nyx-support-problems-compact"));');
fs.writeFileSync(supportFile,support);
// Recover four usable sidebar pixels without moving the sidebar/main boundary.
const supportCssFile=assets+'/professional-support.css';
let supportCss=fs.readFileSync(supportCssFile,'utf8');
supportCss=replace(supportCss,'aside[aria-label="Main navigation"]{padding:5px!important}','aside[aria-label="Main navigation"]{padding:5px 3px!important}','short desktop sidebar inset');
fs.writeFileSync(supportCssFile,supportCss);
const rulesFile=assets+'/index-DHuZiE1T-task2.js';
let rules=fs.readFileSync(rulesFile,'utf8');
const note='className:"text-secondary",children:t.note??"-"';
if(rules.split(note).length!==3)throw Error('IP/country note cells differ');
rules=rules.replaceAll(note,'className:"text-secondary",children:e.jsx("span",{className:"nyx-rule-note",title:t.note||"",children:t.note??"-"})');
rules='import{RuleStateControl as NyxRuleState,RuleRowAction as NyxRuleAction}from"./toolbar-primitives.js";import{requestConfirmation as NyxRequestRuleConfirmation}from"./confirmation-dialog.js";'+rules;
rules=replace(rules,'minHeight:38,backgroundColor:','minHeight:36,backgroundColor:');
rules=replace(rules,'"data-task2-rules":true','"data-task2-rules":true,"data-nyx-managed-controls":true');
if(rules.split('e.jsx("input",{type:"checkbox"').length!==3)throw Error('Expected two rule state controls');
rules=rules.replaceAll('e.jsx("input",{type:"checkbox"','e.jsx(NyxRuleState,{"aria-label":"Enabled rule "+(t.ipCidr||t.countryCode),type:"checkbox"');
rules=replace(rules,'disabled:t.expired||Boolean(t.expiresOn&&Date.parse(t.expiresOn)<=Date.now()),title:','disabled:ae.isPending||t.expired||Boolean(t.expiresOn&&Date.parse(t.expiresOn)<=Date.now()),title:');
rules=replace(rules,'type:"checkbox",checked:t.enabled,onChange:l=>se.mutate','type:"checkbox",checked:t.enabled&&!Boolean(t.expiresOn&&Date.parse(t.expiresOn)<=Date.now()),disabled:se.isPending||Boolean(t.expiresOn&&Date.parse(t.expiresOn)<=Date.now()),title:t.expiresOn&&Date.parse(t.expiresOn)<=Date.now()?"Expired rule is not enforced":"Enable or disable this active rule",onChange:l=>se.mutate');
rules=replace(rules,'e.jsx("button",{type:"button",className:r.ghost,disabled:Boolean((t.expired','e.jsx(NyxRuleAction,{kind:"edit",target:t.ipCidr,type:"button",className:r.ghost,disabled:Boolean((t.expired');
rules=replace(rules,'e.jsx("button",{type:"button",className:r.ghost,onClick:()=>{setEditing({id:t.id,type:"country"})','e.jsx(NyxRuleAction,{kind:"edit",target:t.countryCode,type:"button",className:r.ghost,onClick:()=>{setEditing({id:t.id,type:"country"})');
for(const [kind,mutation,target] of [['IP','W','ipCidr'],['country','Z','countryCode']]){
 rules=replace(rules,'e.jsx("button",{type:"button",className:r.ghost,disabled:'+mutation+'.isPending,onClick:()=>{if(window.confirm("Delete this '+kind+' rule?"))'+mutation+'.mutate(t.id)}',
 'e.jsx(NyxRuleAction,{kind:"delete",target:t.'+target+',type:"button",className:r.ghost,disabled:'+mutation+'.isPending,onClick:()=>NyxRequestRuleConfirmation({title:"Delete '+kind+' rule?",action:"Delete rule",reducesProtection:true,message:"Delete the "+t.action.toUpperCase()+" rule for "+t.'+target+'+"? This removes only this rule from the active policy.",onConfirm:()=>'+mutation+'.mutateAsync(t.id)})');
}
const bulk='onClick:()=>{if(d==="ip"){const l=c.data?.items?.length??0;if(!window.confirm(n.formatMessage({id:"nyxguard.rules.delete-all-ip-confirm"},{count:l})))return;J.mutate();return}const t=x.data?.items?.length??0;window.confirm(n.formatMessage({id:"nyxguard.rules.delete-all-country-confirm"},{count:t}))&&X.mutate()}';
rules=replace(rules,bulk,'onClick:()=>NyxRequestRuleConfirmation({title:d==="ip"?"Delete all IP rules?":"Delete all country rules?",action:"Delete all rules",reducesProtection:true,message:n.formatMessage({id:d==="ip"?"nyxguard.rules.delete-all-ip-confirm":"nyxguard.rules.delete-all-country-confirm"},{count:d==="ip"?(c.data?.items?.length??0):(x.data?.items?.length??0)}),onConfirm:()=>d==="ip"?J.mutateAsync():X.mutateAsync()})');
rules=replace(rules,'className:r.ghost,disabled:J.isPending','className:r.ghost+" nyx-rule-bulk-delete",disabled:J.isPending');
rules=replace(rules,'e.jsx("div",{className:r.label,children:e.jsx(s,{id:"value"})})','e.jsx("label",{className:r.label,htmlFor:"nyx-rule-value",children:e.jsx(s,{id:"value"})})');
rules=replace(rules,'className:r.input,value:d==="ip"?b:v','className:r.input,id:"nyx-rule-value","aria-invalid":!!E,"aria-describedby":E?"nyx-rule-value-error":undefined,value:d==="ip"?b:v');
rules=replace(rules,'className:r.inlineError,children:E','className:r.inlineError,id:"nyx-rule-value-error",role:"alert",children:E');
rules=replace(rules,'e.jsx("div",{className:r.label,children:e.jsx(s,{id:"nyxguard.rules.note-optional"})})','e.jsx("label",{className:r.label,htmlFor:"nyx-rule-note",children:e.jsx(s,{id:"nyxguard.rules.note-optional"})})');
rules=replace(rules,'className:r.input,value:g','className:r.input,id:"nyx-rule-note",maxLength:255,value:g');
rules=rules.replaceAll('className:"nyx-rule-note",title:t.note||""','className:"nyx-rule-note",tabIndex:t.note?0:undefined,"aria-label":t.note||undefined,title:t.note||""');
for(const [key,label] of [['ip','Search IP or CIDR'],['country','Search country code']])rules=replace(rules,'className:r.filterInput,placeholder:n.formatMessage({id:"nyxguard.rules.filter.'+key+'"})','className:r.filterInput,"aria-label":"'+label+'",placeholder:n.formatMessage({id:"nyxguard.rules.filter.'+key+'"})');
const noteFilter='className:r.filterInput,placeholder:n.formatMessage({id:"nyxguard.rules.filter.note"})';
if(rules.split(noteFilter).length!==3)throw Error('Expected two note filters');
rules=rules.replaceAll(noteFilter,'className:r.filterInput,"aria-label":"Search rule notes",placeholder:n.formatMessage({id:"nyxguard.rules.filter.note"})');
for(const flag of ['f','h'])rules=replace(rules,'className:r.filterInput,value:'+flag,'className:r.filterInput,"aria-label":"Filter rule action",value:'+flag);
fs.writeFileSync(rulesFile,rules);
// Explicit component ownership replaces legacy text-based button decoration.
for(const name of ['local-dev-fixes.js','local-dev-fixes-408dev.js','local-dev-fixes-409dev.js']){
 const file=assets+'/'+name;let source=fs.readFileSync(file,'utf8');
 source=replace(source,'var label = (button.textContent || "").replace(/\\s+/g, " ").trim();','if(button.closest("[data-nyx-managed-controls]")) return;\n\t\t\t\tvar label = (button.textContent || "").replace(/\\s+/g, " ").trim();','legacy text decoration '+name);
 fs.writeFileSync(file,source);
}
// Migrate every remaining application-owned native dialog. One host owns nesting.
for(const name of fs.readdirSync(assets).filter(n=>n.endsWith('.js')&&n!==path.basename(mainFile))){
 const file=assets+'/'+name;let source=fs.readFileSync(file,'utf8');let count=0;
 source=source.replace(/onClick:\(\)=>\{window\.confirm\((.*?)\)&&([\w$]+)\.mutate\((.*?)\)\}/g,(all,message,mutation,payload)=>{
  count++;let title='Confirm change?',action='Confirm change';
  if(message.includes('confirm-delete')){title='Delete WAF rule?';action='Delete rule'}
  if(message.includes('clear-confirm')){title='Clear selected history?';action='Clear selected history'}
  if(message.includes('notifications.confirm-delete')){title='Delete notification channel?';action='Delete channel'}
  if(message.includes('integrations.rotate-confirm')){title='Rotate API key secret?';action='Rotate secret'}
  if(message.includes('integrations.delete-confirm')){title='Delete API key?';action='Delete key'}
  return `onClick:()=>NyxRequestConfirmation({title:${JSON.stringify(title)},action:${JSON.stringify(action)},reducesProtection:true,message:${message},onConfirm:()=>${mutation}.mutateAsync(${payload})})`;
 });
 if(name==='index-DHuZiE1T.js'){
  source=replace(source,'onClick:()=>{if(d==="ip"){const l=c.data?.items?.length??0;if(!window.confirm(n.formatMessage({id:"nyxguard.rules.delete-all-ip-confirm"},{count:l})))return;J.mutate();return}const t=x.data?.items?.length??0;window.confirm(n.formatMessage({id:"nyxguard.rules.delete-all-country-confirm"},{count:t}))&&X.mutate()}','onClick:()=>NyxRequestConfirmation({title:d==="ip"?"Delete all IP rules?":"Delete all country rules?",action:"Delete all rules",reducesProtection:true,message:n.formatMessage({id:d==="ip"?"nyxguard.rules.delete-all-ip-confirm":"nyxguard.rules.delete-all-country-confirm"},{count:d==="ip"?c.data?.items?.length??0:x.data?.items?.length??0}),onConfirm:()=>d==="ip"?J.mutateAsync():X.mutateAsync()})');count++;
 }
 if(name==='index-DTnhxNQ_.js'){
  source=replace(source,'window.confirm(r.formatMessage({id:"settings.backup.reboot-confirm"}))&&b.mutate()','NyxRequestConfirmation({title:"Restart after restore?",action:"Restart Manager",reducesProtection:true,message:r.formatMessage({id:"settings.backup.reboot-confirm"}),onConfirm:()=>b.mutateAsync()})');count++;
 }
 if(name==='index-DJfFx4nu.js'){
  source=replace(source,'if(!window.confirm(`Permanently delete all ${data.total} audit records (${data.occurrences} occurrences) matching these filters? Threat Activity is unaffected.`))return;','if(!await NyxRequestDecision({title:"Clear selected audit history?",action:"Clear selected scope",reducesProtection:true,message:`Permanently delete all ${data.total} audit records (${data.occurrences} occurrences) matching these filters? Threat Activity is unaffected.`}))return;');count++;
 }
 if(count){source='import{requestConfirmation as NyxRequestConfirmation,requestDecision as NyxRequestDecision}from"./confirmation-dialog.js";'+source;fs.writeFileSync(file,source);}
 if(name==='vpn-client-4014.js'){
  source=replace(source,'if (action === "delete" && !window.confirm(\'Delete VPN site “\' + site.name + \'”?\')) return;','if(action === "delete"){const {requestDecision}=await import("./confirmation-dialog.js");if(!await requestDecision({title:"Delete VPN site?",action:"Delete site",reducesProtection:true,message:\'Delete VPN site “\'+site.name+\'”?\'}))return;}');fs.writeFileSync(file,source);
 }
}
main=fs.readFileSync(mainFile,'utf8');
main='import{ConfirmationDialog as NyxGlobalConfirmation,requestDecision as NyxRequestDecision,requestAlert as NyxRequestAlert,confirmationBusy as NyxConfirmationBusyNow}from"./confirmation-dialog.js";'+main;
main=replace(main,'nyxClose=()=>{if(!y&&(!nyxForm.current?.dirty||window.confirm("Discard unsaved Proxy Host changes?")))n()}','nyxClose=async()=>{if(y||NyxConfirmationBusyNow())return;if(!nyxForm.current?.dirty||await NyxRequestDecision({title:"Discard unsaved Proxy Host changes?",action:"Discard changes",cancelLabel:"Keep editing",reducesProtection:true,message:"Changes in this draft will be lost. The saved Proxy Host configuration will remain unchanged."}))n()}');
main=replace(main,'window.alert(ne instanceof Error?ne.message:String(ne))','NyxRequestAlert({title:"Update preparation failed",message:ne instanceof Error?ne.message:String(ne)})');
main=replace(main,'children:g.jsx(Ehe,{})','children:g.jsxs(g.Fragment,{children:[g.jsx(Ehe,{}),g.jsx(NyxGlobalConfirmation,{})]})','single global confirmation host');
main=replace(main,"const key=event=>{\n      if(event.key==='Tab'){","const key=event=>{\n      if(NyxConfirmationBusyNow())return;\n      if(event.key==='Tab'){");
fs.writeFileSync(mainFile,main);
// Give each existing ACL row an accessible name without changing its state updates.
let authStart=main.indexOf('function Cee('),authEnd=main.indexOf('let _f=',authStart);if(authStart<0||authEnd<0)throw Error('ACL authorization helper boundary differs');
let authorizations=main.slice(authStart,authEnd);
authorizations=replace(authorizations,'type:"text",autoComplete:"off",className:"form-control input-sm"','type:"text",id:"nyx-acl-username-"+m,"aria-label":"Authorization "+(m+1)+" username",autoComplete:"off",className:"form-control input-sm"');
authorizations=replace(authorizations,'type:"password",autoComplete:"off",className:"form-control"','type:"password",id:"nyx-acl-password-"+m,"aria-label":"Authorization "+(m+1)+" password",autoComplete:"off",className:"form-control"');
authorizations=replace(authorizations,'htmlFor:"...",children:g.jsx(K,{id:"username"})','htmlFor:"nyx-acl-username-0",children:g.jsx(K,{id:"username"})');
authorizations=replace(authorizations,'htmlFor:"...",children:g.jsx(K,{id:"password"})','htmlFor:"nyx-acl-password-0",children:g.jsx(K,{id:"password"})');
authorizations=replace(authorizations,'type:"button",className:"btn btn-ghost btn-danger p-0"','type:"button","aria-label":"Remove authorization "+(m+1),className:"btn btn-ghost btn-danger p-0"');
authorizations=replace(authorizations,'type:"button",className:"btn btn-sm",onClick:l','type:"button","aria-label":"Add authorization",className:"btn btn-sm",onClick:l');
main=main.slice(0,authStart)+authorizations+main.slice(authEnd);
let clientStart=main.indexOf('function SX('),clientEnd=main.indexOf('function ',clientStart+12);if(clientStart<0||clientEnd<0)throw Error('ACL rule helper boundary differs');let clients=main.slice(clientStart,clientEnd);
clients=replace(clients,'name:`clients[${m}].directive`,value:','name:`clients[${m}].directive`,"aria-label":"Rule "+(m+1)+" action",value:');
clients=replace(clients,'name:`clients[${m}].address`,type:"text"','name:`clients[${m}].address`,"aria-label":"Rule "+(m+1)+" IP or CIDR",type:"text"');
clients=replace(clients,'type:"button",className:"btn btn-ghost btn-danger p-0"','type:"button","aria-label":"Remove rule "+(m+1),className:"btn btn-ghost btn-danger p-0"');
clients=replace(clients,'type:"button",className:"btn btn-sm",onClick:l','type:"button","aria-label":"Add rule",className:"btn btn-sm",onClick:l');
main=main.slice(0,clientStart)+clients+main.slice(clientEnd);
// Modernize the actual management dialogs through one presentation shell.
const modalKinds={xue:['access-list','f'],Tue:['password','o'],wue:['certificate-custom','o'],_ue:['confirm','h'],Nue:['certificate-dns','o'],mge:['help','false'],bge:['certificate-http','o'],vge:['permissions','f'],Age:['certificate-renew','m'],Lge:['set-password','c'],Pge:['two-factor','T'],Uge:['user','y||B.isPending||P.isPending']};
const modalDeclarations=[...main.matchAll(/\$t\.create\(/g)].map(match=>({at:match.index,name:main.slice(Math.max(0,match.index-40),match.index).match(/([\w$]+)=$/)?.[1]||'certificate-details'}));
let modernCount=0;
main=main.replace(/g\.(jsx|jsxs)\(Ve,\{show:([\w]+),onHide:([\w]+)/g,(all,jsx,show,onHide,at)=>{
 const name=modalDeclarations.filter(declaration=>declaration.at<at).at(-1)?.name;
 if(name==='Tge')return all;
 const [kind,busy]=modalKinds[name]||['certificate-details','false'];modernCount++;
 return `g.${jsx}(NyxManagementModal,{kind:${JSON.stringify(kind)},busy:${busy},show:${show},onHide:${onHide}`;
});
if(modernCount!==13)throw Error('Management modal inventory differs: '+modernCount);
const userBody='g.jsxs(Ve.Body,{children:[g.jsx(vn,{variant:"danger",show:!!h,onClose:()=>m(null),dismissible:!0,children:h}),g.jsxs("div",{className:"d-flex align-items-center gap-3 mb-3 flex-wrap"';
main=replace(main,userBody,userBody.replace('g.jsxs(Ve.Body','g.jsxs(NyxUserBody'),'group identity/profile and permissions without changing fields');
for(const [component,kind] of [['wue','custom'],['Nue','dns'],['bge','http']]){
 const begin=main.indexOf(component+'=$t.create('),end=main.indexOf('$t.create(',begin+component.length+12);
 if(begin<0||end<0)throw Error('Certificate workflow boundary differs: '+component);
 let section=main.slice(begin,end);let count=0;
 section=section.replace(/g\.(jsx|jsxs)\(Ve\.Body,\{/g,(all,jsx)=>{count++;return `g.${jsx}(NyxCertificateBody,{kind:${JSON.stringify(kind)},`});
 if(count!==1)throw Error('Certificate workflow body differs: '+component);
 main=main.slice(0,begin)+section+main.slice(end);
}
const aclBegin=main.indexOf('xue=$t.create('),aclEnd=main.indexOf('Tue=$t.create(',aclBegin);let acl=main.slice(aclBegin,aclEnd);
for(const [index,key] of [[1,'column.details'],[2,'column.authorizations'],[3,'column.rules']]){
 const original='role:"tab",children:g.jsx(K,{id:"'+key+'"})';
 acl=replace(acl,original,'role:"tab",children:g.jsxs(g.Fragment,{children:[g.jsx("span",{className:"nyx-step-number","aria-hidden":true,children:"'+index+'"}),g.jsx(K,{id:"'+key+'"})]})');
}
acl=replace(acl,'}),g.jsx(wt,{type:"submit",actionType:"primary",className:"ms-auto bg-cyan"','}),g.jsx(NyxWizardSteps,{busy:f,modalSelector:".nyx-management-access-list",steps:3}),g.jsx(wt,{type:"submit",actionType:"primary",className:"ms-auto bg-cyan"');
main=main.slice(0,aclBegin)+acl+main.slice(aclEnd);
// Set-password's existing pending flag must cover its request, just like Change Password.
const passwordBegin=main.indexOf('Lge=$t.create('),passwordEnd=main.indexOf('Pge=$t.create(',passwordBegin);let password=main.slice(passwordBegin,passwordEnd);
password=replace(password,'if(!c){i(null);try{await RD(e,h.new)','if(!c){d(!0),i(null);try{await RD(e,h.new)','set-password pending guard');main=main.slice(0,passwordBegin)+password+main.slice(passwordEnd);
// Replace the updater's div/backdrop key handler, which also closed on bubbled Enter/Space.
main=replace(main,'a?g.jsx("div",{className:We.updateModalBackdrop,role:"button",tabIndex:0,onClick:ne=>{ne.target===ne.currentTarget&&i(!1)},onKeyDown:ne=>{(ne.key==="Escape"||ne.key==="Enter"||ne.key===" ")&&(ne.preventDefault(),i(!1))},children:g.jsxs("div",{className:We.updateModal,role:"dialog","aria-modal":"true","aria-label":"Update Manager",','a?g.jsx(NyxManagementModal,{kind:"update-manager",show:a,onHide:()=>i(!1),"aria-label":"Update Manager",backdrop:"static",children:g.jsxs("div",{className:We.updateModal+" nyx-update-inner",');
main=replace(main,'q?g.jsx("div",{className:We.whatsNewOverlay,children:g.jsxs("div",{className:We.whatsNewCard,','q?g.jsx(NyxManagementModal,{kind:"release-notes",show:q,backdrop:"static",keyboard:false,"aria-label":"What’s new",children:g.jsxs("div",{className:We.whatsNewCard+" nyx-release-notes-inner",');
if(main.split('name:"btn-radio-basic"').length!==4)throw Error('Permission radio group inventory differs');
main=main.replaceAll('name:"btn-radio-basic"','name:_.name');
fs.writeFileSync(mainFile,main+'\n'+fs.readFileSync(inputs+'/management-modal.js','utf8'));
const recoveryFile=assets+'/index-BwdLWqJB.js';let recovery=fs.readFileSync(recoveryFile,'utf8');recovery=replace(recovery,'M as b','NyxManagementModal as b','one-time account recovery modal presentation');fs.writeFileSync(recoveryFile,recovery);
// Reject remaining direct native references in the immutable input/output assets.
for(const name of fs.readdirSync(assets).filter(n=>n.endsWith('.js'))){
 if(/window\.(confirm|alert|prompt)\s*\(/.test(fs.readFileSync(assets+'/'+name,'utf8')))throw Error('Native dialog migration incomplete: '+name);
}
for(const name of ['management-ui.css','update-presentation.js','toolbar-primitives.js','confirmation-dialog.js'])fs.copyFileSync(inputs+'/'+name,assets+'/'+name);
let html=fs.readFileSync(root+'/frontend/index.html','utf8');
html=replace(html,'<link rel="stylesheet" href="/assets/protected-apps.css">','<link rel="stylesheet" href="/assets/protected-apps.css"><link rel="stylesheet" href="/assets/management-ui.css?v=5.0.13"><script src="/assets/update-presentation.js?v=5.0.13"></script>');
// All duplicated legacy row-action markup now uses one React-owned portal primitive.
const actionFiles=[];
for(const name of fs.readdirSync(assets).filter(n=>n.endsWith('.js'))){
 const file=assets+'/'+name;let source=fs.readFileSync(file,'utf8');let count=0;
 source=source.replace(/(\w+)\.jsxs\("span",\{className:"dropdown",children:\[(\w+)\.jsx\("button",\{type:"button",className:"btn dropdown-toggle btn-action btn-sm px-1"/g,(all,jsx,child)=>{count++;return `${jsx}.jsxs(NyxActionDropdown,{className:"dropdown",children:[${child}.jsx("button",{type:"button",className:"btn dropdown-toggle btn-action btn-sm px-1"`});
 // Certificate picker actions use the same overlay; language selectors are unchanged.
 if(/index-(BfJf9XXp|kIdPRB5Z)/.test(name))source=source.replace(/(\w+)\.jsxs\("div",\{className:"dropdown",children:/g,(all,jsx)=>{count++;return `${jsx}.jsxs(NyxActionDropdown,{className:"dropdown",children:`});
 if(count){source='import{NyxActionDropdown}from"./index-CTHAIRmi-409dev-4012certfix4-threatpagination3.js";'+source;fs.writeFileSync(file,source);actionFiles.push({name,count})}
}
if(actionFiles.length!==13)throw Error('Legacy action dropdown inventory differs: '+JSON.stringify(actionFiles));
fs.appendFileSync(mainFile,'\n'+fs.readFileSync(inputs+'/action-dropdown.js','utf8'));
// Keep the selected upload and draft in the DOM across pending/failure refreshes.
const vpnFile=assets+'/vpn-client-4014.js';let vpn=fs.readFileSync(vpnFile,'utf8');
vpn=replace(vpn,'detail.innerHTML = adding ? addFormMarkup() : detailMarkup(selectedSite(), preservedTarget);','if (!adding || !detail.querySelector("#nyx-vpn-add-form")) detail.innerHTML = adding ? addFormMarkup() : detailMarkup(selectedSite(), preservedTarget);');
vpn=replace(vpn,'if (busy) panel.querySelectorAll("button,input").forEach(function (element) { element.disabled = true; });','if (busy) panel.querySelectorAll("button,input").forEach(function (element) { element.disabled = true; });\n\t\telse if (adding) panel.querySelectorAll("button,input").forEach(function (element) { element.disabled = false; });');
vpn=replace(vpn,'currentData = { loaded: true, agentAvailable: false, sites: [], summary: {}, error: error.message };','if (adding) { render(panel); if (!quiet) message(panel, error.message, "error"); return null; }\n\t\t\tcurrentData = { loaded: true, agentAvailable: false, sites: [], summary: {}, error: error.message };');
vpn=replace(vpn,'Full-tunnel routes are replaced with the explicit private networks you provide','Full-tunnel profiles are supported without overrides; existing local routes and Manager replies keep their original path');
vpn=replace(vpn,'(required only for full-tunnel profiles)','(optional: restrict a full-tunnel profile)');
fs.writeFileSync(vpnFile,vpn);
// Every application asset gets a release suffix; rewrite all import/preload references.
// This prevents a previous deployment's immutable URLs from serving stale patches.
const names=fs.readdirSync(assets).filter(n=>/\.(js|css)$/.test(n));const assetRevision=createHash('sha256').update(names.sort().map(name=>name+':'+createHash('sha256').update(fs.readFileSync(assets+'/'+name)).digest('hex')).join('\n')).digest('hex').slice(0,12);const renames=new Map(names.map(n=>[n,n.replace(/\.(js|css)$/,'-5013-'+assetRevision+'.$1')]));
for(const name of names){let source=fs.readFileSync(assets+'/'+name,'utf8');for(const [old,next] of renames)source=source.replaceAll(old,next);fs.writeFileSync(assets+'/'+renames.get(name),source);}
for(const [old,next] of renames)html=html.replaceAll(old,next);
fs.writeFileSync(root+'/frontend/index.html',html);
fs.writeFileSync(root+'/frontend/nyxguard-build.json',JSON.stringify({version:'5.0.13',assetRevision,sourceRevision:process.env.NYXGUARD_SOURCE_REVISION||null,assets:Object.fromEntries([...renames.values()].map(name=>[name,createHash('sha256').update(fs.readFileSync(assets+'/'+name)).digest('hex')]))},null,2));
for(const name of names)fs.unlinkSync(assets+'/'+name);
for(const next of renames.values())if(next.endsWith('.js'))execFileSync(process.execPath,['--check',assets+'/'+next]);
console.log('5.0.13 wizard, toolbars, truthful update states and compact lists applied; JavaScript syntax verified');
