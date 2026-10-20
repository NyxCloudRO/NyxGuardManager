import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {parse} from '@formatjs/icu-messageformat-parser';
import {languages,applyEdits,coverage,readCatalogs} from '../catalogs.mjs';
const completion=JSON.parse(fs.readFileSync(new URL('../../locales/base-completion.json',import.meta.url),'utf8'));
const presentation=JSON.parse(fs.readFileSync(new URL('../presentation.json',import.meta.url),'utf8'));
function signature(message){
 const argumentsFound=new Map();
 function visit(nodes){for(const n of nodes){if(n.type>=1&&n.type<=6)argumentsFound.set(n.value,n.type);if(n.options){assert.ok(n.options.other,'Plural/select requires other');for(const option of Object.values(n.options))visit(option.value);}if(n.children)visit(n.children);}}
 visit(parse(message));return [...argumentsFound].sort(([a],[b])=>a.localeCompare(b));
}
test('completion covers every supported language with valid ICU and identical arguments',()=>{
 assert.deepEqual(Object.keys(completion).sort(),[...languages].sort());
 for(const l of languages){assert.deepEqual(Object.keys(completion[l]).sort(),Object.keys(completion.en).sort());for(const [id,message]of Object.entries(completion[l])){
  assert.ok(typeof message==='string'&&message.trim(),l+' '+id);assert.deepEqual(signature(message),signature(completion.en[id]),l+' '+id);
 }}
});
test('reviewed presentation phrases have unique IDs, six translations and consistent arguments',()=>{
 assert.equal(new Set(presentation.map(e=>e.id)).size,presentation.length);
 for(const entry of presentation)for(const l of languages){assert.ok(entry[l]?.trim(),l+' '+entry.id);assert.deepEqual(signature(entry[l]),signature(entry.en));}
});
test('coverage does not count implicit English fallback as implemented',()=>{
 const catalogs=Object.fromEntries(languages.map(l=>[l,l==='en'?{hello:'Hello',empty:'Empty'}:{empty:''}]));
 const result=coverage(catalogs);assert.deepEqual(result.languages.es.missing,['hello']);assert.deepEqual(result.languages.es.invalid,['empty']);assert.equal(result.languages.es.implemented,0);
});
test('overlapping source edits fail closed',()=>{
 assert.equal(applyEdits('abcdef',[{start:1,end:2,value:'X'},{start:4,end:6,value:'Y'}]),'aXcdY');
 assert.throws(()=>applyEdits('abc',[{start:0,end:2,value:'x'},{start:1,end:3,value:'y'}]),/Overlapping/);
});
test('catalog extraction never evaluates JavaScript and rejects unknown languages',()=>{
 assert.throws(()=>readCatalogs('const pv = dangerous();'),/Dynamic catalog rejected/);
 assert.throws(()=>readCatalogs('const pv = [];'),/Supported language catalog changed/);
});
import {patchImperative}from'../imperative.mjs';
import {parse as parseJS}from'acorn';
test('legacy localization preserves routing, action identifiers and comparisons',()=>{
 const source='const labels={connected:"Connected"}; if(state==="Connected")run(); button.setAttribute("data-action","Connected"); button.setAttribute("aria-label","Connected"); querySelector("Connected");';
 const result=patchImperative(source,{Connected:'vpn.connected'}).source;
 assert.ok(result.includes('state==="Connected"'));assert.ok(result.includes('"data-action","Connected"'));assert.ok(result.includes('querySelector("Connected")'));
 assert.ok(result.includes('connected:window.NyxI18n.message("vpn.connected")'));assert.ok(result.includes('"aria-label",window.NyxI18n.message'));
 parseJS(result,{ecmaVersion:'latest'});
});
test('imperative localization does not format an ICU message twice or translate its parameter values',()=>{
 const source='window.NyxI18n.t("Connect {name}",{name:"Connected"});nyxVpnCount("{count} connected",count);node.textContent="Connected";';
 const patched=patchImperative(source,{'Connect {name}':'connect','Connected':'state','{count} connected':'count'}).source;assert.ok(patched.includes('t("Connect {name}",{name:"Connected"})'));assert.ok(patched.includes('nyxVpnCount("{count} connected",count)'));assert.ok(patched.includes('node.textContent=window.NyxI18n.message("state")'));parseJS(patched,{ecmaVersion:'latest'});
});
test('localized literal HTML escapes translations and leaves technical attributes intact',()=>{
 const source='node.innerHTML="<button data-action=\\\"delete\\\" title=\\\"Delete\\\">Delete</button>";';
 const result=patchImperative(source,{Delete:'action.delete'}).source;
 assert.ok(result.includes('data-action=\\\"delete\\\"'));assert.equal(result.split('window.NyxI18n.escape(').length,3);parseJS(result,{ecmaVersion:'latest'});
});
import{DraftTracker}from'../draft-tracker.js';
import{markFilters}from'../filter-markers.mjs';
test('draft tracking detects edits, reversions and removed fields without changing values',()=>{
 const tracker=new DraftTracker(),field={type:'text',value:'original',defaultValue:'original',isConnected:true};tracker.focus(field);field.value='draft';tracker.change(field);assert.equal(tracker.hasChanges(),true);assert.equal(field.value,'draft');field.value='original';tracker.change(field);assert.equal(tracker.hasChanges(),false);field.value='draft';tracker.change(field);field.isConnected=false;assert.equal(tracker.hasChanges(),false);
});
test('draft tracking protects checkbox and file changes, and resets after confirmed save',()=>{
 const tracker=new DraftTracker(),checkbox={type:'checkbox',checked:false,defaultChecked:false,isConnected:true};tracker.focus(checkbox);checkbox.checked=true;tracker.change(checkbox);assert.equal(tracker.hasChanges(),true);tracker.reset();tracker.focus(checkbox);assert.equal(tracker.hasChanges(),false);
 const file={type:'file',files:[],isConnected:true};tracker.focus(file);file.files=[{}];tracker.change(file);assert.equal(tracker.hasChanges(),true);
});
test('filter markers identify search controls while keeping mutation fields and technical values intact',()=>{
 const source='e.jsx("input",{placeholder:"Search IP or CIDR",value:query});e.jsx("input",{nyxMutation:true,placeholder:"Search",value:secret});';const result=markFilters(source,'filters.js');assert.equal(result.split('data-nyx-filter-field').length,2);assert.ok(result.includes('value:query'));assert.ok(result.includes('value:secret'));parseJS(result,{ecmaVersion:'latest'});
});
test('HTML entities in fixed labels use the same canonical translation and remain escaped',()=>{
 const result=patchImperative('node.innerHTML="<span>Diagnostics &amp; Support</span>";',{'Diagnostics & Support':'support.title'}).source;assert.ok(result.includes('window.NyxI18n.escape(window.NyxI18n.message("support.title"))'));parseJS(result,{ecmaVersion:'latest'});
});

