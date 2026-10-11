import fs from 'node:fs';
const root=process.argv[2]||'/app';
const file=root+'/frontend/assets/index-C8uhQqRV.js';
let source=fs.readFileSync(file,'utf8');
function replace(old,next){
 if(source.split(old).length!==2)throw Error('Applications prerequisite differs: '+old.slice(0,80));
 source=source.replace(old,next);
}
replace('className:s.page,children:', 'className:s.page+" nyx-protected-apps",children:');
replace('p.isLoading?n.jsx("div",{className:s.emptyState,', 'p.isLoading?n.jsx("div",{role:"status",className:s.emptyState,');
replace('p.isError?n.jsx("div",{className:s.emptyState,', 'p.isError?n.jsx("div",{role:"alert",className:s.emptyState,');
// Retain the backend state until mutation and query invalidation complete.
const start=source.indexOf(',onMutate:a=>');
const end=source.indexOf(',onSuccess:',start);
if(start<0||end<0)throw Error('Applications mutation prerequisite differs');
source=source.slice(0,start)+source.slice(end);
replace('n.jsx("span",{className:s.name,children:r})',
 'n.jsxs("div",{className:"nyx-app-identity",children:[n.jsx("span",{className:s.name,title:r,children:r}),n.jsx("div",{className:"nyx-app-domains",children:(a.domains??[]).map(domain=>n.jsx("span",{children:domain},domain))})]})');
replace('className:s.actions,children:', 'className:s.actions,role:"group","aria-label":"Security controls for "+r,children:');
replace('disabled:d.isPending,onClick:()=>d.mutate({id:a.id,wafEnabled:!e})',
 'disabled:d.isPending||!i.data,"aria-pressed":e,onClick:()=>{if(!e||window.confirm("Disable WAF for "+r+"? This removes its WAF protection."))d.mutate({id:a.id,wafEnabled:!e})}');
for(const [field,local,effective,feature] of [
 ['botDefenseEnabled','c','e&&o&&c','Bot Defence'],
 ['ddosEnabled','f','e&&_&&f','DDoS protection'],
 ['sqliEnabled','y','e&&h&&y','SQL Shield'],
 ['authBypassEnabled','b','e&&M&&b','Auth Bypass']
]){
 const old=`onClick:()=>d.mutate({id:a.id,wafEnabled:!0,${field}:!${local}})`;
 const condition=field==='authBypassEnabled'?local:'!'+local;
 const message=field==='authBypassEnabled'?'Enable Auth Bypass for ':'Disable '+feature+' for ';
 replace(old,`"aria-pressed":${effective},onClick:()=>{if(${condition}||window.confirm(${JSON.stringify(message)}+r+"? This changes the protection applied to its traffic."))d.mutate({id:a.id,wafEnabled:!0,${field}:!${local}})}`);
}
if(source.split('disabled:!e||d.isPending').length!==5)throw Error('Applications feature prerequisites differ');
source=source.replaceAll('disabled:!e||d.isPending','disabled:!e||d.isPending||!i.data');
replace('d.isError?n.jsx("div",{className:"text-danger mt-3",', 'd.isError||i.isError?n.jsx("div",{role:"alert",className:"text-danger mt-3",');
replace('children:n.jsx(g,{id:"nyxguard.apps.error.update-failed"})', 'children:n.jsx(g,{id:i.isError?"nyxguard.apps.load-error":"nyxguard.apps.error.update-failed"})');
fs.writeFileSync(file,source);
const html=root+'/frontend/index.html';
const text=fs.readFileSync(html,'utf8');
if(text.includes('/assets/protected-apps.css'))throw Error('Applications stylesheet already applied');
fs.writeFileSync(html,text.replace('</head>','<link rel="stylesheet" href="/assets/protected-apps.css">\n</head>'));
console.log('Applications density and confirmed-state controls applied');
