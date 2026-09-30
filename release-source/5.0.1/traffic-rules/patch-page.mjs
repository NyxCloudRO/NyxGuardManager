#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = process.argv[2];
if (!root) throw new Error('Usage: node patch-page.mjs FRONTEND_ROOT');
const mainPath = path.join(root, 'assets/index-CTHAIRmi-409dev-4012certfix4-threatpagination3.js');
const pagePath = path.join(root, 'assets/index-DHuZiE1T.js');
const newPagePath = path.join(root, 'assets/index-DHuZiE1T-task2.js');
let main = fs.readFileSync(mainPath, 'utf8');
let page = fs.readFileSync(pagePath, 'utf8');
function replace(text, before, after, count = 1) {
  const found = text.split(before).length - 1;
  if (found !== count) throw new Error(`Traffic Rules patch expected ${count} matches; found ${found}`);
  return text.replaceAll(before, after);
}

const errors = [
  ['ae=m({mutationFn:t=>xe(t.id,{enabled:t.enabled}),onSuccess:()=>a.invalidateQueries({queryKey:["nyxguard","rules","ip"]})})',
   'ae=m({mutationFn:t=>xe(t.id,{enabled:t.enabled}),onSuccess:()=>a.invalidateQueries({queryKey:["nyxguard","rules","ip"]}),onError:t=>S(t instanceof Error?t.message:"Unable to change IP rule.")})'],
  ['se=m({mutationFn:t=>ge(t.id,{enabled:t.enabled}),onSuccess:()=>a.invalidateQueries({queryKey:["nyxguard","rules","country"]})})',
   'se=m({mutationFn:t=>ge(t.id,{enabled:t.enabled}),onSuccess:()=>a.invalidateQueries({queryKey:["nyxguard","rules","country"]}),onError:t=>S(t instanceof Error?t.message:"Unable to change country rule.")})'],
  ['W=m({mutationFn:t=>me(t),onSuccess:()=>a.invalidateQueries({queryKey:["nyxguard","rules","ip"]})})',
   'W=m({mutationFn:t=>me(t),onSuccess:()=>a.invalidateQueries({queryKey:["nyxguard","rules","ip"]}),onError:t=>S(t instanceof Error?t.message:"Unable to delete IP rule.")})'],
  ['Z=m({mutationFn:t=>fe(t),onSuccess:()=>a.invalidateQueries({queryKey:["nyxguard","rules","country"]})})',
   'Z=m({mutationFn:t=>fe(t),onSuccess:()=>a.invalidateQueries({queryKey:["nyxguard","rules","country"]}),onError:t=>S(t instanceof Error?t.message:"Unable to delete country rule.")})'],
];
for (const [before, after] of errors) page = replace(page, before, after);
page = replace(page, '[z,R]=i.useState(null),I=i.useMemo', '[z,R]=i.useState(null),[editing,setEditing]=i.useState(null),I=i.useMemo');
page = replace(page,
  'ae=m({mutationFn:t=>xe(t.id,{enabled:t.enabled})',
  'editIp=m({mutationFn:()=>xe(editing.id,{action:j,ipCidr:b.trim(),note:g.trim()||null}),onSuccess:async()=>{setEditing(null),G(""),B(""),q("IP rule updated"),await a.invalidateQueries({queryKey:["nyxguard","rules","ip"]})},onError:t=>S(t instanceof Error?t.message:"Unable to edit IP rule.")}),editCountry=m({mutationFn:()=>ge(editing.id,{action:j,countryCode:v.trim().toUpperCase(),note:g.trim()||null}),onSuccess:async()=>{setEditing(null),P(""),B(""),q("Country rule updated"),await a.invalidateQueries({queryKey:["nyxguard","rules","country"]})},onError:t=>S(t instanceof Error?t.message:"Unable to edit country rule.")}),ae=m({mutationFn:t=>xe(t.id,{enabled:t.enabled})');
page = replace(page, 'onClick:()=>{k("ip"),L(t=>', 'onClick:()=>{setEditing(null),k("ip"),L(t=>');
page = replace(page, 'onClick:()=>{k("country"),L(t=>', 'onClick:()=>{setEditing(null),k("country"),L(t=>');
page = replace(page, 'children:e.jsx(s,{id:"nyxguard.rules.create-rule"})',
  'children:editing?"Edit Rule":e.jsx(s,{id:"nyxguard.rules.create-rule"})');
