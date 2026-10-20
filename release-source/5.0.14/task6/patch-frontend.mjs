import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {parse} from 'acorn';
import {readCatalogs,applyEdits} from '../task2/catalogs.mjs';
const src=path.dirname(new URL(import.meta.url).pathname),front=path.join(process.argv[2],'frontend'),assets=path.join(front,'assets');
const hash=value=>createHash('sha256').update(value).digest('hex'),read=name=>fs.readFileSync(path.join(assets,name),'utf8'),write=(name,value)=>fs.writeFileSync(path.join(assets,name),value);
const prerequisite=JSON.parse(fs.readFileSync(path.join(src,'prerequisites.json'))),manifest=JSON.parse(fs.readFileSync(path.join(front,'nyxguard-build.json')));
assert.equal(manifest.task,5);assert.equal(manifest.task5SourceHash,prerequisite.task5SourceHash);
for(const [name,digest]of Object.entries(prerequisite.assets))assert.equal(hash(read(name)),digest,'Accepted Task 5 asset differs: '+name);
const names=Object.keys(prerequisite.assets),find=prefix=>{const n=names.filter(n=>n.startsWith(prefix)&&n.endsWith('.js'));assert.equal(n.length,1,prefix);return n[0];};
function once(text,from,to){assert.equal(text.split(from).length,2,'Guarded source differs: '+from.slice(0,90));return text.replace(from,to);}
const main=find('index-CTHAIRmi'),settings=find('index-DTnhxNQ_'),theme=find('theme-preferences'),vpn=find('vpn-client-4014');
let s=read(main),ast=parse(s,{ecmaVersion:'latest',sourceType:'module'}),oldPreferences=ast.body.find(n=>n.type==='FunctionDeclaration'&&n.id.name==='jge');assert(oldPreferences);
s=s.slice(0,oldPreferences.start)+s.slice(oldPreferences.end);
s=once(s,'g.jsx(jge,{})','g.jsx("div",{"data-nyx-sidebar-actions":true})');
s=once(s,'let t=window.localStorage.getItem("locale");return t||','let t=window.NyxLanguagePreferences.read();return t||');
s=once(s,'window.localStorage.setItem("locale",e),document.documentElement.lang=e','window.NyxLanguagePreferences.write(e),document.documentElement.lang=e');
s=once(s,'!window.NyxGuardCapabilities.canViewRoute(nyxUser,location.pathname,location.hash)','!(window.NyxGuardCapabilities.canViewRoute(nyxUser,location.pathname,location.hash)||(!!nyxUser&&/^\\/settings\\/?$/.test(location.pathname)))');
ast=parse(s,{ecmaVersion:'latest',sourceType:'module'});
const bindings=()=>ast.body.filter(n=>n.type==='VariableDeclaration').flatMap(n=>n.declarations),ple=bindings().find(n=>n.id.name==='Ple');assert(ple);
s=s.slice(0,ple.init.start)+once(s.slice(ple.init.start,ple.init.end),'section:e.permissionSection','section:e.label==="settings"?undefined:e.permissionSection')+s.slice(ple.init.end);
// Remove exclusively obsolete sidebar class mappings and their private bindings.
ast=parse(s,{ecmaVersion:'latest',sourceType:'module'});
let we=ast.body.filter(n=>n.type==='VariableDeclaration').flatMap(n=>n.declarations).find(n=>n.id.name==='We');assert(we?.init.type==='ObjectExpression');
const removed=we.init.properties.filter(p=>p.key.name?.startsWith('prefs')),obsoleteBindings=new Set(removed.map(p=>p.value.name));assert.equal(removed.length,20);
s=s.slice(0,we.init.start)+'{'+we.init.properties.filter(p=>!removed.includes(p)).map(p=>s.slice(p.start,p.end)).join(',')+'}'+s.slice(we.init.end);
ast=parse(s,{ecmaVersion:'latest',sourceType:'module'});
s=applyEdits(s,ast.body.filter(n=>n.type==='VariableDeclaration'&&n.declarations.some(d=>obsoleteBindings.has(d.id.name))).map(n=>({start:n.start,end:n.end,value:n.kind+' '+n.declarations.filter(d=>!obsoleteBindings.has(d.id.name)).map(d=>s.slice(d.start,d.end)).join(',')+';'})));
// Add only new Task 6 catalog keys; retain every accepted entry verbatim.
const messages=JSON.parse(fs.readFileSync(path.join(src,'messages.json'))),catalogs=readCatalogs(s),edits=[];
for(const lang of ['en','es','fr','de','it','ro']){
 for(const key of Object.keys(messages[lang]))assert(!(key in catalogs.catalogs[lang]),key);
 edits.push({start:catalogs.nodes[lang].end-1,end:catalogs.nodes[lang].end-1,value:','+Object.entries(messages[lang]).map(([k,v])=>JSON.stringify(k)+':'+JSON.stringify(v)).join(',')});
}
s=applyEdits(s,edits)+'\n'+fs.readFileSync(path.join(src,'interface.js'),'utf8');
// Opt this caller into the selector's existing available-height middleware.
// Its default remains unchanged for any other accepted caller.
s=once(s,'maxHeight:y=240})','maxHeight:y=240,fitViewport:nyxFitViewport=false})');
s=once(s,'apply({rects:le,elements:re})','apply({rects:le,elements:re,availableHeight:nyxAvailableHeight})');
s=once(s,'maxHeight:`${y}px`','maxHeight:`${nyxFitViewport?Math.max(0,Math.min(y,nyxAvailableHeight-8)):y}px`');
parse(s,{ecmaVersion:'latest',sourceType:'module'});write(main,s);
let settingSource=read(settings);
settingSource='import {NyxInterfacePreferences,NyxSettingsNavigation} from "./'+main+'";\n'+settingSource;
settingSource=once(settingSource,'function At(){','function At({nyxPersonalOnly=false}){');
settingSource=once(settingSource,'[d,l]=y.useState("backup")','[d,l]=NyxSettingsNavigation(nyxPersonalOnly)');
let settingAst=parse(settingSource,{ecmaVersion:'latest',sourceType:'module'}),tabArray;
function walk(n){if(!n||typeof n!=='object')return;if(n.type==='ObjectExpression'&&n.properties.some(p=>p.key?.value==='data-nyx-module-tabs'))tabArray=n.properties.find(p=>p.key?.name==='children')?.value;for(const[k,v]of Object.entries(n))if(!['start','end'].includes(k)){if(Array.isArray(v))v.forEach(walk);else if(v?.type)walk(v);}}
walk(settingAst);assert.equal(tabArray?.elements.length,6);
const oldTabs=settingSource.slice(tabArray.start+1,tabArray.end-1),interfaceTab='e.jsx("button",{type:"button",className:`${t.tab} ${d==="interface"?t.tabActive:""}`,"aria-pressed":d==="interface","data-nyx-settings-tab":"interface",onClick:()=>l("interface"),children:e.jsx(s,{id:"settings.interface.tab"})})';
settingSource=settingSource.slice(0,tabArray.start)+'[...(!nyxPersonalOnly?['+oldTabs+']:[]),'+interfaceTab+']'+settingSource.slice(tabArray.end);
settingSource=once(settingSource,'d==="lan-access"&&e.jsx(Lt,{})','d==="lan-access"&&e.jsx(Lt,{}),d==="interface"&&e.jsx(NyxInterfacePreferences,{classes:t})');
settingSource=once(settingSource,'const $t=()=>e.jsx(oe,{section:"settings",permission:le,pageLoading:!0,loadingNoLogo:!0,children:e.jsx(At,{})});','const $t=()=>{const{data:user}=NyxCurrentUser("me");return user&&!window.NyxGuardCapabilities.canViewRoute(user,"/settings")?e.jsx(At,{nyxPersonalOnly:true}):e.jsx(oe,{section:"settings",permission:le,pageLoading:!0,loadingNoLogo:!0,children:e.jsx(At,{})})};');
parse(settingSource,{ecmaVersion:'latest',sourceType:'module'});write(settings,settingSource);
// The former Preferences wrapper also hosted legitimate links. Keep their exact
// renderer, controls and styles, moving the mount to the plain footer action slot.
for(const name of names.filter(n=>n.startsWith('local-dev-fixes-')&&n.endsWith('.js'))){let value=read(name);if(value.includes('_prefsDropdown_')){value=value.replaceAll('[class*="_prefsDropdown_"]','[data-nyx-sidebar-actions]');parse(value,{ecmaVersion:'latest',sourceType:'module'});write(name,value);}}
// Preserve the native VPN implementation; synchronize only its tab with the router.
let vpnSource=read(vpn);
vpnSource=once(vpnSource,'if (!/^\\/settings\\/?$/.test(window.location.pathname)) return;','if (!/^\\/settings\\/?$/.test(window.location.pathname)) { vpnActive=false;if(refreshTimer)clearInterval(refreshTimer);refreshTimer=null;return; }');
vpnSource=once(vpnSource,'button.addEventListener("click", function () { activate(card, tabBar, panel, button); });','button.addEventListener("click", function () { window.dispatchEvent(new CustomEvent("nyxguard:settings-tab",{detail:"vpn-client"})); });');
vpnSource=once(vpnSource,'if (vpnActive) activate(card, tabBar, panel, button);','if(new URLSearchParams(location.search).get("tab")==="vpn-client")activate(card,tabBar,panel,button);else if(vpnActive)deactivate(card,panel,button);');
parse(vpnSource,{ecmaVersion:'latest',sourceType:'module'});write(vpn,vpnSource);
write(theme,read(theme)+'\n'+fs.readFileSync(path.join(src,'language-preferences.js'),'utf8').replace('NYX_LANGUAGE_CODES',JSON.stringify(catalogs.options.map(o=>o.code))));
// Delete only the dead accordion selectors; prefs-action-links remains live.
function pruneCSS(css){
 let out='',start=0;
 while(start<css.length){let open=css.indexOf('{',start);if(open<0){out+=css.slice(start);break;}let level=1,at=open+1,quote=null;
  for(;at<css.length&&level;at++){const c=css[at];if(quote){if(c==='\\')at++;else if(c===quote)quote=null;}else if(c==='"'||c==="'")quote=c;else if(c==='{')level++;else if(c==='}')level--;}
  assert.equal(level,0,'CSS braces');const prefix=css.slice(start,open),body=css.slice(open+1,at-1),clean=prefix.replace(/\/\*[\s\S]*?\*\//g,'').trim();
  if(clean.startsWith('@media')||clean.startsWith('@supports')||clean.startsWith('@layer')){const next=pruneCSS(body);out+=prefix+'{'+next+'}';}
  else if(/_prefs[A-Z]/.test(prefix)){const selectors=prefix.split(',').filter(x=>!/_prefs[A-Z]/.test(x));if(selectors.length)out+=selectors.join(',')+'{'+body+'}';}
  else out+=css.slice(start,at);
  start=at;
 }
 return out;
}
let removedCSS=0;for(const name of names.filter(n=>n.endsWith('.css'))){const value=read(name);if(/_prefs[A-Z]/.test(value)){const next=pruneCSS(value);if(next!==value){write(name,next);removedCSS++;}}}
// Reuse native menu declarations under private class aliases. Bootstrap's global
// keydown delegation must not take ownership of this existing floating selector.
function menuAliases(css){
 let out='',start=0;
 while(start<css.length){const open=css.indexOf('{',start);if(open<0)break;let level=1,at=open+1,quote=null;
  for(;at<css.length&&level;at++){const c=css[at];if(quote){if(c==='\\')at++;else if(c===quote)quote=null;}else if(c==='\"'||c==="'")quote=c;else if(c==='{')level++;else if(c==='}')level--;}
  const prefix=css.slice(start,open).replace(/\/\*[\s\S]*?\*\//g,''),body=css.slice(open+1,at-1),clean=prefix.trim();
  if(/^@(media|supports|layer)/.test(clean)){const child=menuAliases(body);if(child)out+=prefix+'{'+child+'}';}
  else if(!clean.startsWith('@')){
   const selectors=[];let begin=0,depth=0,q=null;
   for(let i=0;i<=prefix.length;i++){const c=prefix[i];if(q){if(c==='\\')i++;else if(c===q)q=null;}else if(c==='\"'||c==="'")q=c;else if(c==='('||c==='[')depth++;else if(c===')'||c===']')depth--;else if((c===','&&!depth)||i===prefix.length){const part=prefix.slice(begin,i);if(/\.dropdown-(menu|item)(?![-\w])/.test(part))selectors.push(part.replaceAll(/\.dropdown-menu(?![-\w])/g,'.nyx-interface-options').replaceAll(/\.dropdown-item(?![-\w])/g,'.nyx-interface-option'));begin=i+1;}}
   if(selectors.length)out+=selectors.join(',')+'{'+body+'}';
  }
  start=at;
 }
 return out;
}
const linked=[...fs.readFileSync(path.join(front,'index.html'),'utf8').matchAll(/<link[^>]+href="\/assets\/([^"?]+\.css)(?:[^"]*)"/g)].map(m=>m[1]);
const nativeMenuCSS=linked.map(name=>menuAliases(read(name))).join('\n');assert(nativeMenuCSS.includes('.nyx-interface-options')&&nativeMenuCSS.includes('.nyx-interface-option'));
write('interface.css',nativeMenuCSS+'\n'+fs.readFileSync(path.join(src,'interface.css'),'utf8'));
// Invalidate importers coherently while retaining all accepted layer identities.
const graph=fs.readdirSync(assets).filter(n=>/\.(m?js|css)$/.test(n)).sort(),digest=hash(graph.map(n=>n+'\n'+hash(read(n))).join('\n')),renames=new Map(graph.map(n=>[n,n.replace(/\.(m?js|css)$/,'-task6-'+digest.slice(0,12)+'.$1')]));
for(const [old,next]of renames){let value=read(old);for(const[a,b]of renames)value=value.replaceAll(a,b);if(next.endsWith('.js'))parse(value,{ecmaVersion:'latest',sourceType:'module'});write(next,value);fs.unlinkSync(path.join(assets,old));}
let html=fs.readFileSync(path.join(front,'index.html'),'utf8').replace('</head>','<link rel="stylesheet" href="/assets/interface.css">\n</head>');for(const[a,b]of renames)html=html.replaceAll(a,b);fs.writeFileSync(path.join(front,'index.html'),html);
manifest.task=6;manifest.task6SourceHash=hash(fs.readdirSync(src).filter(n=>fs.statSync(path.join(src,n)).isFile()).sort().map(n=>n+'\n'+hash(fs.readFileSync(path.join(src,n)))).join('\n'));manifest.task6AssetGraphHash=digest;manifest.assets=Object.fromEntries([...renames.values()].sort().map(n=>[n,hash(read(n))]));fs.writeFileSync(path.join(front,'nyxguard-build.json'),JSON.stringify(manifest,null,2));
fs.writeFileSync(path.join(front,'task6-validation.json'),JSON.stringify({nativeSettingsPanels:2,existingTabsPreserved:7,newTab:'interface',obsoleteSidebarClassMappingsRemoved:removed.length,obsoleteCSSFilesPruned:removedCSS,languageCatalogs:6,backendChanged:false,migrationsAdded:false},null,2));console.log('Task 6 guarded frontend patched; JavaScript parsed and native Settings classes reused');
