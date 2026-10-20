import fs from 'node:fs';import path from 'node:path';import {createHash}from'node:crypto';import {execFileSync}from'node:child_process';
import {parse}from'acorn';import {readCatalogs,applyEdits,walk,languages}from'../task2/catalogs.mjs';import {validate}from'../task2/validate.mjs';
const root=process.argv[2],src=path.dirname(new URL(import.meta.url).pathname),front=path.join(root,'frontend'),assets=path.join(front,'assets'),hash=b=>createHash('sha256').update(b).digest('hex');
const manifest=JSON.parse(fs.readFileSync(path.join(front,'nyxguard-build.json')));
if(manifest.task!==3||manifest.task3SourceHash!=='7faf8381409272edaa9dd841a0ee346d5f38059b49191415600ad87eaf484f07')throw Error('Accepted Task 3 prerequisite differs');
for(const[n,h]of Object.entries(manifest.assets))if(hash(fs.readFileSync(path.join(assets,n)))!==h)throw Error('Accepted asset differs: '+n);
const names=fs.readdirSync(assets),find=p=>{const n=names.filter(n=>n.startsWith(p)&&n.endsWith('.js')&&n.includes('task3'));if(n.length!==1)throw Error('Ambiguous module '+p);return n[0];};
const main=find('index-CTHAIRmi-409dev'),confirmation=find('confirmation-dialog-'),rules=find('index-DHuZiE1T-task2-');
let source=fs.readFileSync(path.join(assets,main),'utf8'),catalogs=readCatalogs(source),messages=JSON.parse(fs.readFileSync(path.join(src,'messages.json'))),effective={};
source=applyEdits(source,languages.map(l=>{if(!messages[l])throw Error('Missing language '+l);const values={...catalogs.catalogs[l],...messages[l]};effective[l]={...catalogs.shared,...values};return {start:catalogs.nodes[l].start,end:catalogs.nodes[l].end,value:JSON.stringify(values)};}));
if(validate(effective).length)throw Error('Invalid Task 4 catalogs');fs.writeFileSync(path.join(assets,main),source);
function once(s,a,b){if(s.split(a).length!==2)throw Error('Prerequisite differs '+a);return s.replace(a,b);}
source=fs.readFileSync(path.join(assets,rules),'utf8');source=once(source,'re=y==="country"?"country":"ip"','re=y==="blocked"?"blocked":y==="country"?"country":"ip"');source=once(source,'y!=="ip"&&y!=="country"||k(y)','y!=="ip"&&y!=="country"&&y!=="blocked"||k(y)');
const ast=parse(source,{ecmaVersion:'latest',sourceType:'module'}),edits=[];let hidden=0,nav=0,context=0,queries=0;
walk(ast,(node,anc)=>{
 if(node.type==='CallExpression'&&node.callee.name==='Y'&&node.arguments[0]?.type==='ObjectExpression'&&source.slice(node.start,node.end).includes('queryKey:["nyxguard","rules"')){edits.push({start:node.arguments[0].start+1,end:node.arguments[0].start+1,value:'enabled:d!=="blocked",'});queries++;}
 if(node.type==='Property'&&node.key.name==='className'&&node.value.type==='ConditionalExpression'&&source.slice(node.value.start,node.value.end).includes('j===')){
  const test=source.slice(node.value.test.start,node.value.test.end);if(test==='j==="allow"'||test==='j==="deny"')edits.push({start:node.end,end:node.end,value:',"aria-pressed":'+test});
 }
 if(node.type==='Property'&&node.key.name==='className'&&typeof node.value.value==='string'&&node.value.value.split(' ').includes('text-nowrap')){
  const call=anc.at(-2),cell=source.slice(call.start,call.end);if(call.arguments?.[0]?.value==='td'&&(cell.includes('children:t.ipCidr')||cell.includes('children:t.countryCode')||cell.includes('new Date(t.expiresOn)')))edits.push({start:node.value.start,end:node.value.end,value:JSON.stringify(node.value.value.replace('text-nowrap','nyx-rule-wrappable'))});
 }
 if(node.type!=='Property'||node.key.name!=='className'||node.value.type!=='MemberExpression'||node.value.object.name!=='r')return;
 const key=node.value.property.name;
 if(['builderCard','rulesList'].includes(key)){edits.push({start:node.end,end:node.end,value:',hidden:d==="blocked"'+(key==='builderCard'?',"data-task4-rule-builder":true':'')});hidden++;}
 if(key==='builderCard'){
  const call=anc.at(-2);edits.push({start:call.start,end:call.start,value:'e.jsx(BlockedTabs,{active:d,onChange:(type)=>{setEditing(null);k(type);L(t=>{const next=new URLSearchParams(t);next.set("type",type);return next;});}}),e.jsx(BlockedRequests,{active:d==="blocked"}),'});nav++;
 }
 if(key==='segmentedRow'){
  const call=anc.at(-2),s=source.slice(call.start,call.end);if(!s.includes('nyxguard.rules.ip-range'))return;
  edits.push({start:call.start,end:call.end,value:'e.jsx("div",{className:"nyx-rule-type-context",style:{minHeight:36,alignItems:"center"},children:e.jsx(s,{id:d==="country"?"nyxguard.rules.country":"nyxguard.rules.ip-range"})})'});context++;
 }
});
if(hidden!==2||nav!==1||context!==1||queries!==2)throw Error('Traffic Rules structure differs '+JSON.stringify({hidden,nav,context,queries}));
source='import {BlockedTabs,BlockedRequests} from "./blocked-view.js";\n'+applyEdits(source,edits);parse(source,{ecmaVersion:'latest',sourceType:'module'});fs.writeFileSync(path.join(assets,rules),source);
// The existing dialog retains its default error; this operation supplies history-specific text.
{
 const file=path.join(assets,confirmation);let c=fs.readFileSync(file,'utf8');
 c=once(c,"error:'The change could not be saved.","error:operation.errorMessage||'The change could not be saved.");fs.writeFileSync(file,c);
}
// Keep the established audit renderer; localize only the new administrative event.
{
 const file=path.join(assets,find('index-DJfFx4nu-'));let event=fs.readFileSync(file,'utf8');
 event=once(event,'function nyxEventLabel(value){','function nyxEventLabel(value){if(value==="blocked_requests_cleared")return window.NyxI18n.message("blocked.history-deleted");');
 event=once(event,'function nyxEventTarget(e){','function nyxEventTarget(e){if(e.action==="blocked_requests_cleared")return window.NyxI18n.message("blocked.title");');fs.writeFileSync(file,event);
}
// Remove the superseded 29px-button alignment offset in the original scoped rule.
for(const name of fs.readdirSync(assets).filter(n=>n.endsWith('.css'))){const file=path.join(assets,name),s=fs.readFileSync(file,'utf8');if(s.includes('._actions_1qmfz_103{padding-top:24.5px;justify-content:flex-end}'))fs.writeFileSync(file,s.replace('._actions_1qmfz_103{padding-top:24.5px;justify-content:flex-end}','._actions_1qmfz_103{padding-top:21px;justify-content:flex-end}'));}
fs.writeFileSync(path.join(assets,'blocked-view.js'),fs.readFileSync(path.join(src,'blocked-view.js'),'utf8').replace('NYX_MAIN',main).replace('NYX_CONFIRM',confirmation));fs.copyFileSync(path.join(src,'blocked.css'),path.join(assets,'blocked.css'));
const graph=fs.readdirSync(assets).filter(n=>/\.(m?js|css)$/.test(n)).sort(),digest=hash(graph.map(n=>n+'\n'+hash(fs.readFileSync(path.join(assets,n)))).join('\n'));
const changed=new Map(graph.map(n=>[n,n.replace(/\.(m?js|css)$/,'-task4-'+digest.slice(0,12)+'.$1')]));
for(const[n,next]of changed){let s=fs.readFileSync(path.join(assets,n),'utf8');for(const[old,newName]of changed)s=s.replaceAll(old,newName);fs.writeFileSync(path.join(assets,next),s);fs.unlinkSync(path.join(assets,n));}
let html=fs.readFileSync(path.join(front,'index.html'),'utf8').replace('</head>','<link rel="stylesheet" href="/assets/blocked.css">\n</head>');for(const[old,next]of changed)html=html.replaceAll(old,next);fs.writeFileSync(path.join(front,'index.html'),html);
for(const n of changed.values())if(/\.m?js$/.test(n))execFileSync(process.execPath,['--check',path.join(assets,n)]);
manifest.task=4;manifest.task4SourceHash=hash(fs.readdirSync(src).filter(n=>fs.statSync(path.join(src,n)).isFile()).sort().map(n=>n+'\n'+hash(fs.readFileSync(path.join(src,n)))).join('\n'));manifest.task4AssetGraphHash=digest;manifest.assets=Object.fromEntries([...changed.values()].sort().map(n=>[n,hash(fs.readFileSync(path.join(assets,n)))]));
fs.writeFileSync(path.join(front,'nyxguard-build.json'),JSON.stringify(manifest,null,2));fs.writeFileSync(path.join(front,'task4-validation.json'),JSON.stringify({catalogErrors:validate(effective),hidden,nav,context,queries},null,2));console.log('Task 4 frontend patched; catalogs and JavaScript validated');