page = replace(page, 'className:r.controlBlock,children:[e.jsx("div",{className:r.label,children:e.jsx(s,{id:"duration"})})',
  'className:r.controlBlock,style:editing?{display:"none"}:undefined,children:[e.jsx("div",{className:r.label,children:e.jsx(s,{id:"duration"})})');
page = replace(page,
  'e.jsx("div",{className:r.actions,children:e.jsx("button",{className:r.primary,type:"button",disabled:!!E||U.isPending||V.isPending,onClick:()=>{d==="ip"?U.mutate():V.mutate()},children:e.jsx(s,{id:"nyxguard.rules.save-rule"})})})',
  'e.jsxs("div",{className:r.actions,children:[e.jsx("button",{className:r.primary,type:"button",disabled:!!E||U.isPending||V.isPending||editIp.isPending||editCountry.isPending,onClick:()=>{editing?d==="ip"?editIp.mutate():editCountry.mutate():d==="ip"?U.mutate():V.mutate()},children:editing?"Save Changes":e.jsx(s,{id:"nyxguard.rules.save-rule"})}),editing&&e.jsx("button",{type:"button",className:r.ghost,onClick:()=>{setEditing(null),G(""),P(""),B("")},children:"Cancel"})]})');
page = replace(page, 'onClick:()=>W.mutate(t.id)', 'onClick:()=>{if(window.confirm("Delete this IP rule?"))W.mutate(t.id)}');
page = replace(page, 'onClick:()=>Z.mutate(t.id)', 'onClick:()=>{if(window.confirm("Delete this country rule?"))Z.mutate(t.id)}');
page = replace(page,
  'e.jsx("td",{className:"text-end text-nowrap",children:e.jsx("button",{type:"button",className:r.ghost,disabled:W.isPending,onClick:()=>{if(window.confirm("Delete this IP rule?"))W.mutate(t.id)},children:e.jsx(s,{id:"delete"})})})',
  'e.jsxs("td",{className:"text-end text-nowrap",children:[e.jsx("button",{type:"button",className:r.ghost,onClick:()=>{setEditing({id:t.id,type:"ip"}),k("ip"),Q(t.action),G(t.ipCidr),B(t.note||""),window.scrollTo({top:0,behavior:"smooth"})},children:"Edit"}),e.jsx("button",{type:"button",className:r.ghost,disabled:W.isPending,onClick:()=>{if(window.confirm("Delete this IP rule?"))W.mutate(t.id)},children:e.jsx(s,{id:"delete"})})]})');
page = replace(page,
  'e.jsx("td",{className:"text-end text-nowrap",children:e.jsx("button",{type:"button",className:r.ghost,disabled:Z.isPending,onClick:()=>{if(window.confirm("Delete this country rule?"))Z.mutate(t.id)},children:e.jsx(s,{id:"delete"})})})',
  'e.jsxs("td",{className:"text-end text-nowrap",children:[e.jsx("button",{type:"button",className:r.ghost,onClick:()=>{setEditing({id:t.id,type:"country"}),k("country"),Q(t.action),P(t.countryCode),B(t.note||""),window.scrollTo({top:0,behavior:"smooth"})},children:"Edit"}),e.jsx("button",{type:"button",className:r.ghost,disabled:Z.isPending,onClick:()=>{if(window.confirm("Delete this country rule?"))Z.mutate(t.id)},children:e.jsx(s,{id:"delete"})})]})');
page = replace(page,
  't.expiresOn?new Date(t.expiresOn).toLocaleString():n.formatMessage({id:"nyxguard.rules.never"})',
  't.expiresOn?new Date(t.expiresOn).toLocaleString()+(Date.parse(t.expiresOn)<=Date.now()?" (expired)":""):n.formatMessage({id:"nyxguard.rules.never"})', 2);

main = replace(main, 'index-DHuZiE1T.js', 'index-DHuZiE1T-task2.js', 2);
main = replace(main, '"nyxguard.rules.active-rules":"Active Rules"', '"nyxguard.rules.active-rules":"Rules"', 5);
main = replace(main, '"nyxguard.rules.active-rules":"Reguli Active"', '"nyxguard.rules.active-rules":"Reguli"');
fs.writeFileSync(newPagePath, page);
fs.writeFileSync(mainPath, main);
