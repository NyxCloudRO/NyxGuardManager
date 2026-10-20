import fs from'node:fs';import{parse}from'acorn';import{walk,applyEdits}from'./catalogs.mjs';
const phrases=JSON.parse(fs.readFileSync(new URL('./presentation.json',import.meta.url),'utf8'));
const ids=new Map(phrases.map(p=>[p.en,p.id]));
const patterns=new Map([
 ['Authorization {value} username',['Authorization {number, number} username','number']],
 ['Authorization {value} password',['Authorization {number, number} password','number']],
 ['Location {value} path',['Location {number, number} path','number']],
 ['Remove rule {value}',['Remove rule {number, number}','number']],
 ['Remove authorization {value}',['Remove authorization {number, number}','number']],
 ['Rule {value} action',['Rule {number, number} action','number']],
 ['Rule {value} IP or CIDR',['Rule {number, number} IP or CIDR','number']],
 ['Remove {value}',['Remove {label}','label']],
]);
export function patchAccessibleLabels(source){
 const edits=[];
 function containsString(n){return n?.type==='Literal'&&typeof n.value==='string'||n?.type==='BinaryExpression'&&n.operator==='+'&&(containsString(n.left)||containsString(n.right));}
 function parts(n){
  if(n.type==='Literal'&&typeof n.value==='string')return[n.value];
  if(n.type==='BinaryExpression'&&n.operator==='+'&&containsString(n))return[...parts(n.left),...parts(n.right)];
  if(n.type==='CallExpression'&&n.callee.type==='MemberExpression'&&n.callee.property.name==='concat'&&n.callee.object.type==='Literal'&&typeof n.callee.object.value==='string')return[n.callee.object.value,...n.arguments.map(a=>({code:source.slice(a.start,a.end)}))];
  return[{code:source.slice(n.start,n.end)}];
 }
 walk(parse(source,{ecmaVersion:'latest',sourceType:'module'}),node=>{
  if(node.type!=='Property'||!['aria-label','ariaLabel'].includes(node.key.name??node.key.value))return;
  if(node.value.type==='Literal'&&node.value.value==='Notifications Alt+T'){
   const id=ids.get(node.value.value);if(!id)throw Error('Missing notification region label');
   edits.push({start:node.start,end:node.end,value:'get '+JSON.stringify(node.key.name??node.key.value)+'(){return window.NyxI18n.message('+JSON.stringify(id)+')}'});return;
  }
  const values=parts(node.value),expressions=values.filter(v=>typeof v!=='string');if(expressions.length!==1)return;
  const pattern=values.map(v=>typeof v==='string'?v:'{value}').join(''),match=patterns.get(pattern);if(!match)return;
  const[english,key]=match,id=ids.get(english);if(!id)throw Error('Missing accessible label '+english);
  let code=expressions[0].code;if(key==='label')code=code.replace(/\|\|["']option["']$/,'||window.NyxI18n.message('+JSON.stringify(ids.get('Option'))+')');
  edits.push({start:node.value.start,end:node.value.end,value:'window.NyxI18n.message('+JSON.stringify(id)+',{'+key+':'+code+'})'});
 });
 return applyEdits(source,edits);
}
