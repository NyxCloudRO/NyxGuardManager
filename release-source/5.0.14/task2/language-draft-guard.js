import {DraftTracker}from'./draft-tracker.js';
const tracker=new DraftTracker(),storageKey='nyxguard:locale-transition-filters',states=new Map();
let transition;try{transition=JSON.parse(sessionStorage.getItem(storageKey)||'null');if(transition&&(transition.path!==location.pathname+location.hash||Date.now()-transition.created>60000))transition=null;}catch{transition=null;}

function draftField(field){return field instanceof HTMLElement&&field.matches('input,textarea,select')&&!field.disabled&&!field.readOnly&&!field.hasAttribute('data-nyx-filter-field')&&(field.hasAttribute('data-nyx-draft-field')||!!field.closest('form'));}
document.addEventListener('focusin',event=>{if(draftField(event.target))tracker.focus(event.target);},true);
for(const name of ['input','change'])document.addEventListener(name,event=>{if(draftField(event.target))tracker.change(event.target);},true);
function rememberFilters(){
 const fields=Array.from(document.querySelectorAll('[data-nyx-filter-field],input[type=search]')).filter(field=>!draftField(field)&&!field.disabled&&!['password','file','hidden'].includes(field.type));
 const values=fields.map((field,index)=>({key:field.getAttribute('data-nyx-filter-field')||'search:'+index,value:field.value}));
 try{sessionStorage.setItem(storageKey,JSON.stringify({path:location.pathname+location.hash,created:Date.now(),values,states:Object.fromEntries(states)}));}catch{/* Storage restrictions do not prevent a safe language change. */}
}
function restoreFilters(){
 let saved;try{saved=JSON.parse(sessionStorage.getItem(storageKey)||'null');}catch{return}
 if(!saved)return;
 if(saved.path!==location.pathname+location.hash||Date.now()-saved.created>60000){sessionStorage.removeItem(storageKey);return;}
 const remaining=new Map(saved.values.map(v=>[v.key,v.value]));
 function apply(){
  const fields=Array.from(document.querySelectorAll('[data-nyx-filter-field],input[type=search]'));
  fields.forEach((field,index)=>{
   const key=field.getAttribute('data-nyx-filter-field')||'search:'+index;
   if(!remaining.has(key)||draftField(field)||field.disabled)return;
   const value=remaining.get(key);if(field instanceof HTMLSelectElement&&!Array.from(field.options).some(option=>option.value===value))return;remaining.delete(key);
   if(field.value===value)return;
   const prototype=field instanceof HTMLSelectElement?HTMLSelectElement.prototype:field instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;
   Object.getOwnPropertyDescriptor(prototype,'value').set.call(field,value);
   field.dispatchEvent(new Event('input',{bubbles:true}));field.dispatchEvent(new Event('change',{bubbles:true}));
  });
  if(!remaining.size){sessionStorage.removeItem(storageKey);observer.disconnect();clearTimeout(timeout);}
 }
 const observer=new MutationObserver(apply),timeout=setTimeout(()=>{observer.disconnect();sessionStorage.removeItem(storageKey);},10000);
 observer.observe(document.documentElement,{childList:true,subtree:true});apply();
}
const hasChanges=()=>tracker.hasChanges()||!!document.querySelector('[data-nyx-dirty="true"]');
window.NyxLanguageDrafts=Object.freeze({
 hasChanges,
 readState:name=>transition?.states?.[name],
 rememberState:(name,state)=>states.set(name,state),
 async allowChange(){
  if(hasChanges()){
   const {requestDecision}=await import('./NYX_CONFIRMATION_MODULE');
   const approved=await requestDecision({title:window.NyxI18n.message('language.unsaved-title'),message:window.NyxI18n.message('language.unsaved-body'),action:window.NyxI18n.message('language.discard-switch'),cancelLabel:window.NyxI18n.message('language.keep-editing'),reducesProtection:false});
   if(!approved)return false;tracker.reset();
  }
  rememberFilters();return true;
 },
 recordSuccess(url,method){
  if(!['POST','PUT','PATCH','DELETE'].includes(method))return;
  const path=new URL(url,location.href).pathname;
  if(/\/(?:test|check|rotate|run|ping|refresh)(?:\/|$)/.test(path))return;
  if(/^\/api\/(?:nginx\/|users(?:\/|$)|nyxguard\/(?:settings|rules)|notifications(?:\/|$)|integrations(?:\/|$)|sso(?:\/|$))/.test(path))tracker.reset();
 }
});
restoreFilters();
