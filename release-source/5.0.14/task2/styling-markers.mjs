import{parse}from'acorn';import{walk,applyEdits}from'./catalogs.mjs';
const pillLabels=new Set('APPLY|UPLOAD|SAVE|RESET|REFRESH|INSPECT IPS|ADD APP|VIEW ALL APPS|ADD IP RULE|VIEW ALL RULES|ADD COUNTRY RULE|MANAGE RULES|OPEN GLOBALGATE|VIEW LIVE STREAM|EXPORT EVENTS|EXPORT JSON|CLEAR LOGS|CREATE|CREATE RULE|ADD|ADD RULE|DELETE|DELETE ALL|DISMISS|CANCEL'.split('|'));
const actionCodes={'CLEAR LOGS':'clear-logs','SAVE GLOBALGATE SETTINGS':'save-globalgate','ADD RULE':'add-rule','SAVE RULE':'save-rule',CANCEL:'cancel','DELETE ALL':'delete-all'};
export function markPresentationActions(source,name,english){
 const edits=[];
 const property=(node,key)=>node?.type==='ObjectExpression'?node.properties.find(p=>p.type==='Property'&&(p.key.name??p.key.value)===key)?.value:undefined;
 function labels(node){
  if(!node)return[''];
  if(node.type==='Literal')return typeof node.value==='string'||typeof node.value==='number'?[String(node.value)]:[''];
  if(node.type==='ConditionalExpression')return[...labels(node.consequent),...labels(node.alternate)];
  if(node.type==='LogicalExpression')return labels(node.right);
  if(node.type==='ArrayExpression')return node.elements.reduce((out,item)=>out.flatMap(prefix=>labels(item).map(text=>(prefix+' '+text).trim())).slice(0,8),['']);
  if(node.type==='CallExpression'){
   const method=node.callee.property?.name;
   if(method==='formatMessage'){const id=property(node.arguments[0],'id');return id?.type==='Literal'&&english[id.value]?[english[id.value]]:[''];}
   const props=node.arguments.find(arg=>arg?.type==='ObjectExpression');if(props){const id=property(props,'id');if(id?.type==='Literal'&&english[id.value])return[english[id.value]];const child=property(props,'children');if(child)return labels(child);}
   if(method==='createElement')return labels({type:'ArrayExpression',elements:node.arguments.slice(2)});
  }
  return[''];
 }
 walk(parse(source,{ecmaVersion:'latest',sourceType:'module'}),(node,anc)=>{
  if(node.type!=='ObjectExpression'||!property(node,'children'))return;
  const call=anc.at(-1);if(call?.type!=='CallExpression')return;
  const texts=labels(property(node,'children')).map(s=>s.replace(/^\+\s*/,'').replace(/\s+/g,' ').trim().toUpperCase());
  const values={};if(texts.some(s=>pillLabels.has(s)))values['data-nyx-pill-action']=true;
  const code=texts.map(s=>actionCodes[s]).find(Boolean);if(code)values['data-nyx-style-action']=code;
  if(texts.some(s=>s==='50'||s==='100'))values['data-nyx-row-count']=true;
  if(Object.keys(values).length)edits.push({start:node.start+1,end:node.start+1,value:Object.entries(values).map(([key,value])=>JSON.stringify(key)+':'+JSON.stringify(value)+',').join('')});
 });
 source=applyEdits(source,edits);
 if(name.startsWith('index-CP-DF6LG-')){
  const old='className:s.sectionCard,children:[e.jsx("h3",{className:s.sectionTitle,children:e.jsx(n,{id:"nyxguard.section.globalgate"})})';if(!source.includes(old))throw Error('GlobalGate summary prerequisite changed');source=source.replace(old,old.replace('className:s.sectionCard,','className:s.sectionCard,"data-nyx-globalgate-summary":true,'));
 }
 if(name.startsWith('local-dev-fixes-')){
  const functions={markControlMatrixActions:`function markControlMatrixActions(){
   document.querySelectorAll("#advanced-table-search").forEach(input=>{input.parentElement?.classList.add("nyx-table-search-field");input.closest(".btn-list")?.classList.add("nyx-users-header-actions")});
   document.querySelectorAll('button,a,[role="button"]').forEach(button=>{
    if(button.closest('[data-nyx-managed-controls]'))return;
    const action=button.dataset.nyxStyleAction,parent=button.parentElement;
    if(button.hasAttribute('data-nyx-pill-action'))button.classList.add('nyx-app-action-pill');
    if(action==='clear-logs')button.classList.add('nyx-live-clear-logs');
    if(button.hasAttribute('data-nyx-row-count')){button.classList.add('nyx-live-row-pill');parent?.classList.add('nyx-live-row-controls')}
    if(['save-globalgate','add-rule','save-rule'].includes(action))button.classList.add('nyx-control-matrix-action');
    if(action==='save-rule'){
     if(parent?.querySelector('[data-nyx-style-action="cancel"]')){button.classList.remove('nyx-traffic-rule-action','nyx-traffic-save-rule-action');button.classList.add('nyx-app-action-pill');parent.classList.add('nyx-rule-form-actions')}
     else{button.classList.add('nyx-traffic-rule-action','nyx-traffic-save-rule-action');parent?.classList.add('nyx-traffic-rule-action-slot','nyx-traffic-save-rule-action-slot')}
    }
    if(action==='cancel'&&parent?.querySelector('[data-nyx-style-action="save-rule"]'))parent.classList.add('nyx-rule-form-actions');
    if(action==='delete-all'){button.classList.add('nyx-traffic-rule-action','nyx-traffic-delete-rule-action');parent?.classList.add('nyx-traffic-rule-action-slot','nyx-traffic-delete-rule-action-slot')}
    button.classList.toggle('nyx-toggle-on-active',button.getAttribute('aria-pressed')==='true'||button.getAttribute('aria-checked')==='true');
   });
  }`,enhanceMainGlobalGatePills:`function enhanceMainGlobalGatePills(){
   document.querySelectorAll('[data-nyx-globalgate-summary] [class*="_pillOn_"],[data-nyx-globalgate-summary] [class*="_pillOff_"]').forEach(node=>{const on=node.className.includes('_pillOn_');node.classList.toggle('nyx-main-globalgate-pill-on',on);node.classList.toggle('nyx-main-globalgate-pill-off',!on);if(!on)node.classList.remove('nyx-toggle-on-active')});
  }`};
  const replacements=[];walk(parse(source,{ecmaVersion:'latest',sourceType:'module'}),node=>{if(node.type==='FunctionDeclaration'&&functions[node.id?.name]){replacements.push({start:node.start,end:node.end,value:functions[node.id.name]});delete functions[node.id.name]}});if(Object.keys(functions).length)throw Error('Missing action-style prerequisites');source=applyEdits(source,replacements);
 }
 return source;
}
