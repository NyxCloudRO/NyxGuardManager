import {parse}from'acorn';
import {walk,applyEdits}from'../task2/catalogs.mjs';
const retired=new Set(['AccessLists','Certificates','ProxyHosts']);
export function removeLegacyHelp(source){
 const ast=parse(source,{ecmaVersion:'latest',sourceType:'module'}),edits=[],removed=[],candidates=new Set();
 walk(ast,(node,anc)=>{
  if(node.type!=='Property'||node.key.name!=='onClick'||node.value.type!=='ArrowFunctionExpression')return;
  const body=node.value.body;if(body.type!=='CallExpression'||!retired.has(body.arguments[0]?.value))return;
  const jsx=anc.at(-2);if(jsx?.type!=='CallExpression'||jsx.arguments[1]!==anc.at(-1))throw Error('Legacy Help control structure changed');
  walk(jsx,n=>{if(n.type==='Identifier')candidates.add(n.name)});edits.push({start:jsx.start,end:jsx.end,value:'null'});removed.push({section:body.arguments[0].value,handler:body.callee.name});
 });
 if(!edits.length)return {source,removed,unusedImports:[]};
 source=applyEdits(source,edits);const next=parse(source,{ecmaVersion:'latest',sourceType:'module'}),references=new Set(),unusedImports=[];
 walk(next,(node,anc)=>{
  if(node.type!=='Identifier'||anc.some(a=>a.type==='ImportDeclaration'))return;
  const parent=anc.at(-1);
  if(parent?.type==='MemberExpression'&&parent.property===node&&!parent.computed)return;
  if(parent?.type==='Property'&&parent.key===node&&!parent.computed&&!parent.shorthand)return;
  references.add(node.name);
 });
 const imports=[];
 for(const node of next.body.filter(n=>n.type==='ImportDeclaration'&&n.specifiers.length)){
  const keep=node.specifiers.filter(s=>references.has(s.local.name)||!candidates.has(s.local.name));
  for(const spec of node.specifiers)if(!keep.includes(spec))unusedImports.push(spec.local.name);
  if(keep.length===node.specifiers.length)continue;
  const named=keep.filter(s=>s.type==='ImportSpecifier'),other=keep.filter(s=>s.type!=='ImportSpecifier');
  const clause=[...other.map(s=>s.type==='ImportDefaultSpecifier'?s.local.name:'* as '+s.local.name),...(named.length?['{'+named.map(s=>(s.imported.name??JSON.stringify(s.imported.value))+(s.local.name!==s.imported.name?' as '+s.local.name:'')).join(',')+'}']:[])].join(',');
  imports.push({start:node.start,end:node.end,value:keep.length?'import '+clause+' from '+JSON.stringify(node.source.value)+';':''});
 }
 source=applyEdits(source,imports);parse(source,{ecmaVersion:'latest',sourceType:'module'});return {source,removed,unusedImports};
}
