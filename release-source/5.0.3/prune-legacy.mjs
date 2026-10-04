// Build-only removal of audited, unused product surfaces. Shared services and
// historical models/schema/templates remain unchanged.
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
const require = createRequire(process.env.NYX_BUILD_TOOLS + '/package.json');
const {parse} = require('acorn');
const postcss = require('postcss');
const root = process.argv[2];
if (!root || !fs.existsSync(path.join(root, 'package.json'))) throw Error('Expected materialized application');
const assets = path.join(root, 'frontend/assets');
const mainName = 'index-CTHAIRmi-409dev-4012certfix4-threatpagination3.js';
const mainPath = path.join(assets, mainName);
const pages = ['index-BwmR1P0q.js', 'index-CAsSRkcc.js', 'index-DQuC1pRs.js'];
const routes = ['/nyxguard/redirection','/nyxguard/404','/nyxguard/stream','/nginx/redirection','/nginx/404','/nginx/stream'];
const manifest = {removedRoutes:routes, removedFiles:[], removedBindings:[], removedExports:[], removedCssSelectors:[], retained:'Shared certificate/host/report services, models, schema, migrations, nginx templates, permission and historical audit compatibility'};
let code = fs.readFileSync(mainPath,'utf8');
for (const route of routes) {
 const quoted = JSON.stringify(route).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
 const pattern = new RegExp('g\\.jsx\\(fn,\\{path:'+quoted+',element:g\\.jsx\\([^]*?\\)\\}\\),','g');
 const hits = [...code.matchAll(pattern)];
 if(hits.length!==1) throw Error('Route removal mismatch: '+route);
 code = code.replace(pattern,'');
}
const walk = (node, fn) => {if(!node || typeof node!=='object')return; if(node.type)fn(node); for(const [key,value] of Object.entries(node))if(key!=='start'&&key!=='end'){if(Array.isArray(value))for(const item of value)walk(item,fn);else if(value&&typeof value==='object')walk(value,fn);}};
const ast = parse(code,{ecmaVersion:'latest',sourceType:'module'});
const bindings = new Map();
for(const statement of ast.body){
 if(statement.type==='VariableDeclaration')for(const declaration of statement.declarations){if(declaration.id.type==='Identifier')bindings.set(declaration.id.name,{node:declaration,statement,body:declaration.init});}
 else if(['FunctionDeclaration','ClassDeclaration'].includes(statement.type)&&statement.id)bindings.set(statement.id.name,{node:statement,statement,body:statement});
}
const patternNames = (node, names) => {if(!node)return;if(node.type==='Identifier')names.add(node.name);else if(node.type==='RestElement')patternNames(node.argument,names);else if(node.type==='AssignmentPattern')patternNames(node.left,names);else if(node.type==='ArrayPattern')for(const item of node.elements)patternNames(item,names);else if(node.type==='ObjectPattern')for(const property of node.properties)patternNames(property.type==='RestElement'?property.argument:property.value,names);};
const references = node => {
 const out=new Set();
 function visit(n, scopes=[], parent=null, key=''){
  if(!n||typeof n!=='object')return;
  if(n.type==='Identifier'){
   if(parent && ((['MemberExpression','PropertyDefinition','MethodDefinition'].includes(parent.type)&&key==='property'&&!parent.computed)||(parent.type==='Property'&&key==='key'&&!parent.computed)||['LabeledStatement','BreakStatement','ContinueStatement'].includes(parent.type)))return;
   if(bindings.has(n.name)&&!scopes.some(s=>s.has(n.name)))out.add(n.name);return;
  }
  if(['FunctionDeclaration','FunctionExpression','ArrowFunctionExpression'].includes(n.type)){
   const local=new Set();if(n.id)local.add(n.id.name);for(const parameter of n.params)patternNames(parameter,local);
   const hoist=v=>{if(!v||typeof v!=='object')return;if(v!==n.body&&['FunctionDeclaration','FunctionExpression','ArrowFunctionExpression'].includes(v.type))return;if(v.type==='VariableDeclaration'&&v.kind==='var')for(const d of v.declarations)patternNames(d.id,local);for(const value of Object.values(v))if(Array.isArray(value))value.forEach(hoist);else if(value&&typeof value==='object')hoist(value);};hoist(n.body);
   const next=[...scopes,local];for(const parameter of n.params)if(parameter.type==='AssignmentPattern')visit(parameter.right,next,parameter,'right');visit(n.body,next,n,'body');return;
  }
  if(n.type==='BlockStatement'){
   const local=new Set();for(const statement of n.body){if(statement.type==='VariableDeclaration'&&statement.kind!=='var')for(const d of statement.declarations)patternNames(d.id,local);else if(['FunctionDeclaration','ClassDeclaration'].includes(statement.type)&&statement.id)local.add(statement.id.name);}
   for(const statement of n.body)visit(statement,[...scopes,local],n,'body');return;
  }
  if(n.type==='VariableDeclarator'){visit(n.init,scopes,n,'init');return;}
  if(n.type==='CatchClause'){const local=new Set();patternNames(n.param,local);visit(n.body,[...scopes,local],n,'body');return;}
  for(const [childKey,value]of Object.entries(n)){if(['start','end','id'].includes(childKey))continue;if(Array.isArray(value))for(const child of value)visit(child,scopes,n,childKey);else if(value&&typeof value==='object')visit(value,scopes,n,childKey);}
 }
 visit(node);return out;
};
const deps = new Map([...bindings].map(([name,b])=>[name,references(b.body)]));
const deadRoots = ['lhe','uhe','che','Ihe','$he','Che','Fhe','Rhe','Zhe','wge','Aue','Mge'];
for(const name of deadRoots)if(!bindings.has(name))throw Error('Missing audited binding '+name);
// Only imports from surviving chunks determine which bundled exports remain needed.
const usedExports = new Set();
const staleBoot = ['index-CTHAIRmi.js','index-CTHAIRmi-408dev.js','index-CTHAIRmi-409dev.js','index-CTHAIRmi-409dev-4012certfix4.js'];
const retainedFiles = fs.readdirSync(assets).filter(f=>f.endsWith('.js')&&f!==mainName&&!pages.includes(f)&&!staleBoot.includes(f));
for(const file of retainedFiles){const source=fs.readFileSync(path.join(assets,file),'utf8');const tree=parse(source,{ecmaVersion:'latest',sourceType:'module'});for(const statement of tree.body)if(statement.type==='ImportDeclaration'&&statement.source.value.endsWith('/'+mainName)){for(const spec of statement.specifiers){if(spec.type==='ImportNamespaceSpecifier')throw Error('Namespace import requires manual review');if(spec.type==='ImportSpecifier')usedExports.add(spec.imported.name);}}}
const exportBindings = new Map();
for(const statement of ast.body)if(statement.type==='ExportNamedDeclaration')for(const spec of statement.specifiers)exportBindings.set(spec.exported.name,spec.local.name);
const deadPageImports = new Set();
for(const file of pages){const tree=parse(fs.readFileSync(path.join(assets,file),'utf8'),{ecmaVersion:'latest',sourceType:'module'});for(const statement of tree.body)if(statement.type==='ImportDeclaration'&&statement.source.value.endsWith('/'+mainName))for(const spec of statement.specifiers)if(spec.type==='ImportSpecifier'&&!usedExports.has(spec.imported.name))deadPageImports.add(exportBindings.get(spec.imported.name));}
const candidate = new Set();
function collect(name){if(candidate.has(name))return;candidate.add(name);for(const dep of deps.get(name)||[])collect(dep);}
for(const name of [...deadRoots,...deadPageImports])if(name)collect(name);
const keep = new Set();
for(const statement of ast.body){
 if(statement.type==='ExportNamedDeclaration')for(const spec of statement.specifiers){if(usedExports.has(spec.exported.name))keep.add(spec.local.name);}
 else if(!['VariableDeclaration','FunctionDeclaration','ClassDeclaration','ImportDeclaration'].includes(statement.type))for(const ref of references(statement))keep.add(ref);
}
for(const [name,b]of bindings){if(!candidate.has(name))keep.add(name);else if(b.node.type==='VariableDeclarator'&&!deadRoots.includes(name)&&b.body&&!['ArrowFunctionExpression','FunctionExpression','ObjectExpression','ArrayExpression','Literal','Identifier'].includes(b.body.type))keep.add(name);}
const queue=[...keep];for(let i=0;i<queue.length;i++)for(const dep of deps.get(queue[i])||[])if(!keep.has(dep)){keep.add(dep);queue.push(dep);}
const removed=new Set([...candidate].filter(n=>!keep.has(n)));
for(const name of deadRoots)if(!removed.has(name))throw Error('Audited legacy binding still used: '+name);
manifest.removedBindings=[...removed].sort();
const removedClasses = new Set();
for(const name of removed){const b=bindings.get(name);if(b.body?.type==='ObjectExpression')for(const property of b.body.properties)if(property.value?.type==='Literal'&&typeof property.value.value==='string'&&/^_[a-zA-Z]/.test(property.value.value))removedClasses.add(property.value.value);}
const edits=[];
for(const statement of ast.body){
 if(statement.type==='VariableDeclaration'){const selected=statement.declarations.filter(d=>!removed.has(d.id.name));if(selected.length!==statement.declarations.length)edits.push([statement.start,statement.end,selected.length?statement.kind+' '+selected.map(d=>code.slice(d.start,d.end)).join(',')+';':'']);}
 else if(['FunctionDeclaration','ClassDeclaration'].includes(statement.type)&&removed.has(statement.id?.name))edits.push([statement.start,statement.end,'']);
 else if(statement.type==='ExportNamedDeclaration'){const selected=statement.specifiers.filter(s=>!removed.has(s.local.name));for(const spec of statement.specifiers)if(removed.has(spec.local.name))manifest.removedExports.push(spec.exported.name);if(selected.length!==statement.specifiers.length)edits.push([statement.start,statement.end,'export{'+selected.map(s=>code.slice(s.start,s.end)).join(',')+'};']);}
}
for(const [start,end,replacement]of edits.sort((a,b)=>b[0]-a[0]))code=code.slice(0,start)+replacement+code.slice(end);
const fallback=retainedFiles.find(f=>f.startsWith('TableLayout-'));
if(!fallback)throw Error('Missing shared layout');
for(const page of pages)code=code.replaceAll('assets/'+page,'assets/'+fallback); // preserve dependency-map indices
const finalTree=parse(code,{ecmaVersion:'latest',sourceType:'module'});
const finalExports=new Set(finalTree.body.filter(n=>n.type==='ExportNamedDeclaration').flatMap(n=>n.specifiers.map(s=>s.exported.name)));
for(const name of usedExports)if(!finalExports.has(name))throw Error('Active import lost: '+name);
for(const url of ['/nginx/redirection-hosts','/nginx/dead-hosts','/nginx/streams'])if(code.includes(url))throw Error('Legacy client remains: '+url);
fs.writeFileSync(mainPath,code);
for(const file of [...pages,...staleBoot]){
 const otherSources=[fs.readFileSync(path.join(root,'frontend/index.html'),'utf8'),code,...retainedFiles.map(f=>fs.readFileSync(path.join(assets,f),'utf8'))];
 if(otherSources.some(s=>s.includes(file)))throw Error('Unexpected remaining consumer: '+file);
 fs.unlinkSync(path.join(assets,file));manifest.removedFiles.push('frontend/assets/'+file);
}
const survivingSources=[code,...retainedFiles.map(f=>fs.readFileSync(path.join(assets,f),'utf8'))].join('\n');
for(const cls of [...removedClasses])if(survivingSources.includes(cls))removedClasses.delete(cls);
for(const file of fs.readdirSync(assets).filter(f=>f.endsWith('.css'))){const target=path.join(assets,file);const tree=postcss.parse(fs.readFileSync(target,'utf8'),{from:target});let changed=false;tree.walkRules(rule=>{const selectors=postcss.list.comma(rule.selector);const kept=selectors.filter(s=>![...removedClasses].some(cls=>s.includes('.'+cls)));if(kept.length!==selectors.length){manifest.removedCssSelectors.push(...selectors.filter(s=>!kept.includes(s)));changed=true;if(kept.length)rule.selector=kept.join(',');else rule.remove();}});if(changed)fs.writeFileSync(target,tree.toString());}
let backend=fs.readFileSync(path.join(root,'routes/main.js'),'utf8');
for(const [binding,file,url]of [['redirectionHostsRoutes','redirection_hosts','redirection-hosts'],['deadHostsRoutes','dead_hosts','dead-hosts'],['streamsRoutes','streams','streams']]){
 for(const line of [`import ${binding} from "./nginx/${file}.js";`,`router.use("/nginx/${url}", ${binding});`]){if(backend.split(line).length!==2)throw Error('Backend removal mismatch '+line);backend=backend.replace(line+'\n','');}
 fs.unlinkSync(path.join(root,'routes/nginx',file+'.js'));manifest.removedFiles.push('routes/nginx/'+file+'.js');
}
fs.writeFileSync(path.join(root,'routes/main.js'),backend);
fs.writeFileSync(path.join(root,'nyxguard-legacy-removal.json'),JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify({removedFiles:manifest.removedFiles.length,removedBindings:removed.size,removedCssSelectors:manifest.removedCssSelectors.length}));
