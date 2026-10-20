import{parse}from'acorn';import{walk,applyEdits}from'./catalogs.mjs';import{createHash}from'node:crypto';
export function markFilters(source,name){
 const ast=parse(source,{ecmaVersion:'latest',sourceType:'module'}),edits=[],seen=new Set();
 walk(ast,(node)=>{
  if(node.type!=='CallExpression')return;
  const callee=node.callee.property?.name??node.callee.name;
  if(!['jsx','jsxs','createElement','h'].includes(callee)||!['input','select','textarea'].includes(node.arguments[0]?.value))return;
  const props=node.arguments[1];if(props?.type!=='ObjectExpression'||seen.has(props.start))return;
  if(props.properties.some(p=>['data-nyx-filter-field','nyxMutation'].includes(p.key?.name??p.key?.value)))return;
  let search=props.properties.some(p=>(p.key?.name??p.key?.value)==='type'&&p.value.value==='search');
  for(const prop of props.properties){if(!['placeholder','aria-label','ariaLabel'].includes(prop.key?.name??prop.key?.value))continue;walk(prop.value,n=>{if(n.type==='Literal'&&typeof n.value==='string'&&(/(?:^|[.\-])(?:search|filter)(?:[.\-]|$)/.test(n.value)||/^Search(?:\s|…|$)/.test(n.value)))search=true;});}
  if(search){seen.add(props.start);const id=createHash('sha256').update(name+':'+props.start).digest('hex').slice(0,16);edits.push({start:props.start+1,end:props.start+1,value:'"data-nyx-filter-field":'+JSON.stringify(id)+','});}
 });return applyEdits(source,edits);
}
