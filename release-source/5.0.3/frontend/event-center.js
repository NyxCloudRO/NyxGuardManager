import {p as get,q as post,r as React} from './index-CTHAIRmi-409dev-4012certfix4-threatpagination3.js';
import {A as AppPage} from './AppPage-CHaZeb42.js';
const h=(tag,props,...children)=>React.createElement(tag,props,...children);
const labels={all:'All categories',security:'Security administration',users:'Users / Authentication',application:'Application / Operations',access:'Access',configuration:'Configuration'};
const kinds={user:'Authenticated user',system:'System',unauthenticated:'Unauthenticated',legacy:'Legacy attribution'};
export default function EventCenter() {
 const [scope,setScope]=React.useState({category:'all',actor:'',actorKind:'',action:'',result:'',search:'',hours:'24'});
 const [page,setPage]=React.useState(0),[data,setData]=React.useState(null),[error,setError]=React.useState(''),[loading,setLoading]=React.useState(true),[revision,refresh]=React.useState(0),[clearing,setClearing]=React.useState(false),[filtersError,setFiltersError]=React.useState(''),[options,setOptions]=React.useState({actors:[],actions:[]});
 const sequence=React.useRef(0), clearPending=React.useRef(false);
 React.useEffect(()=>{let live=true;get({url:'event-center/options'}).then(d=>{if(live){setOptions(d);setFiltersError('');}}).catch(()=>{if(live)setFiltersError('Filter choices could not be loaded. Retry to reload.');});return()=>{live=false;};},[revision]);
 React.useEffect(()=>{const id=++sequence.current;let live=true;setLoading(true);setData(null);setError('');const timer=setTimeout(()=>get({url:'event-center/events',params:{...scope,limit:100,offset:page*100}}).then(d=>{if(live&&id===sequence.current)setData(d);}).catch(()=>{if(live&&id===sequence.current)setError('Unable to load events. Retry to check the current state.');}).finally(()=>{if(live&&id===sequence.current)setLoading(false);}),scope.search?200:0);return()=>{live=false;clearTimeout(timer);};},[scope,page,revision]);
 const invalidate=()=>{sequence.current++;setLoading(true);setData(null);setError('');};
 const change=key=>e=>{invalidate();setPage(0);setScope(s=>({...s,[key]:e.target.value}));};
 const retry=()=>{invalidate();refresh(v=>v+1);};
 const clear=async()=>{
  if(clearPending.current||loading||!data?.total)return;
  const selected={...scope};
  if(!window.confirm(`Permanently delete all ${data.total} audit records (${data.occurrences} occurrences) matching these filters? Threat Activity is unaffected.`))return;
  clearPending.current=true;setClearing(true);setError('');
  try{await post({url:'event-center/clear',data:{...selected,confirm:true}});invalidate();setPage(0);refresh(v=>v+1);}
  catch{sequence.current++;setData(null);setLoading(false);setError('Clear result unavailable. Retry to verify the persistent state.');}
  finally{clearPending.current=false;setClearing(false);}
 };
 const select=(key,title,choices)=>h('label',null,title,h('select',{'aria-label':title,value:scope[key],onChange:change(key),disabled:clearing},...choices.map(([value,text])=>h('option',{key:value,value},text))));
 const summaries=h('div',{className:'event-summary','aria-label':'Occurrence counts in selected scope'},...Object.entries(labels).map(([category,label])=>h('div',{key:category,className:'_panel_1gz5u_56 event-summary-card'},h('span',null,category==='all'?'Selected occurrences':label),h('strong',{'data-counter':category},loading?'…':data?(category==='all'?data.occurrences:data.counters[category]).toLocaleString():'—'))));
 const rows=(data?.items||[]).map(e=>h('tr',{key:e.id,'data-event-id':e.id},
  h('td',null,h('time',{dateTime:e.timestamp},new Date(e.timestamp).toLocaleString())),
  h('td',null,e.actorId?`${e.actor} (#${e.actorId})`:e.actor),h('td',null,labels[e.category]||e.category),h('td',null,e.action),
  h('td',null,e.targetLabel,h('details',{className:'event-details'},h('summary',null,'Details'),h('dl',null,...Object.entries({actorType:kinds[e.actorKind]||e.actorKind,objectId:e.targetId||'Not applicable',occurrences:e.count,lastSeen:e.lastSeen?new Date(e.lastSeen).toLocaleString():'Not applicable',...e.context}).flatMap(([key,value])=>[h('dt',{key:key+'-key'},key),h('dd',{key:key+'-value'},String(value))])))),
  h('td',null,h('span',{className:'event-result','data-result':e.result},e.result),e.count>1?h('div',null,`× ${e.count.toLocaleString()}`):null)));
 const table=h('div',{className:'event-table-wrap nyx-scroll-theme',tabIndex:0,role:'region','aria-label':'Scrollable audit history'},h('table',null,h('thead',null,h('tr',null,...['Time','Actor','Category','Action','Target','Result'].map(t=>h('th',{key:t,scope:'col'},t)))),h('tbody',null,...rows)));
 const pagination=h('nav',{className:'event-pagination','aria-label':'Audit pages'},h('button',{disabled:loading||clearing||page===0,onClick:()=>{invalidate();setPage(p=>p-1);}},'Previous'),h('span',null,`Page ${page+1} of ${Math.max(1,Math.ceil((data?.total||0)/100))}`),h('button',{disabled:loading||clearing||(page+1)*100>=(data?.total||0),onClick:()=>{invalidate();setPage(p=>p+1);}},'Next'));
 const content=loading?h('p',{role:'status','aria-live':'polite'},'Loading events…'):error&&!data?h('div',{role:'alert'},h('p',null,error),h('button',{onClick:retry},'Retry')):data?.total?h(React.Fragment,null,table,pagination):data?h('p',{'data-testid':'event-empty'},'No events match the selected filters.'):null;
 return h(AppPage,{framed:true},h('section',{className:'_card_1gz5u_1 nyx-event-center'},
  h('header',null,h('div',{className:'_headerRow_1gz5u_12'},h('h2',{className:'_title_1gz5u_20'},'Event Center'),h('span',{className:'_versionTag_1gz5u_25'},'Version 5.0.3-dev')),h('p',{className:'_subtitle_1gz5u_34'},'Administrative audit history · repeated access checks retain occurrence counts')),summaries,
  h('section',{className:'_panel_1gz5u_56 event-filter-panel','aria-label':'Filters and actions'},h('div',{className:'event-filters'},
   select('category','Category',Object.entries(labels)),select('actorKind','Actor type',[['','All actor types'],...Object.entries(kinds)]),
   select('actor','Actor',[['','All actors'],...options.actors.map(a=>[String(a.id),a.name?`${a.name} (#${a.id})`:`User #${a.id}`])]),
   select('action','Action',[['','All actions'],...options.actions.map(a=>[a,a])]),select('result','Result',[['','All results'],...['success','failed','denied','unknown'].map(a=>[a,a])]),
   select('hours','Time window',[[24,'Last 24 hours'],[168,'Last 7 days'],[720,'Last 30 days'],[4320,'Last 180 days'],[0,'All retained history']].map(([v,t])=>[String(v),t])),
   h('label',null,'Search',h('input',{'aria-label':'Search',value:scope.search,maxLength:100,onChange:change('search'),disabled:clearing,placeholder:'Actor, action or target'})),
   h('button',{onClick:retry,disabled:loading||clearing},'Reload'),h('button',{className:'event-clear',onClick:clear,disabled:loading||clearing||!data?.total},clearing?'Clearing…':'Clear selected scope'))),
  filtersError?h('p',{role:'alert'},filtersError,h('button',{onClick:retry,disabled:loading},'Retry filter choices')):null,
  error&&data?h('p',{role:'alert'},error,h('button',{onClick:retry},'Retry')):null,
  h('section',{className:'_panel_1gz5u_56 event-history','aria-label':'Event History'},h('div',{className:'event-history-header'},h('h3',{className:'_panelTitle_1gz5u_63'},'Event History'),!loading&&data?h('p',{'data-testid':'event-total'},`${data.total.toLocaleString()} records · ${data.occurrences.toLocaleString()} occurrences`):null),content)));
}
