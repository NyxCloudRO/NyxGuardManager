import {r as React,j as jsx,s as auth,aw as useUser} from './asset-516-11b20a5b9bc407e6.js';
import {requestDecision} from './asset-516-fb37855ec88c51b8.js';
import {storageText as t} from './storage-i18n.js';
const h=React.createElement;
async function api(action,body){const res=await fetch('/api/settings/storage/'+action,{method:action==='inventory'?'GET':'POST',headers:{Authorization:'Bearer '+auth.token?.token,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});if(!res.ok)throw Error(t('failed'));return res.json();}
const bytes=n=>n==null?t('unknown'):new Intl.NumberFormat(window.NyxI18n.locale,{maximumFractionDigits:1}).format(n/1048576)+' MiB';
const reason=r=>t(r.eligible?'eligible':r.reason==='recovery_unverified'?'recovery_unverified_short':r.reason||'manual_review');
function date(name){const m=/backup-(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z/.exec(name);return m?new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}Z`).toLocaleString(window.NyxI18n.locale):name;}
export function StorageManagement(){
 const {data:user}=useUser('me'),allowed=user?.roles?.includes('admin')&&!user.roles.includes('nyxagent');
 const [inventory,setInventory]=React.useState(null),[busy,setBusy]=React.useState(false),[error,setError]=React.useState(''),[selected,setSelected]=React.useState([]),[review,setReview]=React.useState(null),[outcome,setOutcome]=React.useState(null),[sort,setSort]=React.useState('date');
 async function refresh(){setBusy(true);setError('');try{const value=await api('inventory');setInventory(value);setSelected([]);setReview(null)}catch{setError(t('failed'))}finally{setBusy(false)}}
 React.useEffect(()=>{if(allowed)refresh()},[allowed]);
 React.useEffect(()=>{if(review)document.querySelector('.nyx-storage-review')?.scrollIntoView({block:'nearest',behavior:'smooth'})},[review]);
 const toggle=id=>{setReview(null);setSelected(old=>old.includes(id)?old.filter(i=>i!==id):[...old,id])};
 async function preview(ids=selected){setSelected(ids);setBusy(true);setError('');try{setReview(await api('preview',{ids}))}catch{setError(t('failed'));setReview(null)}finally{setBusy(false)}}
 async function confirm(){await requestDecision({title:t('confirm'),message:t('irreversible'),action:t('delete'),destructive:true,errorMessage:t('failed'),pendingLabel:t('working'),onConfirm:async()=>{setBusy(true);try{const out=await api('delete',{plan:review.plan});setOutcome({...out,outcomes:out.outcomes.map(result=>({...result,displayName:review.resources.find(row=>row.id===result.resource)?.name||result.resource}))});await refresh()}finally{setBusy(false);setReview(null)}}});}
 function rowView(row,type){
  const pairs=[t('name'),row.name,t('integrity'),t(row.status||'unknown')];
  if(type==='image')pairs.push(t('reclaimable'),bytes(row.reclaimableBytes),t('references'),row.references?.flat().join(', ')||t('none'),t('identity'),row.imageId);
  else pairs.push(t('result'),t(row.result||'unknown'));
  const details=h('details',null,h('summary',{'aria-label':t('details')+' '+row.name},t('details')),h('dl',null,...pairs.map((text,index)=>h(index%2?'dd':'dt',{key:index},text))));
  const select=h('input',{type:'checkbox',checked:selected.includes(row.id),disabled:busy||!row.eligible,'aria-label':t('select')+' '+row.name,title:reason(row),onChange:()=>toggle(row.id)});
  const name=h(React.Fragment,null,h('span',{className:'nyx-storage-name',title:row.name},type==='backup'?date(row.name):row.name.split(', ')[0]),h('small',null,type==='backup'?(row.sourceVersion||'—')+' → '+(row.targetVersion||'—'):row.imageId.slice(0,19)+(row.name.split(', ').length>1?' · +'+(row.name.split(', ').length-1):'')));
  return h('tr',{key:row.id},h('td',null,select),h('td',null,name),h('td',null,bytes(type==='backup'?row.allocatedBytes:row.sizeBytes)),h('td',null,h('span',{className:row.eligible?'nyx-storage-eligible':'nyx-storage-protected'},reason(row))),h('td',null,details),h('td',null,h('button',{type:'button',className:'nyx-storage-delete',disabled:busy||!allowed||!row.eligible,title:row.eligible?t('review'):reason(row),'aria-label':t('delete')+' '+row.name,onClick:()=>preview([row.id]),'data-nyx-action':'destructive'},h('svg',{width:14,height:14,viewBox:'0 0 24 24',fill:'none',stroke:'currentColor',strokeWidth:1.7,'aria-hidden':true},h('path',{d:'M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7'})))));
 }
 function table(type,rows){
  const sorted=[...rows].sort((a,b)=>sort==='name'?a.name.localeCompare(b.name):type==='image'?(b.createdAt||0)-(a.createdAt||0)||b.imageId.localeCompare(a.imageId):b.name.localeCompare(a.name));
  const title=t(type==='backup'?'backups':'images');
  const header=h('thead',null,h('tr',null,...[t('select'),t(type==='backup'?'dateVersion':'image'),t('size'),t('status'),t('details'),t('delete')].map((text,index)=>h('th',{key:index},text))));
  const body=h('tbody',null,...sorted.map(row=>rowView(row,type)));
  return h('section',{className:'nyx-storage-section','data-storage-section':type},h('header',null,h('h3',null,title),h('span',{className:'nyx-storage-count'},rows.length)),h('div',{className:'nyx-storage-scroll',tabIndex:0,'aria-label':title},h('table',null,header,body)),!rows.length?h('p',{className:'nyx-storage-empty'},busy?t('loading'):t('empty')):null);
 }
 return h('div',{className:'nyx-storage','aria-busy':busy},h('div',{className:'nyx-storage-toolbar'},h('span',null,t('storage')),h('label',null,t('sort'),' ',h('select',{value:sort,onChange:event=>setSort(event.target.value)},h('option',{value:'date'},t('newest')),h('option',{value:'name'},t('name')))),h('button',{type:'button',className:'btn btn-sm',disabled:busy||!allowed,onClick:refresh,'aria-label':t('refresh')},t('refresh'))),
 !allowed?h('p',null,t('adminOnly')):null,error?h('p',{role:'alert',className:'nyx-storage-error'},error):null,inventory?.available===false?h('p',{role:'status'},t('unavailable')):null,
 table('backup',inventory?.backups||[]),table('image',inventory?.images||[]),h('p',{className:'nyx-storage-note'},t('accounting')),
 inventory&&!inventory.recoveryIdentified?h('p',{className:'nyx-storage-note'},t('recovery_unverified')):null,
 h('div',{className:'nyx-storage-actions'},h('span',null,t('selected')+': '+selected.length),h('button',{className:'btn btn-sm',type:'button',disabled:busy||!allowed||selected.length===0,onClick:()=>preview()},t('review'))),
 review?h('section',{className:'nyx-storage-review','aria-label':t('review')},h('h4',null,t('review')),h('ul',null,...review.resources.map(row=>h('li',{key:row.id},row.name+(row.type==='backup'?' ['+(row.sourceVersion||'—')+' → '+(row.targetVersion||'—')+']':'')+' — '+t(row.type==='backup'?'backups':'images')+' · '+reason(row)+' · '+bytes(row.type==='backup'?row.allocatedBytes:row.reclaimableBytes)))),h('p',null,t('planNote')),h('button',{className:'btn btn-sm',type:'button',disabled:busy,onClick:confirm,'data-nyx-action':'destructive'},t('confirm'))):null,
 outcome?h('div',{role:'status',className:'nyx-storage-outcome'},h('strong',null,t('result')),h('ul',null,...outcome.outcomes.map(result=>h('li',{key:result.resource},result.displayName+' · '+t(result.result)))),h('p',null,t('measured')+': '+bytes(outcome.outcomes.reduce((sum,r)=>sum+(r.filesystemFreeDeltaBytes||0),0)))):null);
}
