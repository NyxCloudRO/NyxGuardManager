import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {parse} from 'acorn';
const src=path.dirname(new URL(import.meta.url).pathname),front=path.join(process.argv[2],'frontend'),assets=path.join(front,'assets');
const hash=s=>createHash('sha256').update(s).digest('hex'),read=n=>fs.readFileSync(path.join(assets,n),'utf8');
const prerequisite=JSON.parse(fs.readFileSync(path.join(src,'prerequisites.json'))),manifest=JSON.parse(fs.readFileSync(path.join(front,'nyxguard-build.json')));
if(manifest.task!==4||manifest.task4SourceHash!==prerequisite.task4SourceHash)throw Error('Accepted Task 4 prerequisite differs');
for(const [n,h]of Object.entries(prerequisite.assets))if(hash(fs.readFileSync(path.join(assets,n)))!==h)throw Error('Accepted asset differs: '+n);
const registry=JSON.parse(fs.readFileSync(path.join(src,'action-registry.json'))),group=new Map();
for(const r of registry.filter(r=>r.variant)){if(!group.has(r.file))group.set(r.file,[]);group.get(r.file).push(r);}
let count=0;
for(const [file,rows]of group){let s=read(file);const edits=[];
 for(const r of rows){
  if(r.kind==='html'){if(s.slice(r.start,r.end)!==r.openTag)throw Error('HTML site differs');edits.push({start:r.start+7,end:r.start+7,value:' data-nyx-action='+r.variant});}
  else if(r.kind==='factory'){if(s.slice(r.start,r.end)!==r.source)throw Error('Factory site differs');edits.push({start:r.start,end:r.end,value:'nyxAction('+r.source+','+JSON.stringify(r.variant)+')'});}
  else{if(s[r.propsStart]!=='{')throw Error('Props site differs');edits.push({start:r.propsEnd-1,end:r.propsEnd-1,value:',"data-nyx-action":'+(r.variant.startsWith('@')?'('+r.variant.slice(1)+')':JSON.stringify(r.variant))});}
  count++;
 }
 for(const e of edits.sort((a,b)=>b.start-a.start))s=s.slice(0,e.start)+e.value+s.slice(e.end);
 if(rows.some(r=>r.kind==='factory'))s+='\nfunction nyxAction(element,variant){element.dataset.nyxAction=variant;return element;}\n';
 if(file.startsWith('blocked-view-')){const from='cancelLabel:text(\'cancel\'),reducesProtection:false';if(s.split(from).length!==2)throw Error('Delete history confirmation differs');s=s.replace(from,from+',destructive:true');}
 parse(s,{ecmaVersion:'latest',sourceType:'module'});fs.writeFileSync(path.join(assets,file),s);
}
// The native button component forwards only this opt-in presentation prop. Its
// unmarked navigation/selector callers retain exactly their previous rendering.
const main=Object.keys(prerequisite.assets).find(n=>n.startsWith('index-CTHAIRmi-409dev')&&n.endsWith('.js'));
{let s=read(main);for(const [from,to]of [
 ['title:nyxTitle,"aria-label":nyxLabel})','title:nyxTitle,"aria-label":nyxLabel,"data-nyx-action":nyxActionVariant})'],
 ['title:nyxTitle,"aria-label":nyxLabel,children:e})','title:nyxTitle,"aria-label":nyxLabel,"data-nyx-action":nyxActionVariant,"aria-busy":nyxActionVariant?!!f:undefined,children:e})']
]){if(s.split(from).length!==2)throw Error('Native action prop forwarding prerequisite differs');s=s.replace(from,to);}parse(s,{ecmaVersion:'latest',sourceType:'module'});fs.writeFileSync(path.join(assets,main),s);}
const developer=Object.keys(prerequisite.assets).find(n=>n.startsWith('developer-message-')&&n.endsWith('.js'));
if(developer){let s=read(developer),needle='var continueButton = button("nyx-developer-message-continue", window.NyxI18n.message("site-header.continue"));';if(s.split(needle).length!==2)throw Error('Developer action differs');s=s.replace(needle,needle+'\n\t\tcontinueButton.dataset.nyxAction = "primary";');parse(s,{ecmaVersion:'latest',sourceType:'module'});fs.writeFileSync(path.join(assets,developer),s);count++;}
// Owner-requested exception: suppress only genuine empty inventory presentation.
// Keep hooks, populated tables, filtered-result presentation, top-right Add controls,
// toolbars and navigation unchanged. No data is removed.
const emptyInventories=[['index-Dd_E7hOB','ae','!h&&!(t??[]).length'],['index-K4lT3P_L','ge','!n&&!(r??[]).length'],['index-C40Q8nCD','B','!u&&!(c??[]).length'],['index-BfJf9XXp-4012','$a','!i&&!(e??[]).length']];
for(const [prefix,functionName,guard]of emptyInventories){const file=Object.keys(prerequisite.assets).find(n=>n.startsWith(prefix)&&n.endsWith('.js'));let s=read(file);const ast=parse(s,{ecmaVersion:'latest',sourceType:'module'}),fn=ast.body.find(n=>n.type==='FunctionDeclaration'&&n.id.name===functionName),ret=fn?.body.body.find(n=>n.type==='ReturnStatement');if(!ret?.argument)throw Error('Empty inventory renderer differs: '+prefix);const a=ret.argument;s=s.slice(0,a.start)+'('+guard+')?null:('+s.slice(a.start,a.end)+')'+s.slice(a.end);parse(s,{ecmaVersion:'latest',sourceType:'module'});fs.writeFileSync(path.join(assets,file),s);}
// GlobalGate has two sibling cards. Give that existing sequence one plain
// inset scroll viewport; keep both card subtrees and their sibling spacing.
const appPage=Object.keys(prerequisite.assets).find(n=>n.startsWith('AppPage-')&&n.endsWith('.js'));
{let s=read(appPage),from='function AppPage({children,framed,bounded=false}) {';if(s.split(from).length!==2)throw Error('AppPage prerequisite differs');s=s.replace(from,'function AppPage({children,framed,bounded=false,nyxInsetGroup=false}) {\n if(nyxInsetGroup)children=a.jsx("div",{className:"nyx-page-scroll-group",children});');parse(s,{ecmaVersion:'latest',sourceType:'module'});fs.writeFileSync(path.join(assets,appPage),s);}
const globalGate=Object.keys(prerequisite.assets).find(n=>n.startsWith('index-BiykMfhJ-')&&n.endsWith('.js'));
{let s=read(globalGate),from='return e.jsxs(I,{framed:!0,children:[';if(s.split(from).length!==2)throw Error('GlobalGate sibling-card prerequisite differs');s=s.replace(from,'return e.jsxs(I,{framed:!0,nyxInsetGroup:true,children:[');parse(s,{ecmaVersion:'latest',sourceType:'module'});fs.writeFileSync(path.join(assets,globalGate),s);}
// The owner requests Event Center's inset scroll ownership on ordinary pages.
// Extend the existing shell observer; no new observer, wrapper or route logic.
const shell=Object.keys(prerequisite.assets).find(n=>n.startsWith('application-shell-')&&n.endsWith('.js'));
{let s=read(shell),needle='    for (let bridge = frame.parentElement;';if(s.split(needle).length!==2)throw Error('Native shell bridge prerequisite differs');const inset=`    const nyxContent = frame.childElementCount === 1 ? frame.firstElementChild : null;
    if (nyxContent && !nyxContent.matches('.nyx-event-center')) {
      nyxContent.dataset.nyxPageScroll = '';
      nyxContent.classList.add('nyx-scroll-theme');
      if (!nyxContent.hasAttribute('tabindex')) nyxContent.tabIndex = 0;
      if (!nyxContent.hasAttribute('role')) nyxContent.setAttribute('role', 'region');
      if (!nyxContent.hasAttribute('aria-label')) nyxContent.setAttribute('aria-label', frame.getAttribute('aria-label') || 'Page content');
      frame.tabIndex = -1;
    }
`;s=s.replace(needle,inset+needle);parse(s,{ecmaVersion:'latest',sourceType:'module'});fs.writeFileSync(path.join(assets,shell),s);}
fs.copyFileSync(path.join(src,'actions.css'),path.join(assets,'actions.css'));
fs.copyFileSync(path.join(src,'page-fill.css'),path.join(assets,'page-fill.css'));
// Rename the complete asset graph to invalidate cached importers coherently.
const graph=fs.readdirSync(assets).filter(n=>/\.(m?js|css)$/.test(n)).sort(),digest=hash(graph.map(n=>n+'\n'+hash(read(n))).join('\n')),renames=new Map(graph.map(n=>[n,n.replace(/\.(m?js|css)$/,'-task5-'+digest.slice(0,12)+'.$1')]));
for(const [old,next]of renames){let s=read(old);for(const [a,b]of renames)s=s.replaceAll(a,b);if(next.endsWith('.js'))parse(s,{ecmaVersion:'latest',sourceType:'module'});fs.writeFileSync(path.join(assets,next),s);fs.unlinkSync(path.join(assets,old));}
let html=fs.readFileSync(path.join(front,'index.html'),'utf8').replace('</head>','<link rel="stylesheet" href="/assets/actions.css">\n<link rel="stylesheet" href="/assets/page-fill.css">\n</head>');for(const[a,b]of renames)html=html.replaceAll(a,b);fs.writeFileSync(path.join(front,'index.html'),html);
manifest.task=5;manifest.task5SourceHash=hash(fs.readdirSync(src).filter(n=>fs.statSync(path.join(src,n)).isFile()).sort().map(n=>n+'\n'+hash(fs.readFileSync(path.join(src,n)))).join('\n'));manifest.task5AssetGraphHash=digest;manifest.assets=Object.fromEntries([...renames.values()].sort().map(n=>[n,hash(read(n))]));fs.writeFileSync(path.join(front,'nyxguard-build.json'),JSON.stringify(manifest,null,2));
fs.writeFileSync(path.join(front,'task5-validation.json'),JSON.stringify({actionSites:count,retainedSites:registry.filter(r=>!r.variant).length,emptyInventoryNoticesSuppressed:4,ownerRequestedGlobalPageFill:true,backendChanged:false,navigationStylesChanged:false},null,2));console.log('Task 5: '+count+' explicit action sites; guarded assets and JavaScript validated');
