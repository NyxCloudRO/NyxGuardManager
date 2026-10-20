import {parse} from 'acorn';
export const languages=['en','es','fr','de','it','ro'];
export function walk(node,visit,ancestors=[]) {
 if(!node || typeof node!=='object') return;
 if(node.type)visit(node,ancestors);
 for(const [key,value] of Object.entries(node)) {
  if(['start','end','loc'].includes(key))continue;
  if(Array.isArray(value))for(const child of value)walk(child,visit,[...ancestors,node]);
  else if(value?.type)walk(value,visit,[...ancestors,node]);
 }
}
export function readCatalogs(source){
 const ast=parse(source,{ecmaVersion:'latest',sourceType:'module'}),bindings=new Map(),duplicates=[];
 for(const node of ast.body)if(node.type==='VariableDeclaration')for(const d of node.declarations)if(d.id.type==='Identifier')bindings.set(d.id.name,d.init);
 function literal(node,seen=new Set()){
  if(!node)throw Error('Missing catalog initializer');
  if(node.type==='Literal')return node.value;
  if(node.type==='TemplateLiteral'&&!node.expressions.length)return node.quasis[0].value.cooked;
  if(node.type==='Identifier') {if(seen.has(node.name))throw Error('Circular catalog');return literal(bindings.get(node.name),new Set([...seen,node.name]));}
  if(node.type==='ObjectExpression') {
   const result={};for(const p of node.properties){if(p.type!=='Property'||p.computed)throw Error('Nonliteral catalog property');const key=p.key.name??p.key.value;if(Object.hasOwn(result,key))duplicates.push(key);result[key]=literal(p.value,seen);}return result;
  }
  if(node.type==='ArrayExpression')return node.elements.map(n=>literal(n,seen));
  throw Error('Dynamic catalog rejected: '+node.type);
 }
 let optionsNode=bindings.get('pv');
 if(!optionsNode)optionsNode=[...bindings.values()].find(n=>n?.type==='ArrayExpression'&&n.elements.length===6&&n.elements.every(e=>e?.type==='ObjectExpression'&&e.properties.some(p=>(p.key.name??p.key.value)==='code'&&languages.includes(p.value.value))));
 const options=literal(optionsNode);
 if(options.length!==6 || languages.some(l=>!options.some(o=>o.code===l)))throw Error('Supported language catalog changed');
 const optionNodes=optionsNode.elements;
 const catalogs={},nodes={};for(let i=0;i<options.length;i++){
  const language=options[i].code;
  const ref=optionNodes[i].properties.find(p=>(p.key.name??p.key.value)==='messages').value;
  if(ref.type!=='Identifier')throw Error('Catalog binding changed');
  nodes[language]=bindings.get(ref.name);catalogs[language]=literal(nodes[language]);
 }
 const sharedNode=bindings.get('zC')??[...bindings.values()].find(n=>n?.type==='ObjectExpression'&&n.properties.some(p=>(p.key.name??p.key.value)==='locale-de-DE')&&n.properties.some(p=>(p.key.name??p.key.value)==='settings.grafana.overview-body'));
 return {ast,catalogs,nodes,shared:sharedNode?literal(sharedNode):{},options,duplicates};
}
export function applyEdits(source,edits){
 let last=source.length;for(const {start,end,value} of [...edits].sort((a,b)=>b.start-a.start)){
  if(end>last)throw Error('Overlapping localization edits');source=source.slice(0,start)+value+source.slice(end);last=start;
 }return source;
}
export function coverage(catalogs,shared={}){
 const required=[...new Set([...Object.keys(shared),...Object.keys(catalogs.en)])].sort();
 return {requiredKeys:required,languages:Object.fromEntries(languages.map(l=>{
  const effective={...shared,...catalogs[l]},missing=required.filter(k=>!Object.hasOwn(effective,k)),invalid=required.filter(k=>Object.hasOwn(effective,k)&&(typeof effective[k]!=='string'||!effective[k].trim()));
  return [l,{implemented:required.length-missing.length-invalid.length,missing,invalid,equalToEnglish:l==='en'?[]:required.filter(k=>effective[k]===({...shared,...catalogs.en})[k])}];
 }))};
}
