import {r as React,j as jsx} from './NYX_MAIN';
import {filterInventory} from './inventory.mjs';
const t=(key,values)=>window.NyxI18n.message('task3.'+key,values);
const options={
 proxy:[['scheme','scheme',[['http','HTTP'],['https','HTTPS']]],['ssl','ssl',[['assigned','assigned'],['none','none']]],['policy','policy',[]],['status','status',[['enabled','enabled'],['disabled','disabled']]]],
 policy:[['auth','authorization',[['yes','with-auth'],['no','without-auth']]],['rules','rules',[['yes','with-rules'],['no','without-rules']]],['satisfy','satisfy',[['any','any'],['all','every']]],['assignment','assignment',[['assigned','assigned'],['none','none']]]],
 certificate:[['provider','provider',[['letsencrypt',"Let's Encrypt"],['other','custom']]],['expiry','expiry',[['valid','valid'],['expiring','expiring'],['expired','expired'],['unknown','unknown']]],['assignment','assignment',[['assigned','assigned'],['none','none']]]],
 user:[['role','role',[['admin','admin'],['nyxagent','NyxAgent'],['standard','standard']]],['status','status',[['enabled','enabled'],['disabled','disabled']]]]
};
const technical=new Set(['HTTP','HTTPS',"Let's Encrypt",'NyxAgent']);
export function useNyxInventory(kind,records){
 const [filters,setFilters]=React.useState({});
 const rows=React.useMemo(()=>filterInventory(kind,records,filters),[kind,records,filters]);
 const active=Object.values(filters).some(Boolean);
 const change=(key,value)=>setFilters(previous=>({...previous,[key]:value}));
 const specs=options[kind].map(([key,label,values])=>[key,label,key==='policy'?[['public',t('public')],...Array.from(new Map((records??[]).filter(r=>r.accessList?.id).map(r=>[String(r.accessList.id),r.accessList.name])).entries())]:values.map(([v,l])=>[v,technical.has(l)?l:t(l)])]);
 const summary=kind==='policy'?[[window.NyxI18n.message('ui.8a385de543876fda'),rows.reduce((n,r)=>n+(r.items?.length??0),0)],[window.NyxI18n.message('ui.d6894254be775c47'),rows.reduce((n,r)=>n+(r.clients?.length??0),0)]]:kind==='certificate'?[[window.NyxI18n.message('lets-encrypt'),rows.filter(r=>r.provider==='letsencrypt').length],[window.NyxI18n.message('web-controls.preset.custom'),rows.filter(r=>r.provider==='other').length]]:[];
 const id=React.useId();
 const toolbar=jsx.jsxs('div',{className:'nyx-inventory-toolbar','data-nyx-inventory':kind,children:[jsx.jsxs('label',{className:'nyx-inventory-search',children:[jsx.jsx('svg',{width:16,height:16,viewBox:'0 0 24 24',fill:'none',stroke:'currentColor',strokeWidth:2,'aria-hidden':true,children:jsx.jsx('path',{d:'M21 21l-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0'})}),jsx.jsx('span',{className:'visually-hidden',children:t('search-'+kind)}),jsx.jsx('input',{'data-nyx-filter-field':'task3-'+kind+'-q',type:'search',value:filters.q??'',placeholder:t('search-'+kind),onChange:event=>change('q',event.target.value),autoComplete:'off','aria-controls':id})]}),...specs.map(([key,label,values])=>jsx.jsxs('label',{className:'nyx-inventory-filter',children:[jsx.jsx('span',{children:t(label)}),jsx.jsxs('select',{'data-nyx-filter-field':'task3-'+kind+'-'+key,value:filters[key]??'',onChange:event=>change(key,event.target.value),'aria-controls':id,children:[jsx.jsx('option',{value:'',children:t('all')}),...values.map(([value,label])=>jsx.jsx('option',{value,children:label},value))]})]},key)),jsx.jsx('button',{type:'button',className:'btn btn-sm nyx-inventory-reset',disabled:!active,onClick:()=>setFilters({}),children:t('reset')}),jsx.jsx('span',{id,role:'status','aria-live':'polite',className:'nyx-inventory-count',children:t('results',{shown:rows.length,total:records?.length??0})}),active&&!rows.length?jsx.jsx('p',{className:'nyx-inventory-no-results',children:t('no-results')}):null,summary.length?jsx.jsx('dl',{className:'nyx-inventory-summary',children:summary.map(([label,value])=>jsx.jsxs('div',{children:[jsx.jsx('dt',{children:label}),jsx.jsx('dd',{children:window.NyxI18n.number(value)})]},label))}):null]});
 return {rows,toolbar,active};
}
