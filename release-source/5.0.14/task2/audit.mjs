import fs from'node:fs';import path from'node:path';import{parse}from'acorn';import{walk,readCatalogs,coverage}from'./catalogs.mjs';
const frontend=process.argv[2],output=process.argv[3];if(!frontend||!output)throw Error('Usage: node audit.mjs FRONTEND OUTPUT');
const assets=path.join(frontend,'assets'),files=fs.readdirSync(assets).filter(n=>n.endsWith('.js')),sources=Object.fromEntries(files.map(n=>[n,fs.readFileSync(path.join(assets,n),'utf8')]));
const html=fs.readFileSync(path.join(frontend,'index.html'),'utf8'),active=new Set(files.filter(n=>html.includes(n))),queue=[...active];
while(queue.length){const source=sources[queue.shift()];for(const name of files)if(source.includes(name)&&!active.has(name)){active.add(name);queue.push(name)}}
const main=files.find(n=>n.startsWith('index-CTHAIRmi-409dev-4012certfix4-')),base=readCatalogs(sources[main]),used=new Set(),dynamic=[],hardcoded=[],parseErrors=[];
const ranges=Object.values(base.nodes).map(n=>[n.start,n.end]);
const human=s=>typeof s==='string'&&/[A-Za-z]{2}/.test(s)&&s.length<3000&&!/^(?:https?:|[.#/]|--|data-|aria-|application\/|text\/|image\/)/.test(s);
function literals(n,fn){if(!n)return;if(n.type==='Literal')fn(n);else if(n.type==='TemplateLiteral'&&!n.expressions.length)fn({...n,value:n.quasis[0].value.cooked});else if(n.type==='ArrayExpression')n.elements.forEach(n=>literals(n,fn));else if(n.type==='ConditionalExpression'){literals(n.consequent,fn);literals(n.alternate,fn)}else if(n.type==='LogicalExpression')literals(n.right,fn);}
for(const name of files){
 let ast;try{ast=parse(sources[name],{ecmaVersion:'latest',sourceType:'module'})}catch(e){parseErrors.push({file:name,error:String(e)});continue}
 walk(ast,(n,anc)=>{
  if(name===main&&ranges.some(([start,end])=>n.start>=start&&n.end<=end))return;
  if(n.type==='Property'){
   const key=n.key.name??n.key.value;
   if(key==='id')literals(n.value,l=>{if(typeof l.value==='string'&&Object.hasOwn(base.catalogs.en,l.value))used.add(l.value)});
   if(['children','title','placeholder','aria-label','aria-description','label','defaultMessage'].includes(key)){
    const call=anc.at(-2),jsx=call?.type==='CallExpression'&&['jsx','jsxs'].includes(call.callee.property?.name);
    if(key!=='children'||jsx)literals(n.value,l=>{if(human(l.value))hardcoded.push({file:name,offset:l.start,source:l.value,context:key,active:active.has(name)})});
   }
  }
  if(n.type==='AssignmentExpression'&&['textContent','innerText','innerHTML','title','placeholder'].includes(n.left.property?.name))literals(n.right,l=>{if(human(l.value))hardcoded.push({file:name,offset:l.start,source:l.value,context:n.left.property.name,active:active.has(name)})});
  if(n.type==='NewExpression'&&n.callee.name==='Error')literals(n.arguments[0],l=>{if(human(l.value))hardcoded.push({file:name,offset:l.start,source:l.value,context:'error',active:active.has(name)})});
  if(n.type==='TemplateLiteral'&&n.expressions.length&&n.quasis.some(q=>human(q.value.cooked)))dynamic.push({file:name,offset:n.start,source:sources[name].slice(n.start,n.end),active:active.has(name)});
  if(n.type==='CallExpression'&&['formatMessage','message'].includes(n.callee.property?.name)){
   const first=n.arguments[0];if(first?.type==='Literal')used.add(first.value);
   else if(first?.type==='ObjectExpression'){const id=first.properties.find(p=>(p.key?.name??p.key?.value)==='id');if(id)literals(id.value,n=>{if(typeof n.value==='string')used.add(n.value)});}
  }
 });
}
const report={method:'Static AST inventory; candidate strings require context review. Dynamic identifiers, imported library strings and external technical details are not automatically defects.',supportedLanguages:base.options,catalogs:coverage(base.catalogs,base.shared),duplicateCatalogKeys:base.duplicates,files:{total:files.length,active:[...active].sort(),unreferenced:files.filter(n=>!active.has(n))},requiredStaticReferences:[...used].sort(),missingStaticReferences:[...used].filter(id=>!Object.hasOwn(base.catalogs.en,id)&&!Object.hasOwn(base.shared,id)),possiblyUnusedKeys:Object.keys(base.catalogs.en).filter(id=>!used.has(id)),hardcodedCandidates:hardcoded,dynamicCandidates:dynamic,parseErrors};
fs.writeFileSync(output,JSON.stringify(report,null,2));console.log(JSON.stringify({files:files.length,active:active.size,catalogKeys:report.catalogs.requiredKeys.length,hardcodedCandidates:hardcoded.filter(r=>r.active).length,dynamicCandidates:dynamic.filter(r=>r.active).length,parseErrors:parseErrors.length,missingStaticReferences:report.missingStaticReferences}));
