import {parse}from'acorn';
import {walk,applyEdits}from'./catalogs.mjs';
// Deliberately bounded to three reviewed legacy panels. Selectors, actions, object keys,
// protocol values and comparisons stay machine-readable. API payloads are never translated.
export function patchImperative(source,reverse,{htmlOnly=false}={}){
 const edits=[],records=[];
 const forbiddenCalls=new Set(['querySelector','querySelectorAll','getElementById','get','getItem','setItem','includes','indexOf','replace','replaceAll','add','remove','toggle','addEventListener','setProperty','matches','closest','nyxVpnCount']);
 const translate=s=>`window.NyxI18n.message(${JSON.stringify(reverse[s])})`;
 function markup(s){
  const changes=[];
  // Literal template text only. Escape translated text before HTML construction.
  const pattern=/(?<=>)([^<>]+)(?=<|$)|(?:aria-label|title|placeholder)=(['"])([^'"]+)\2/g;
  for(const match of s.matchAll(pattern)){
   const value=match[1]??match[3],trimmed=value.trim(),decoded=trimmed.replaceAll('&amp;','&').replaceAll('&lt;','<').replaceAll('&gt;','>').replaceAll('&quot;','"').replaceAll('&#39;',"'");if(!reverse[decoded])continue;
   const start=match.index+(match[1]===undefined?match[0].indexOf(value):0)+value.indexOf(trimmed);
   changes.push({text:decoded,start,end:start+trimmed.length});
  }
  if(!changes.length)return null;
  // Edits use decoded offsets; quote literal chunks independently to prevent injection.
  let last=0;const parts=[];for(const change of changes){parts.push(JSON.stringify(s.slice(last,change.start)),`window.NyxI18n.escape(${translate(change.text)})`);last=change.end;}parts.push(JSON.stringify(s.slice(last)));return '('+parts.join('+')+')';
 }
 const ast=parse(source,{ecmaVersion:'latest',sourceType:'module'});
 walk(ast,(node,anc)=>{
  if(node.type!=='Literal'||typeof node.value!=='string')return;
  const parent=anc.at(-1);
  if(anc.some(a=>a.type==='VariableDeclarator'&&a.id?.name==='paragraphs'))return;
  if(parent?.type==='Property'&&parent.key===node)return;
  if(anc.some(a=>['ImportDeclaration','ExportNamedDeclaration'].includes(a.type)))return;
  if(anc.some(a=>a.type==='CallExpression'&&a.callee.type==='MemberExpression'&&source.slice(a.callee.object.start,a.callee.object.end)==='window.NyxI18n'&&['t','message','formatMessage','errorMessage','apiError'].includes(a.callee.property.name)))return;
  if(parent?.type==='BinaryExpression'&&['===','!==','==','!='].includes(parent.operator))return;
  const call=[...anc].reverse().find(a=>a.type==='CallExpression');
  const method=call?.callee?.type==='MemberExpression'?call.callee.property.name:call?.callee?.type==='Identifier'?call.callee.name:null;
  if(forbiddenCalls.has(method))return;
  if(method==='setAttribute'&&!['aria-label','title','placeholder'].includes(call.arguments[0]?.value))return;
  if(node.value==='VPN Client'&&parent?.type==='ArrayExpression'&&anc.some(a=>a.type==='CallExpression'&&a.callee.property?.name==='includes'))return;
  let value;if(!htmlOnly&&reverse[node.value])value=translate(node.value);else if(node.value.includes('<')&&node.value.includes('>'))value=markup(node.value);
  if(value){edits.push({start:node.start,end:node.end,value});records.push({source:node.value});}
 });
 return {source:applyEdits(source,edits),records};
}
