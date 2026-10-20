import fs from 'node:fs';
import {patchImperative}from'./imperative.mjs';
import {patchDynamic}from'./dynamic.mjs';
import{patchSelectAccessibility}from'./select-accessibility.mjs';
import{patchAccessibleLabels}from'./accessible-labels.mjs';
import{markPresentationActions}from'./styling-markers.mjs';
import{localizeNetworkFailures}from'./network-errors.mjs';
import{patchNotifications}from'./notifications.mjs';
import{patchFormatting}from'./formatting.mjs';
import{patchEvents}from'./events.mjs';
import{validate}from'./validate.mjs';
import{markFilters}from'./filter-markers.mjs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {readCatalogs,applyEdits,coverage,languages,walk} from './catalogs.mjs';
const root=process.argv[2],input=process.argv[3]??path.dirname(new URL(import.meta.url).pathname),assets=path.join(root,'frontend/assets');
const mainNames=fs.readdirSync(assets).filter(n=>n.startsWith('index-CTHAIRmi-409dev-4012certfix4-')&&n.endsWith('.js'));
if(mainNames.length!==1)throw Error('Expected accepted Task 1 frontend');
const mainName=mainNames[0],original=fs.readFileSync(path.join(assets,mainName),'utf8');
if(createHash('sha256').update(original).digest('hex')!=='54d6e457a6f38ef4182f65faa0cb0ac70d771f322a1fdcb91cc36883c091c9d4')throw Error('Accepted Task 1 asset checksum differs');
if(!original.includes('window.NyxGuardCapabilities.identity=nyxUser'))throw Error('Task 1 permissions prerequisite missing');
const baseline=readCatalogs(original),completion=JSON.parse(fs.readFileSync(path.join(input,'../locales/base-completion.json'),'utf8'));
const presentation=JSON.parse(fs.readFileSync(path.join(input,'presentation.json'),'utf8'));
const changes=[],catalogs={};
for(const l of languages){
 const next={...baseline.catalogs[l]};
 for(const [key,text] of Object.entries(completion[l])){
  const existing=next[key],english=baseline.catalogs.en[key]??baseline.shared[key];
  // Existing genuinely translated values remain authoritative unless specifically corrected.
  if(existing===undefined||existing===english||['settings.grafana.overview-body','web-controls.no-events','access-list.subtitle'].includes(key))next[key]=text;
 }
 for(const entry of presentation)next[entry.id]=entry[l];
 catalogs[l]=next;changes.push({start:baseline.nodes[l].start,end:baseline.nodes[l].end,value:JSON.stringify(next)});
}
const catalogValidation=validate(Object.fromEntries(languages.map(l=>[l,{...baseline.shared,...catalogs[l]}])));if(catalogValidation.length)throw Error('Invalid effective catalogs: '+JSON.stringify(catalogValidation));
let main=applyEdits(original,changes);
main='import {createErrorPresenter}from"./localized-errors.js";import{installNativeValidation}from"./native-validation.js";\n'+main;
if(main.split('"aria-label":"Main navigation"').length!==2)throw Error('Navigation landmark prerequisite changed');
main=main.replace('"aria-label":"Main navigation"','"data-nyx-main-navigation":true,"aria-label":"Main navigation"');
for(const [label,attribute]of [['Open preferences','data-nyx-open-preferences'],['Open user menu','data-nyx-open-user-menu']]){
 const match=JSON.stringify('aria-label')+':'+JSON.stringify(label);if(main.split(match).length!==2)throw Error('Menu prerequisite changed');main=main.replace(match,JSON.stringify(attribute)+':true,'+match);
}

