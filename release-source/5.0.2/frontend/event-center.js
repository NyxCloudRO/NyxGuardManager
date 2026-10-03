import {p as get,q as post,r as React} from './index-CTHAIRmi-409dev-4012certfix4-threatpagination3.js';
import {A as AppPage} from './AppPage-CHaZeb42.js';
const h = (tag,props,...children)=>React.createElement(tag,props,...children);
const labels={all:'All categories',security:'Security administration',users:'Users / Authentication',application:'Application / Operations',access:'Access',configuration:'Configuration'};
export default function EventCenter() {
  const [scope,setScope]=React.useState({category:'all',actor:'',action:'',search:'',hours:'24'});
  const [page,setPage]=React.useState(0),[data,setData]=React.useState(null),[error,setError]=React.useState(''),[loading,setLoading]=React.useState(true),[revision,refresh]=React.useState(0),[clearing,setClearing]=React.useState(false),[filtersError,setFiltersError]=React.useState(''),[options,setOptions]=React.useState({actors:[],actions:[]});
  React.useEffect(()=>{let live=true;get({url:'event-center/options'}).then(d=>{if(live){setOptions(d);setFiltersError('');}}).catch(()=>{if(live)setFiltersError('Filter choices could not be loaded. Reload to retry.');});return()=>{live=false;};},[revision]);
  React.useEffect(()=>{let live=true;setLoading(true);setError('');get({url:'event-center/events',params:{...scope,limit:100,offset:page*100}}).then(d=>{if(live)setData(d);}).catch(()=>{if(live){setData(null);setError('Unable to load events. Retry to check the current state.');}}).finally(()=>{if(live)setLoading(false);});return()=>{live=false;};},[scope,page,revision]);
  const change=(key)=>(e)=>{setPage(0);setScope(s=>({...s,[key]:e.target.value}));};
  const clear=async()=>{if(!window.confirm(`Permanently delete all Event Center records matching these filters (${data.total} records)? This cannot be undone.`))return;setClearing(true);setError('');try{await post({url:'event-center/clear',data:{...scope,confirm:true}});setPage(0);setData(null);refresh(v=>v+1);}catch{setError('Clear failed. Reload to verify the persistent state.');}finally{setClearing(false);}};
  const rows = (data?.items || []).map(e=>h('tr',{key:e.id,'data-event-id':e.id},
    h('td',null,h('time',{dateTime:e.timestamp},new Date(e.timestamp).toLocaleString())),
    h('td',null,e.actorId?`${e.actor} (#${e.actorId})`:e.actor),h('td',null,labels[e.category]),h('td',null,e.action),
    h('td',null,`${e.targetType} #${e.targetId}`),h('td',null,e.result)));
  const table = h('div',{className:'event-table-wrap'},h('table',null,
    h('thead',null,h('tr',null,...['Time','Actor','Category','Action','Target','Result'].map(t=>h('th',{key:t},t)))),
    h('tbody',null,...rows)));
  const pagination = h('div',{className:'event-pagination'},
    h('button',{disabled:page===0,onClick:()=>setPage(p=>p-1)},'Previous'),h('span',null,`Page ${page+1}`),
    h('button',{disabled:(page+1)*100>=(data?.total||0),onClick:()=>setPage(p=>p+1)},'Next'));
  const content = loading ? h('p',{role:'status'},'Loading events…') : data ? h(React.Fragment,null,
    h('p',{'data-testid':'event-total'},`${data.total} events in selected scope`),
    data.total ? h(React.Fragment,null,table,pagination) : h('p',{'data-testid':'event-empty'},'No events match the selected filters.')) : null;
  return h(AppPage,{framed:true},h('section',{className:'nyx-event-center'},
    h('h2',null,'Event Center'),h('p',null,'Administrative and operational audit history'),
    h('div',{className:'event-filters'},
      h('label',null,'Category',h('select',{'aria-label':'Category',value:scope.category,onChange:change('category')},...Object.entries(labels).map(([id,label])=>h('option',{key:id,value:id},label)))),
      h('label',null,'Actor',h('select',{'aria-label':'Actor',value:scope.actor,onChange:change('actor')},h('option',{value:''},'All actors'),h('option',{value:'0'},'System / Unauthenticated'),...options.actors.map(a=>h('option',{key:a.id,value:String(a.id)},a.name?`${a.name} (#${a.id})`:`User #${a.id}`)))),
      h('label',null,'Action',h('select',{'aria-label':'Action',value:scope.action,onChange:change('action')},h('option',{value:''},'All actions'),...options.actions.map(a=>h('option',{key:a,value:a},a)))),
      h('label',null,'Time window',h('select',{'aria-label':'Time window',value:scope.hours,onChange:change('hours')},...[[24,'Last 24 hours'],[168,'Last 7 days'],[720,'Last 30 days'],[4320,'Last 180 days'],[0,'All retained history']].map(([v,t])=>h('option',{key:v,value:String(v)},t)))),
      h('label',null,'Search',h('input',{'aria-label':'Search',value:scope.search,maxLength:100,onChange:change('search'),placeholder:'Actor, action or target'})),
      h('button',{onClick:()=>refresh(v=>v+1),disabled:loading||clearing},'Reload'),
      h('button',{onClick:clear,disabled:loading||clearing||!data?.total},clearing?'Clearing…':'Clear selected scope')),
    filtersError?h('p',{role:'alert'},filtersError):null,error?h('p',{role:'alert'},error):null,content));
}
