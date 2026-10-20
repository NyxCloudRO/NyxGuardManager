import{parse}from'acorn';import{walk,applyEdits}from'./catalogs.mjs';
const helpers=new Set(['r6','_he','zn','qo','CD','N6','X9','F5e','Sa','Ao','Q9']);
export function localizeNetworkFailures(source,name){
 const edits=[],shared=name.startsWith('index-CTHAIRmi-')||name.startsWith('index-BwxhCj6Q-');
 function apiPath(node){return node?.type==='Literal'&&typeof node.value==='string'&&node.value.startsWith('/api/')||node?.type==='BinaryExpression'&&node.operator==='+'&&apiPath(node.left);}
 walk(parse(source,{ecmaVersion:'latest',sourceType:'module'}),(node,anc)=>{
  if(node.type!=='CallExpression'||node.callee.name!=='fetch')return;
  const fn=anc.findLast(p=>p.type==='FunctionDeclaration');if(!apiPath(node.arguments[0])&&!(shared&&helpers.has(fn?.id?.name)))return;
  edits.push({start:node.end,end:node.end,value:'.catch(error=>{if(window.NyxI18n)window.NyxI18n.networkError(error);throw error;})'});
 });
 return applyEdits(source,edits);
}