const reverse={};for(const [id,text]of Object.entries({...baseline.shared,...catalogs.en})){
 if(typeof text==='string'&&!text.includes('{')&&text.trim()===text&&/[A-Za-z]{3}/.test(text))reverse[text]??=id;
}
for(const entry of presentation)reverse[entry.en]=entry.id;
// This bridge delegates to the one existing React Intl formatter. Raw server detail is preserved.
const bridge=`\nconst nyxLocaleLookup=new Map(Object.entries(${JSON.stringify(reverse)}));const nyxErrorPresenter=createErrorPresenter(st,nyxLocaleLookup,{policies:${JSON.stringify(JSON.parse(fs.readFileSync(path.join(input,"error-policy.json"),"utf8")))},diagnosticId:"ui.d22e6c7009b68565",networkId:"ui.cf3c42dcdb6d303b"});window.NyxI18n=Object.freeze({...nyxErrorPresenter,get locale(){return st.locale},t(source,values){const id=nyxLocaleLookup.get(source);return id?st.formatMessage({id},values):source},message(id,values){return st.formatMessage({id},values)},formatMessage(descriptor,values){return st.formatMessage(descriptor,values)},escape(value){return String(value).replace(/[&<>\\x22\\x27]/g,c=>"&#"+c.charCodeAt(0)+";")},number(value,options){return st.formatNumber(value,options)},date(value,options){return st.formatDate(value,options)}});document.documentElement.lang=st.locale;installNativeValidation(window.NyxI18n);\n`;
const marker='let st=iD({locale:Fm(),messages:s8},MD);';
if(main.split(marker).length!==2)throw Error('Intl initialization prerequisite changed');
main=main.replace(marker,marker+bridge);
const errorPrerequisite='throw new Error(a?.startsWith?.("nyxagent.")?st.formatMessage({id:a}):a)';
if(main.split(errorPrerequisite).length!==2)throw Error('Canonical error formatter prerequisite changed');
main=main.replace(errorPrerequisite,'throw new Error(window.NyxI18n.apiError(n?.error??{message:a},e.status))');
const languagePrerequisite='_=D=>{o8(D),t(D),location.reload()}';if(main.split(languagePrerequisite).length!==2)throw Error('Language selection prerequisite changed');main=main.replace(languagePrerequisite,'_=async D=>{if(D===Fm(true)||!await window.NyxLanguageDrafts.allowChange())return;o8(D),t(D),location.reload()}');
const controlPrerequisite='return render(component,props,controlKey);';if(main.split(controlPrerequisite).length!==2)throw Error('Capability control prerequisite changed');main=main.replace(controlPrerequisite,'if(nyxMutation&&["input","select","textarea"].includes(component))props["data-nyx-draft-field"]=true;'+controlPrerequisite);
const parsePrerequisite='async function Pm(e){';if(!main.includes(parsePrerequisite))throw Error('Response parser prerequisite changed');main=main.replace(parsePrerequisite,'async function Pm(e,nyxMethod="GET"){');
main=main.replace('return n?vx.camelizeKeys(n):null}','window.NyxLanguageDrafts?.recordSuccess(e.url,nyxMethod);return n?vx.camelizeKeys(n):null}');
for(const[old,next]of [['return Pm(h)}async function qo','return Pm(h,"POST")}async function qo'],['return Pm(f)}async function CD','return Pm(f,"PUT")}async function CD'],['return Pm(c)}async function i6','return Pm(c,"DELETE")}async function i6']]){if(!main.includes(old))throw Error('Write response prerequisite changed');main=main.replace(old,next);}


