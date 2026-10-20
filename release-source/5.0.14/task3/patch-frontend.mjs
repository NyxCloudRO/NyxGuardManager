import fs from 'node:fs';
import path from 'node:path';
import {createHash}from'node:crypto';
import {execFileSync}from'node:child_process';
import {parse}from'acorn';
import {removeLegacyHelp}from'./remove-help.mjs';
import {readCatalogs,applyEdits,walk,languages}from'../task2/catalogs.mjs';
import {validate}from'../task2/validate.mjs';
const root=process.argv[2],input=path.dirname(new URL(import.meta.url).pathname),frontend=path.join(root,'frontend'),assets=path.join(frontend,'assets');
const hash=s=>createHash('sha256').update(s).digest('hex');
const manifest=JSON.parse(fs.readFileSync(path.join(frontend,'nyxguard-build.json'),'utf8'));
if(manifest.task!==2||manifest.localizationSourceHash!=='4926ee5e432da043e995279fc3e78311087cae5803b74d7cbf4cf15f97e54a84')throw Error('Accepted Task 2 source digest differs');
for(const[name,checksum]of Object.entries(manifest.assets))if(hash(fs.readFileSync(path.join(assets,name)))!==checksum)throw Error('Accepted asset differs: '+name);
const names=fs.readdirSync(assets),find=prefix=>{const n=names.filter(n=>n.startsWith(prefix)&&n.endsWith('.js'));if(n.length!==1)throw Error('Ambiguous module '+prefix);return n[0];};
const mainName=find('index-CTHAIRmi-409dev'),mainPath=path.join(assets,mainName);
function replaceOnce(s,old,next){if(s.split(old).length!==2)throw Error('Prerequisite differs: '+old.slice(0,180));return s.replace(old,next);}
let main=fs.readFileSync(mainPath,'utf8');
const catalogs=readCatalogs(main),messages=JSON.parse(fs.readFileSync(path.join(input,'messages.json'),'utf8')),effective={};
const edits=languages.map(l=>{const values={...catalogs.catalogs[l],...messages[l]};effective[l]={...catalogs.shared,...values};return {start:catalogs.nodes[l].start,end:catalogs.nodes[l].end,value:JSON.stringify(values)};});
if(validate(effective).length)throw Error('Invalid Task 3 catalogs');main=applyEdits(main,edits);
main=replaceOnce(main,'{to:"/access",icon:zm,label:"access-lists",permissionSection:aV,permission:hc},{to:"/certificates",icon:wp,label:"certificates",permissionSection:nV,permission:hc},{to:"/users",icon:Dx,label:"users",permissionSection:"users",permission:hc}','{to:"/identity",icon:zm,label:"identity-access"}');
main=replaceOnce(main,'Ple=(e,t)=>{','Ple=(e,t)=>{if(e.label==="identity-access")return g.jsx(NyxIdentityNav,{onClick:t},"identity-access");');
for(const [route,component,key]of [['/access','rhe','policy'],['/certificates','ahe','certificate'],['/users','she','user']])main=replaceOnce(main,`path:${JSON.stringify(route)},element:g.jsx(${component},{})`,`path:${JSON.stringify(route)},element:g.jsx(NyxIdentity,{active:${JSON.stringify(key)}})`);
main=replaceOnce(main,'path:"/certificates",element:','path:"/identity",element:g.jsx(NyxIdentity,{})}),g.jsx(fn,{path:"/certificates",element:');
let identity=fs.readFileSync(path.join(input,'identity.js'),'utf8');
main='import {A as NyxIdentityPage} from '+JSON.stringify('./'+find('AppPage-CHaZeb42-'))+';\n'+main;
for(const name of ['Iee','Lb']){
 const ast=parse(main,{ecmaVersion:'latest',sourceType:'module'}),fn=ast.body.find(n=>n.type==='FunctionDeclaration'&&n.id.name===name);
 const source=main.slice(fn.start,fn.end),next=replaceOnce(source,'className:"react-select-container",classNamePrefix:','inputId:n,className:"react-select-container",classNamePrefix:');main=main.slice(0,fn.start)+next+main.slice(fn.end);
}
for(const [name,cls]of [['Cee','nyx-policy-authorizations'],['SX','nyx-policy-rules']]){
 const ast=parse(main,{ecmaVersion:'latest',sourceType:'module'}),fn=ast.body.find(n=>n.type==='FunctionDeclaration'&&n.id.name===name);if(!fn)throw Error('Policy form owner differs');
 const source=main.slice(fn.start,fn.end);let next=replaceOnce(source,'return g.jsxs(g.Fragment,{children:','return g.jsxs("div",{className:'+JSON.stringify(cls)+',children:');if(name==='SX')next=replaceOnce(next,'className:"row mb-1"','className:"row mb-1 nyx-policy-rule"');main=main.slice(0,fn.start)+next+main.slice(fn.end);
}
// The inherited certificate Details clone used an audit-log hook and renderer.
// Keep its native modal/permission boundary, fetch the certificate, and show safe fields only.
{
 const ast=parse(main,{ecmaVersion:'latest',sourceType:'module'});let details;
 walk(ast,node=>{if(node.type==='VariableDeclarator'&&node.id.name==='NyxCertificateDetails')details=node.init;});
 if(!details||!main.slice(details.start,details.end).includes('=aee(e)'))throw Error('Certificate details prerequisite differs');
 const next=`$t.create(({id,visible,remove})=>{
  const{data:certificate,isLoading,error}=iee(id);
  const expiry=certificate?.expiresOn??certificate?.expires_on;
  const date=expiry&&Number.isFinite(new Date(expiry).getTime())?new Intl.DateTimeFormat(window.NyxI18n.locale,{dateStyle:"medium",timeStyle:"short"}).format(new Date(expiry)):"—";
  const fields=certificate?[
   ["column.name",certificate.niceName??certificate.nice_name??"—"],
   ["column.provider",certificate.provider==="other"?window.NyxI18n.message("certificates.custom"):certificate.provider==="letsencrypt"?window.NyxI18n.message("lets-encrypt"):certificate.provider],
   ["domain-names",(certificate.domainNames??certificate.domain_names??[]).join(", ")||"—"],
   ["column.expires",date]
  ]:[];
  return g.jsxs(NyxManagementModal,{kind:"certificate-details",busy:false,show:visible,onHide:remove,children:[
   g.jsx(Ve.Header,{closeButton:true,children:g.jsx(Ve.Title,{children:g.jsx(K,{id:"action.view-details"})})}),
   g.jsxs(Ve.Body,{children:[isLoading&&g.jsx(wi,{noLogo:true}),error&&g.jsx(vn,{variant:"danger",children:error.message||window.NyxI18n.message("ui.27c2ccd962c2b8dc")}),certificate&&g.jsx("dl",{className:"row gy-3 mb-0",children:fields.map(([label,value])=>g.jsxs(g.Fragment,{children:[g.jsx("dt",{className:"col-sm-4",children:g.jsx(K,{id:label})}),g.jsx("dd",{className:"col-sm-8 mb-0",style:{overflowWrap:"anywhere"},children:value})]},label))})]}),
   g.jsx(Ve.Footer,{children:g.jsx(wt,{onClick:remove,children:g.jsx(K,{id:"action.close"})})})
  ]});
 })`;
 main=main.slice(0,details.start)+next+main.slice(details.end);
}
// Reuse each native select while sharing only the scoped dialog presentation.
{
 const ast=parse(main,{ecmaVersion:'latest',sourceType:'module'}),edits=[],owners=new Set();
 walk(ast,(node,anc)=>{
  if(node.type!=='CallExpression'||node.callee.type!=='MemberExpression'||node.arguments[1]?.type!=='ObjectExpression')return;
  if(!node.arguments[1].properties.some(p=>p.key?.name==='className'&&p.value.value==='react-select-container'))return;
  const owner=anc.findLast(a=>a.type==='FunctionDeclaration')?.id?.name;
  if(!['Iee','QB','Gc','Lb'].includes(owner))return;
  owners.add(owner);const component=main.slice(node.arguments[0].start,node.arguments[0].end);
  edits.push({start:node.arguments[0].start,end:node.arguments[0].end,value:'NyxManagementSelect'});
  edits.push({start:node.arguments[1].start+1,end:node.arguments[1].start+1,value:'component:'+component+','});
 });
 if(owners.size!==4||edits.length!==8)throw Error('Management select owners differ');
 main=applyEdits(main,edits);
}
main+='\n'+identity;
fs.writeFileSync(mainPath,main);
// AST-selected presentation edits. Preserve list mutations, table renderers and native permission guards.
const modules=[['index-C40Q8nCD-','G','policy','a','l','e','E','G'],['index-BfJf9XXp-4012','Fa','certificate','c','d','l','Hr','Fa'],['index-K4lT3P_L-','he','user','d','p','e','B','he'],['index-Dd_E7hOB-','te','proxy','o','a','e',null,null]];
const inventoryEdits=[];
for(const[prefix,functionName,kind,records,filtered,jsx,shell,inner]of modules){
 const name=find(prefix),file=path.join(assets,name);let s=fs.readFileSync(file,'utf8');
 const ast=parse(s,{ecmaVersion:'latest',sourceType:'module'}),fn=ast.body.find(n=>n.type==='FunctionDeclaration'&&n.id.name===functionName);if(!fn)throw Error('Missing inventory owner');
 const changes=[];
 const firstIf=fn.body.body.find(n=>n.type==='IfStatement');changes.push({start:firstIf.start,end:firstIf.start,value:`const nyxInventory=useNyxInventory(${JSON.stringify(kind)},${records});`});
 const filterDecl=fn.body.body.find(n=>n.type==='VariableDeclaration'&&n.declarations.some(d=>d.id.name===filtered));const ret=fn.body.body.find(n=>n.type==='ReturnStatement');
 if(!filterDecl||ret.argument.type!=='SequenceExpression')throw Error('Inventory filter prerequisite differs '+kind);
 const oldFilter=ret.argument.expressions[0];changes.push({start:filterDecl.start,end:filterDecl.end,value:`const ${filtered}=nyxInventory.rows;`});changes.push({start:oldFilter.start,end:oldFilter.end,value:'void 0'});
 let headerFound=0,searchFound=0;
 walk(fn,(node,anc)=>{
  if(node.type==='Property'&&(node.key.name??node.key.value)==='id'&&node.value.value==='advanced-table-search'){
   const inputCall=anc.at(-2),inputGroup=anc.slice(0,-2).reverse().find(a=>a.type==='CallExpression'&&a.arguments[1]?.type==='ObjectExpression'&&a.arguments[1].properties.some(p=>p.key?.name==='className'&&p.value.value==='input-group input-group-flat w-auto'));
   if(!inputCall||!inputGroup)throw Error('Search wrapper differs');changes.push({start:inputGroup.start,end:inputGroup.end,value:'null'});searchFound++;
  }
  if(node.type==='Property'&&node.key.name==='className'&&node.value.value==='nyx-dashboard-header'){
   const call=anc.at(-2);if(call.type!=='CallExpression')throw Error('Header call differs');changes.push({start:call.end,end:call.end,value:',nyxInventory.toolbar'});headerFound++;
  }
  if(node.type==='Property'&&node.key.name==='className'&&node.value.value==='nyx-dashboard-stats'){
   const call=anc.at(-2);changes.push({start:call.start,end:call.end,value:'null'});return;
  }
  if(node.type==='Property'&&node.key.name==='isFiltered')changes.push({start:node.value.start,end:node.value.end,value:'nyxInventory.active'});
 });
 if(headerFound!==1||searchFound!==1)throw Error('Inventory structure differs '+kind);
 s=applyEdits(s,changes);
 if(shell)s=replaceOnce(s,`children:${jsx}.jsx(${shell},{framed:!0,children:${jsx}.jsx(${inner},{})})`,`children:${jsx}.jsx(${inner},{})`);
 // Retain an add action even for an empty inventory.
 if(kind==='user'){s=replaceOnce(s,'className:"nyx-dashboard"','className:"nyx-dashboard nyx-identity-accounts"');s=replaceOnce(s,'d?.length?e.jsx("div",{className:"nyx-dashboard-actions"','true?e.jsx("div",{className:"nyx-dashboard-actions"');}
 if(kind==='proxy')s=replaceOnce(s,'children:o?.length?e.jsx(y,{size:"sm",className:"btn-lime"','children:true?e.jsx(y,{size:"sm",className:"btn-lime"');
 s='import {useNyxInventory} from "./identity-toolbar.js";\n'+s;parse(s,{ecmaVersion:'latest',sourceType:'module'});fs.writeFileSync(file,s);inventoryEdits.push({name,kind});
}
// Register the new entry in the established SVG enhancement registry.
const sidebarFile=path.join(assets,find('local-dev-fixes-409dev-'));
fs.writeFileSync(sidebarFile,replaceOnce(fs.readFileSync(sidebarFile,'utf8'),'function enhanceSidebarIcons() {','sidebarIcons["identity-access"] = sidebarSvg(\'<rect x="8" y="8.5" width="16" height="15" rx="2.5" stroke="__G__" stroke-width="1.6"/><circle cx="13.3" cy="13.4" r="2.2" stroke="__G__" stroke-width="1.5"/><path d="M9.9 20v-.7a3.4 3.4 0 0 1 6.8 0v.7M18.2 13h3.2M18.2 15.5h2.1" stroke="__G__" stroke-width="1.5" stroke-linecap="round"/><path d="m18.2 19.2 1.6 1.6 3.3-3.5" stroke="__G__" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>\', "identity");\n\tfunction enhanceSidebarIcons() {'));
// Settings retains its native controls, state and content; only shared navigation metadata changes.
{
 const file=path.join(assets,find('index-DTnhxNQ_-'));let source=fs.readFileSync(file,'utf8');const ast=parse(source,{ecmaVersion:'latest',sourceType:'module'}),edits=[];let bars=0,tabs=0;
 walk(ast,(node,anc)=>{
  if(node.type==='Property'&&node.key.name==='className'&&node.value.type==='MemberExpression'&&node.value.property.name==='card'&&anc.some(n=>n.type==='FunctionDeclaration'&&n.id?.name==='At'))edits.push({start:node.end,end:node.end,value:',"data-nyx-settings-page":true'});
  if(node.type==='Property'&&node.key.name==='id'&&node.value.type==='Literal'&&/^settings\.(backup|notifications|integrations|sso|grafana|lan)\.subtitle$/.test(node.value.value)){
   const paragraph=[...anc].reverse().find(n=>n.type==='CallExpression'&&n.arguments[0]?.value==='p'),props=paragraph?.arguments[1];
   if(props?.type==='ObjectExpression')edits.push({start:props.start+1,end:props.start+1,value:'"data-nyx-settings-intro":true,'});
  }
  if(node.type!=='Property'||node.key.name!=='className')return;
  if(node.value.type==='MemberExpression'&&node.value.property.name==='tabBar'){
   edits.push({start:node.end,end:node.end,value:',"data-nyx-module-tabs":true,onKeyDown:NyxModuleTabKeys'});bars++;
  }
  if(node.value.type==='TemplateLiteral'&&node.value.expressions[0]?.type==='MemberExpression'&&node.value.expressions[0].property.name==='tab'){
   const conditional=node.value.expressions.find(e=>e.type==='ConditionalExpression');if(!conditional)throw Error('Settings tab state differs');
   edits.push({start:node.end,end:node.end,value:',"aria-pressed":'+source.slice(conditional.test.start,conditional.test.end)});tabs++;
  }
 });
 if(bars!==1||tabs!==6)throw Error('Settings tab structure differs '+bars+' '+tabs);
 source=applyEdits(source,edits);source='import {NyxModuleTabKeys} from '+JSON.stringify('./'+mainName)+';\n'+source;fs.writeFileSync(file,source);
}
// Integrate the existing imperative VPN tab's active state with the shared bar.
{
 const file=path.join(assets,find('vpn-client-4014-'));let source=fs.readFileSync(file,'utf8');
 source=replaceOnce(source,'button.classList.add("nyx-vpn-tab-active");','button.classList.add("nyx-vpn-tab-active");button.setAttribute("aria-pressed","true");tabBar.querySelectorAll("button:not(.nyx-vpn-tab)[aria-pressed=true]").forEach(function(tab){tab.dataset.nyxTask3Active="1";tab.setAttribute("aria-pressed","false")});');
 source=replaceOnce(source,'button.classList.remove("nyx-vpn-tab-active");','button.classList.remove("nyx-vpn-tab-active");button.setAttribute("aria-pressed","false");card.querySelectorAll("[data-nyx-task3-active]").forEach(function(tab){tab.setAttribute("aria-pressed","true");delete tab.dataset.nyxTask3Active});');
 source=replaceOnce(source,'button.classList.add("nyx-vpn-tab");','button.classList.add("nyx-vpn-tab");button.setAttribute("aria-pressed","false");');fs.writeFileSync(file,source);
}
// Remove the retired native and legacy Help controls, rather than masking them.
const helpCleanup=[];
for(const name of fs.readdirSync(assets).filter(n=>n.endsWith('.js'))){
 const file=path.join(assets,name),source=fs.readFileSync(file,'utf8');if(source.length>150000)continue;
 const result=removeLegacyHelp(source);if(result.removed.length){fs.writeFileSync(file,result.source);helpCleanup.push({name,removed:result.removed,unusedImports:result.unusedImports});}
}
// These selectors belong exclusively to the now-removed contextual Help controls.
let helpStyleRulesRemoved=0;
for(const name of fs.readdirSync(assets).filter(n=>n.endsWith('.css'))){const file=path.join(assets,name),source=fs.readFileSync(file,'utf8'),next=source.replace(/[^{}]*\.nyx-help-pill[^{}]*\{[^{}]*\}/g,()=>{helpStyleRulesRemoved++;return ''});if(next!==source)fs.writeFileSync(file,next);}
if(helpCleanup.reduce((n,r)=>n+r.removed.length,0)<3)throw Error('Expected contextual Help controls were not removed');
// Remove conflicting fixed wizard heights at their original definitions.
let modalHeightRulesCleaned=0;
for(const name of fs.readdirSync(assets).filter(n=>n.endsWith('.css'))){const file=path.join(assets,name),source=fs.readFileSync(file,'utf8'),next=source.replace(/([^{}]+)\{([^{}]*)\}/g,(rule,selector,body)=>{
 if(!/(?:nyx-proxy-wizard|nyx-management-access-list)/.test(selector)||!/(?:\.modal-content|(?:^|[ >])form)\s*$/.test(selector))return rule;
 const clean=body.replace(/(^|;)\s*height\s*:[^;}]+;?/g,'$1');if(clean!==body)modalHeightRulesCleaned++;return clean.trim()?selector+'{'+clean+'}':'';
});if(next!==source)fs.writeFileSync(file,next);}
// Remove the duplicated legacy certificate width/nowrap guards at their source.
// The native auto table can then share available space and wrap the date at its space.
let certificateWidthRulesCleaned=0;
for(const name of fs.readdirSync(assets).filter(n=>n.endsWith('.css'))){const file=path.join(assets,name),source=fs.readFileSync(file,'utf8'),next=source.replace(/([^{}]+)\{([^{}]*)\}/g,(rule,selector,body)=>{
 if(selector.replace(/\/\*[\s\S]*?\*\//g,'').trim()!=='html[data-app-theme] .nyx-cert-expiry-cell')return rule;
 const clean=body.split(';').filter(declaration=>!/^\s*(?:width|min-width|max-width|white-space|overflow|text-overflow)\s*:/.test(declaration)).join(';');
 if(clean!==body)certificateWidthRulesCleaned++;return selector+'{'+clean+'}';
});if(next!==source)fs.writeFileSync(file,next);}
if(!certificateWidthRulesCleaned)throw Error('Expected legacy certificate width guard was not found');
for(const name of ['inventory.mjs','identity.css','modal-sizing.js','modal-layout.css'])fs.copyFileSync(path.join(input,name),path.join(assets,name==='inventory.mjs'?'inventory.js':name));
fs.writeFileSync(path.join(assets,'identity-toolbar.js'),fs.readFileSync(path.join(input,'toolbar.js'),'utf8').replace('NYX_MAIN',mainName).replace('./inventory.mjs','./inventory.js'));
// Version the complete asset graph together: rewritten imports must never reuse a cached filename.
const graphInputs=fs.readdirSync(assets).filter(n=>/\.(m?js|css)$/.test(n)).sort();
const assetGraphHash=hash(graphInputs.map(name=>name+'\n'+hash(fs.readFileSync(path.join(assets,name)))).join('\n'));
const changed=new Map(graphInputs.map(name=>[name,name.replace(/\.(m?js|css)$/,'-task3-'+assetGraphHash.slice(0,12)+'.$1')]));
for(const[name,next]of changed){let s=fs.readFileSync(path.join(assets,name),'utf8');for(const[old,nextName]of changed)s=s.replaceAll(old,nextName);fs.writeFileSync(path.join(assets,next),s);fs.unlinkSync(path.join(assets,name));}
let html=fs.readFileSync(path.join(frontend,'index.html'),'utf8').replace('</head>','<link rel="stylesheet" href="/assets/identity.css">\n<link rel="stylesheet" href="/assets/modal-layout.css">\n<script type="module" src="/assets/modal-sizing.js"></script>\n</head>');for(const[old,next]of changed)html=html.replaceAll(old,next);fs.writeFileSync(path.join(frontend,'index.html'),html);
for(const name of changed.values())if(/\.m?js$/.test(name))execFileSync(process.execPath,['--check',path.join(assets,name)]);
manifest.task=3;manifest.task3AssetGraphHash=assetGraphHash;manifest.task2LocalizationSourceHash=manifest.localizationSourceHash;manifest.task3SourceHash=hash(['identity.js','identity.css','inventory.mjs','toolbar.js','messages.json','patch-frontend.mjs','remove-help.mjs','modal-sizing.js','modal-layout.css'].map(n=>n+'\n'+fs.readFileSync(path.join(input,n),'utf8')).join('\n'));manifest.assets=Object.fromEntries([...changed.values()].sort().map(n=>[n,hash(fs.readFileSync(path.join(assets,n)))]));manifest.identityRoutes=['/identity','/access','/certificates','/users'];
fs.writeFileSync(path.join(frontend,'nyxguard-build.json'),JSON.stringify(manifest,null,2));fs.writeFileSync(path.join(frontend,'task3-validation.json'),JSON.stringify({catalogErrors:validate(effective),inventoryEdits,helpCleanup,helpStyleRulesRemoved,modalHeightRulesCleaned,certificateWidthRulesCleaned,independentPermissions:true,backendChanged:false},null,2));
console.log(JSON.stringify({result:'PASS',sourceHash:manifest.task3SourceHash,modules:inventoryEdits.length}));
