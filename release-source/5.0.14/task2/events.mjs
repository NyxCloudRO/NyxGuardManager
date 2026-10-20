export function patchEvents(source,name){
 if(!name.startsWith('index-DJfFx4nu-'))return source;
 const replacements=[
  ["const [scope,setScope]=React.useState({","const [scope,setScope]=React.useState(window.NyxLanguageDrafts?.readState('event-center')?.scope||{"],
  ["[page,setPage]=React.useState(0)","[page,setPage]=React.useState(window.NyxLanguageDrafts?.readState('event-center')?.page||0)"],
  ["React.useEffect(()=>{let live=true;","React.useEffect(()=>{window.NyxLanguageDrafts?.rememberState('event-center',{scope,page});},[scope,page]);React.useEffect(()=>{let live=true;"],
  ["h('select',{'aria-label':title,","h('select',{'aria-label':title,'data-nyx-filter-field':'event:'+key,"],

  ['`Page ${page+1} of ${Math.max(1,Math.ceil((data?.total||0)/100))}`','window.NyxI18n.message("event.page",{page:page+1,pages:Math.max(1,Math.ceil((data?.total||0)/100))})'],
  ['`${data.total.toLocaleString()} records · ${data.occurrences.toLocaleString()} occurrences`','window.NyxI18n.message("event.total",{records:data.total,occurrences:data.occurrences})'],
  ['`Permanently delete all ${data.total} audit records (${data.occurrences} occurrences) matching these filters? Threat Activity is unaffected.`','window.NyxI18n.message("event.clear-confirm",{records:data.total,occurrences:data.occurrences})'],
  ["'Version 5.0.13'",'window.NyxI18n.message("event-center.current-version",{version:"5.0.14"})'],
  ["h('td',null,e.targetLabel,","h('td',null,nyxEventTarget(e),"],
  ["`:e.actor)","`:nyxEventLabel(e.actor))"],
  ["h('td',null,e.action)","h('td',null,nyxEventLabel(e.action))"],
  ["'data-result':e.result},e.result)","'data-result':e.result},nyxEventLabel(e.result))"],
  [".map(a=>[a,a])",".map(a=>[a,nyxEventLabel(a)])"],
  ["h('dt',{key:key+'-key'},key)","h('dt',{key:key+'-key'},window.NyxI18n.t(({actorType:'Actor type',objectId:'Object ID',occurrences:'Occurrences',lastSeen:'Last seen'})[key]||key))"],
 ];
 for(const[old,next]of replacements){if(!source.includes(old))throw Error('Event Center prerequisite changed: '+old);source=source.replaceAll(old,next);}
 source+='\nfunction nyxEventLabel(value){return window.NyxI18n.t(({success:"Success",failed:"Failed",denied:"Denied",unknown:"Unknown",created:"Created",updated:"Updated",deleted:"Deleted",enabled:"Enabled",disabled:"Disabled",user:"User",system:"System",unauthenticated:"Unauthenticated",authorization_denied:"Authorization denied",impersonated:"Impersonated",login_failed:"Login failed",login_success:"Login successful",logout:"Logged out",logs_cleared:"Logs cleared","nyxcloud.support.diagnostics.run":"Diagnostics run","nyxcloud.support.refresh.requested":"Support refresh requested"})[value]||value);}\n';
 source+='\nfunction nyxEventTarget(e){const labels={"access-check":"Access List","access-login":"Access List","access-list":"Access List",authentication:"Authentication","proxy-host":"Proxy Host",user:"User","ip-rule":"Traffic Rule","country-rule":"Country Rule","waf-rule":"WAF Rule",certificate:"Certificate",setting:"Setting",professional_support:"Support operation","security-settings":"Security Settings"};const label=labels[e.targetType];if(!label)return e.targetLabel;const name=typeof e.context?.name==="string"?e.context.name:"";return window.NyxI18n.t(label)+(name?": "+name:"")+(e.targetId?" (#"+e.targetId+")":"");}\n';
 return source;
}