const patched=[];
const allowedProperties=new Set(['title','placeholder','aria-label','aria-description','ariaLabel']);
const skipSources=new Set(['http','https','container','control','dummyInput','group','hosts','indicatorContainer','indicatorSeparator','input','loadingIndicator','menu','multiValue','option','placeholder','settings','singleValue','streams','users','auditlogs','certificates','dashboard','nyxguard','Authorization: Bearer token','User-Agent']);
for(const name of fs.readdirSync(assets).filter(n=>n.endsWith('.js'))){
 let source=name===mainName?main:fs.readFileSync(path.join(assets,name),'utf8');
 if(name.startsWith('index-BwxhCj6Q-')){
  const old='let vt=dN({locale:Qm(),messages:TU},zN);';
  if(source.split(old).length!==2)throw Error('Legacy Intl prerequisite changed');
  source=source.replace(old,'const nyxLegacyIntlFacade=Object.freeze({get locale(){return window.NyxI18n.locale},formatMessage(...args){return window.NyxI18n.formatMessage(...args)}});let vt=nyxLegacyIntlFacade;');
  source=source.replace('vt=dN({locale:e,messages:t},zN)','vt=nyxLegacyIntlFacade');
  const oldError='new Error(typeof t.error.messageI18n<"u"?t.error.messageI18n:t.error.message)';if(source.split(oldError).length!==2)throw Error('Legacy error formatter prerequisite changed');source=source.replace(oldError,'new Error(window.NyxI18n.apiError(t.error,e.status))');

 }

 source=localizeNetworkFailures(source,name);source=markPresentationActions(source,name,{...baseline.shared,...catalogs.en});source=patchAccessibleLabels(source);source=patchSelectAccessibility(source,name);source=markFilters(source,name);source=patchEvents(source,name);source=patchNotifications(source,name);source=patchFormatting(source,name);
 const edits=[],seen=new Set();
 const ast=name===mainName?readCatalogs(source).ast:(await import('acorn')).parse(source,{ecmaVersion:'latest',sourceType:'module'});
 function visitLiteral(node){
  if(!node)return;
  if(node.type==='TemplateLiteral'&&!node.expressions.length){const text=node.quasis[0].value.cooked;if(reverse[text]&&!seen.has(node.start)){edits.push({start:node.start,end:node.end,value:`window.NyxI18n.message(${JSON.stringify(reverse[text])})`});seen.add(node.start);patched.push({file:name,source:text,id:reverse[text]});}return;}
  if(node.type==='Literal'&&typeof node.value==='string'&&reverse[node.value]&&!skipSources.has(node.value)&&!seen.has(node.start)){
   edits.push({start:node.start,end:node.end,value:`window.NyxI18n.message(${JSON.stringify(reverse[node.value])})`});seen.add(node.start);patched.push({file:name,source:node.value,id:reverse[node.value]});
  }else if(node.type==='ConditionalExpression'){visitLiteral(node.consequent);visitLiteral(node.alternate)}
  else if(node.type==='LogicalExpression')visitLiteral(node.right);
  else if(node.type==='ArrayExpression')node.elements.forEach(visitLiteral);
 }
 walk(ast,(node,anc)=>{
  if(node.type==='VariableDeclarator'&&node.id.name==='explanation')visitLiteral(node.init);
  if(node.type==='AssignmentPattern'&&node.right.type==='Literal'&&['Notifications Alt+T'].includes(node.right.value))visitLiteral(node.right);
  if(node.type==='NewExpression'&&node.callee.name==='Error')visitLiteral(node.arguments[0]);
  if(node.type==='CallExpression'&&node.callee.type==='MemberExpression'&&node.callee.property.name==='createElement'){
   for(const child of node.arguments.slice(2))visitLiteral(child);
  }
  if(node.type!=='Property'||node.computed)return;
  const key=node.key.name??node.key.value;
  const call=anc.at(-2),jsx=call?.type==='CallExpression'&&call.callee.type==='MemberExpression'&&['jsx','jsxs','createElement'].includes(call.callee.property.name);
  if(jsx&&key==='onSubmit'&&node.value.type==='MemberExpression'&&node.value.property.name==='handleSubmit'&&node.value.object.type==='Identifier'){
   const object=anc.at(-1);if(object?.type==='ObjectExpression'&&!object.properties.some(p=>(p.key.name??p.key.value)==='data-nyx-dirty'))edits.push({start:object.start+1,end:object.start+1,value:'"data-nyx-dirty":'+node.value.object.name+'.dirty===true,'});
  }
  // JSX presentation only: never modify configuration values, routing, select values or library metadata.
  if(jsx&&(key==='children'||allowedProperties.has(key)))visitLiteral(node.value);
  else if(name.startsWith('index-')&&['label','title','placeholder','aria-label','aria-description','ariaLabel'].includes(key)&&anc.some(a=>['FunctionDeclaration','FunctionExpression','ArrowFunctionExpression'].includes(a.type)))visitLiteral(node.value);
 });
 source=applyEdits(source,edits);
 if(['vpn-client-4014-','professional-support-','lan-access-block-4011-','developer-message-','update-presentation-','local-dev-fixes-','index-DJfFx4nu-'].some(prefix=>name.startsWith(prefix))){source=patchDynamic(source,name);
 if(name.startsWith('developer-message-'))source=source.replace('paragraph.textContent = text;','paragraph.textContent = window.NyxI18n.t(text);');
 const result=patchImperative(source,reverse,{htmlOnly:name.startsWith("local-dev-fixes-")});source=result.source;for(const record of result.records)patched.push({file:name,...record,kind:'imperative'});}
 fs.writeFileSync(path.join(assets,name),source);
}
// Styles and legacy layout helpers target a stable landmark, independent of translated accessibility text.
for(const name of fs.readdirSync(assets).filter(n=>/\.(js|css)$/.test(n))){
 const file=path.join(assets,name);let text=fs.readFileSync(file,'utf8');
 text=text.replaceAll('[aria-label="Main navigation"]','[data-nyx-main-navigation]');
 text=text.replaceAll('[aria-label=\\"Main navigation\\"]','[data-nyx-main-navigation]');
 fs.writeFileSync(file,text);
}
fs.copyFileSync(path.join(input,'localization-layout.css'),path.join(assets,'localization-layout.css'));
fs.copyFileSync(path.join(input,'draft-tracker.js'),path.join(assets,'draft-tracker.js'));
fs.copyFileSync(path.join(input,'localized-errors.js'),path.join(assets,'localized-errors.js'));
fs.copyFileSync(path.join(input,'native-validation.js'),path.join(assets,'native-validation.js'));