import {patchSelectAccessibility}from'../select-accessibility.mjs';
import vm from'node:vm';
test('select announcements use canonical ICU messages without changing option values or actions',()=>{
 const source='const announcements={guidance(){return "English"},onChange(){},onFocus(){},onFilter(){}};const defaults={screenReaderStatus(){},loadingMessage(){},noOptionsMessage(){},placeholder:"Select...",tabSelectsValue:true};const option={value:"wireguard",label:"WireGuard"};globalThis.result={announcements,defaults,option};';
 const patched=patchSelectAccessibility(source,'index-CTHAIRmi-fixture.js');parseJS(patched,{ecmaVersion:'latest'});
 const calls=[],window={NyxI18n:{locale:'ro',message(id,values){assert.ok(presentation.some(p=>p.id===id));calls.push({id,values});return id;},t(value){return value;}}},context={window,Intl};vm.runInNewContext(patched,context);
 assert.equal(context.result.option.value,'wireguard');assert.equal(context.result.option.label,'WireGuard');assert.equal(context.result.defaults.tabSelectsValue,true);
 context.result.announcements.guidance({context:'menu',tabSelectsValue:true});context.result.announcements.onChange({action:'select-option',label:'WireGuard'});context.result.defaults.screenReaderStatus({count:2});
 assert.equal(calls.at(-1).values.count,2);assert.equal(calls.at(-2).values.label,'WireGuard');assert.equal(context.result.defaults.placeholder,'Select...');
});
test('select accessibility patch rejects a changed library contract',()=>{assert.throws(()=>patchSelectAccessibility('const unrelated={};','index-CTHAIRmi-fixture.js'),/prerequisite changed/);});
import {patchAccessibleLabels}from'../accessible-labels.mjs';
test('notification region defaults resolve the selected language after formatter initialization',()=>{
 const patched=patchAccessibleLabels('globalThis.defaults={"aria-label":"Notifications Alt+T",hotKeys:handler};');parseJS(patched,{ecmaVersion:'latest'});
 const context={window:{},handler:()=>true};vm.runInNewContext(patched,context);
 context.window.NyxI18n={message:id=>'ro:'+id};assert.ok(context.defaults['aria-label'].startsWith('ro:'));assert.equal(context.defaults.hotKeys,context.handler);
 context.window.NyxI18n={message:id=>'fr:'+id};assert.ok(context.defaults['aria-label'].startsWith('fr:'));
});
test('ordinal accessible labels localize the full sentence and retain field/action identifiers',()=>{
 const source='const props={"aria-label":"Authorization "+(row+1)+" username",id:"authorization-"+row,value:name};const remove={"aria-label":"Remove ".concat(label||"option"),"data-action":"remove"};';
 const patched=patchAccessibleLabels(source);parseJS(patched,{ecmaVersion:'latest'});assert.ok(patched.includes('number:row+1'));assert.ok(patched.includes('id:"authorization-"+row'));assert.ok(patched.includes('value:name'));assert.ok(patched.includes('"data-action":"remove"'));assert.equal(patched.includes('"aria-label":"Authorization "'),false);
});
import {markPresentationActions}from'../styling-markers.mjs';
test('action styling uses stable source metadata while preserving authorization and handlers',()=>{
 const source='const view=e.jsx("button",{nyxMutation:true,onClick:save,children:e.jsx(T,{id:"save-rule"})});';const patched=markPresentationActions(source,'fixture.js',{'save-rule':'Save Rule'});parseJS(patched,{ecmaVersion:'latest'});assert.ok(patched.includes('"data-nyx-style-action":"save-rule"'));assert.ok(patched.includes('nyxMutation:true'));assert.ok(patched.includes('onClick:save'));
 const legacy='function applyViewOnlyMode(){return;}function markControlMatrixActions(){}function enhanceMainGlobalGatePills(){}';const next=markPresentationActions(legacy,'local-dev-fixes-fixture.js',{});assert.ok(next.includes('function applyViewOnlyMode(){return;}'));assert.equal(next.includes('textContent'),false);assert.ok(next.includes('data-nyx-style-action'));
});
import {createErrorPresenter}from'../localized-errors.js';
import{localizeNetworkFailures}from'../network-errors.mjs';
const errorPolicies=JSON.parse(fs.readFileSync(new URL('../error-policy.json',import.meta.url),'utf8'));
test('every structured diagnostic policy has six complete summary and recommendation messages',()=>{
 assert.equal(Object.keys(errorPolicies).length,32);const ids=new Set(presentation.map(p=>p.id));for(const policy of Object.values(errorPolicies)){assert.ok(ids.has(policy.summary));assert.ok(ids.has(policy.recommendation));}
});
test('API diagnostics localize from structured codes and retain the reference without mutating the response',()=>{
 const reference='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',payload={message:'Technical provider detail',error_code:'DATABASE_OPERATION_FAILED',diagnostic_id:reference,code:500},original=JSON.stringify(payload);
 for(const locale of languages){const calls=[],intl={messages:{'nyxagent.denied':'x'},formatMessage({id},values){calls.push({id,values});return locale+':'+id;}},presenter=createErrorPresenter(intl,new Map(),{policies:errorPolicies,diagnosticId:'diagnostic',networkId:'network'});assert.equal(presenter.apiError(payload,500),locale+':diagnostic');assert.equal(calls.at(-1).values.reference,reference);assert.equal(calls.at(-1).values.summary,locale+':'+errorPolicies.DATABASE_OPERATION_FAILED.summary);assert.equal(presenter.apiError({message_i18n:'nyxagent.denied'},403),locale+':nyxagent.denied');}
 assert.equal(JSON.stringify(payload),original);
});
test('unknown provider errors retain technical detail and aborted requests retain their original cancellation identity',()=>{
 const calls=[],intl={messages:{},formatMessage({id},values){calls.push({id,values});return id;}},presenter=createErrorPresenter(intl,new Map(),{policies:{},diagnosticId:'diagnostic',networkId:'network'});assert.equal(presenter.apiError({message:'Provider detail X42'},502),'dynamic.technical-error');assert.equal(calls.at(-1).values.detail,'Provider detail X42');const aborted=Object.assign(new Error('cancelled'),{name:'AbortError'});assert.throws(()=>presenter.networkError(aborted),error=>error===aborted);const failure=new TypeError('Failed to fetch');assert.throws(()=>presenter.networkError(failure),error=>error instanceof TypeError&&error.message==='network'&&error.cause===failure);
});
test('network presentation wraps API fetches while leaving preload requests and endpoint arguments intact',()=>{
 const source='async function r6(){return fetch(url,{signal});}function preload(){return fetch(asset);}fetch("/api/settings");';const patched=localizeNetworkFailures(source,'index-CTHAIRmi-fixture.js');parseJS(patched,{ecmaVersion:'latest'});assert.equal(patched.split('window.NyxI18n.networkError').length,3);assert.ok(patched.includes('fetch(asset);'));assert.ok(patched.includes('fetch(url,{signal})'));assert.ok(patched.includes('fetch("/api/settings")'));
});
import{nativeValidationMessage,installNativeValidation}from'../native-validation.js';
import{patchFormatting}from'../formatting.mjs';
test('embedded help uses all six canonical catalogs instead of silently falling back to English',()=>{
 const source='const help=(locale,section)=>{if(docs[locale]?.[section])return docs[locale][section];throw new Error(`Cannot load help doc for ${locale}-${section}`)};globalThis.help=help;';
 const patched=patchFormatting(source,'fixture.js');parseJS(patched,{ecmaVersion:'latest'});
 const context={window:{NyxI18n:{message:id=>'## Ajutor DNS\n\n'+id}},encodeURIComponent};vm.runInNewContext(patched,context);const uri=context.help('ro','Certificates');assert.equal(decodeURIComponent(uri.split(',')[1]),'## Ajutor DNS\n\nhelp.doc.Certificates');assert.throws(()=>context.help('ro','Unexpected'),/Unexpected/);
 for(const section of ['AccessLists','Certificates','DeadHosts','ProxyHosts','RedirectionHosts','Streams']){const row=presentation.find(p=>p.id==='help.doc.'+section);for(const locale of languages)assert.ok(row[locale].startsWith('## '));}
});
test('proxy summary localizes presentation fields and preserves entered destinations and resource identifiers',()=>{
 const source="function NyxProxySummary(){const v={accessListId:42,certificateId:9,locations:[],forwardHost:'internal.example'};return [['Domains','No domains entered'],['Destination',v.forwardHost],['Access','Access list #'+v.accessListId],['TLS','Certificate #'+v.certificateId],['Custom paths',String((v.locations||[]).length)],['WAF','Configured off']]}globalThis.summary=NyxProxySummary;";
 const patched=patchFormatting(source,'fixture.js');parseJS(patched,{ecmaVersion:'latest'});const context={window:{NyxI18n:{t:(text,args)=>'localized:'+text+(args?JSON.stringify(args):''),number:n=>'localized:'+n}}};vm.runInNewContext(patched,context);const rows=context.summary();assert.equal(rows[1][1],'internal.example');assert.ok(rows[0][1].startsWith('localized:'));assert.ok(rows[2][1].includes('42'));assert.ok(rows[3][1].includes('9'));assert.equal(rows[4][1],'localized:0');
});
test('native constraint messages reuse existing catalogs and leave values, limits and constraints unchanged',()=>{
 const calls=[],i18n={message(id,values){calls.push({id,values});return id;},number:n=>'localized '+n};const field={type:'email',value:'invalid',required:true,validity:{typeMismatch:true}},before=JSON.stringify(field);assert.equal(nativeValidationMessage(field,i18n),'error.invalid-email');assert.equal(JSON.stringify(field),before);
 const min={type:'number',min:'1200',validity:{rangeUnderflow:true}};assert.equal(nativeValidationMessage(min,i18n),'error.minimum');assert.equal(calls.at(-1).values.min,'localized 1200');
 const short={type:'password',minLength:12,validity:{tooShort:true}};nativeValidationMessage(short,i18n);assert.equal(calls.at(-1).values.min,12);
});
test('native validation clears only its own presentation errors and preserves application custom validity',()=>{
 const listeners={},root={addEventListener(type,fn){listeners[type]=fn;}},messages=[],field={type:'text',value:'',validity:{valueMissing:true},setCustomValidity:s=>messages.push(s)};installNativeValidation({message:id=>id},root);listeners.invalid({target:field});assert.deepEqual(messages,['error.required']);field.value='customer data';listeners.input({target:field});assert.deepEqual(messages,['error.required','']);assert.equal(field.value,'customer data');const existing={validity:{customError:true},setCustomValidity(){throw Error('must not overwrite')}};listeners.invalid({target:existing});
});