const confirmation=fs.readdirSync(assets).filter(n=>n.startsWith('confirmation-dialog-')&&n.endsWith('.js'));if(confirmation.length!==1)throw Error('Native confirmation prerequisite changed');
fs.writeFileSync(path.join(assets,'language-draft-guard.js'),fs.readFileSync(path.join(input,'language-draft-guard.js'),'utf8').replace('NYX_CONFIRMATION_MODULE',confirmation[0]));

const names=fs.readdirSync(assets).filter(n=>/\.(js|css)$/.test(n));
const hash=createHash('sha256');for(const name of names.sort())hash.update(name).update(fs.readFileSync(path.join(assets,name)));
const suffix='-task2-'+hash.digest('hex').slice(0,12),renames=new Map(names.map(n=>[n,n.replace(/\.(js|css)$/,suffix+'.$1')]));
for(const name of names){let source=fs.readFileSync(path.join(assets,name),'utf8');for(const [old,next]of renames)source=source.replaceAll(old,next);fs.writeFileSync(path.join(assets,renames.get(name)),source);fs.unlinkSync(path.join(assets,name));}
let html=fs.readFileSync(path.join(root,'frontend/index.html'),'utf8');html=html.replace('</head>','<link rel="stylesheet" href="/assets/localization-layout.css">\n</head>');html=html.replace('<script type="module" crossorigin','<script type="module" src="/assets/language-draft-guard.js"></script>\n<script type="module" crossorigin');for(const [old,next]of renames)html=html.replaceAll(old,next);fs.writeFileSync(path.join(root,'frontend/index.html'),html);
for(const name of renames.values())if(name.endsWith('.js'))execFileSync(process.execPath,['--check',path.join(assets,name)]);
const manifest=JSON.parse(fs.readFileSync(path.join(root,'frontend/nyxguard-build.json'),'utf8'));manifest.task=2;manifest.baseSourceRevision=manifest.sourceRevision;manifest.sourceRevision=null;
const sourceHash=createHash('sha256');for(const name of ['catalogs.mjs','patch-frontend.mjs','imperative.mjs','dynamic.mjs','select-accessibility.mjs','accessible-labels.mjs','styling-markers.mjs','network-errors.mjs','localized-errors.js','native-validation.js','error-policy.json','notifications.mjs','formatting.mjs','events.mjs','validate.mjs','filter-markers.mjs','draft-tracker.js','language-draft-guard.js','localization-layout.css','presentation.json','package-lock.json'])sourceHash.update(name).update(fs.readFileSync(path.join(input,name)));sourceHash.update(fs.readFileSync(path.join(input,'../locales/base-completion.json')));manifest.localizationSourceHash=sourceHash.digest('hex');
manifest.assets=Object.fromEntries([...renames.values()].sort().map(n=>[n,createHash('sha256').update(fs.readFileSync(path.join(assets,n))).digest('hex')]));
fs.writeFileSync(path.join(root,'frontend/nyxguard-build.json'),JSON.stringify(manifest,null,2));
const report={before:coverage(baseline.catalogs,baseline.shared),after:coverage(catalogs,baseline.shared),duplicateKeys:baseline.duplicates,baselineCatalogIssues:validate(Object.fromEntries(languages.map(l=>[l,{...baseline.shared,...baseline.catalogs[l]}]))),catalogValidation,patchedPresentation:patched,limitations:['Catalog coverage does not establish application localization completeness.','Imperative panels, dynamic templates, API messages, language switching and runtime interactions require separate audit.']};
fs.writeFileSync(path.join(root,'frontend/localization-coverage.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify({requiredKeys:report.after.requiredKeys.length,patchedLiterals:patched.length,catalogMissing:Object.fromEntries(languages.map(l=>[l,report.after.languages[l].missing.length]))}));
