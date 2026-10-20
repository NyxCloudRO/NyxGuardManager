import{parse}from'acorn';import{walk,applyEdits}from'./catalogs.mjs';
export function patchFormatting(source,name){
 const helpEdits=[];
 walk(parse(source,{ecmaVersion:'latest',sourceType:'module'}),(node,anc)=>{
  if(node.type==='Literal'&&typeof node.value==='string'&&anc.some(parent=>parent.type==='FunctionDeclaration'&&parent.id?.name==='NyxProxySummary')&&['Domains','Destination','Access','Custom paths','No domains entered','No upstream entered','Publicly accessible','No certificate selected','Configured on','Configured off'].includes(node.value))helpEdits.push({start:node.start,end:node.end,value:'window.NyxI18n.t('+JSON.stringify(node.value)+')'});
  if(node.type==='ArrowFunctionExpression'&&node.body.type==='BlockStatement'&&node.body.body.some(statement=>statement.type==='ThrowStatement'&&statement.argument.type==='NewExpression'&&statement.argument.arguments[0]?.type==='TemplateLiteral'&&statement.argument.arguments[0].quasis[0].value.cooked.startsWith('Cannot load help doc for '))){
   helpEdits.push({start:node.start,end:node.end,value:'(locale,section)=>{if(!["AccessLists","Certificates","DeadHosts","ProxyHosts","RedirectionHosts","Streams"].includes(section))throw new Error(window.NyxI18n.message("ui.b79cac926e0b2e34")+": "+section);return "data:text/markdown;charset=utf-8,"+encodeURIComponent(window.NyxI18n.message("help.doc."+section))}'});
  }
  if(node.type==='TemplateLiteral'&&node.quasis[0].value.cooked==='**ERROR:** '&&node.expressions.length===1)helpEdits.push({start:node.start,end:node.end,value:'"**"+window.NyxI18n.message("notification.error")+":** "+window.NyxI18n.errorMessage('+source.slice(node.expressions[0].start,node.expressions[0].end)+')'});
  if(node.type==='TemplateLiteral'&&node.quasis[0].value.cooked==='New version '&&node.quasis[1]?.value.cooked===' is available'&&anc.at(-1)?.type==='Property')helpEdits.push({start:node.start,end:node.end,value:'window.NyxI18n.message("update-available",{latestVersion:'+source.slice(node.expressions[0].start,node.expressions[0].end)+'})'});
 });
 source=applyEdits(source,helpEdits).replaceAll('?.[1]?.trim()||"Help"','?.[1]?.trim()||window.NyxI18n.message("ui.b79cac926e0b2e34")');
 source=source.replaceAll("'Access list #'+v.accessListId",'window.NyxI18n.t("Access list #{id}",{id:v.accessListId})').replaceAll("'Certificate #'+v.certificateId",'window.NyxI18n.t("Certificate #{id}",{id:v.certificateId})').replaceAll('String((v.locations||[]).length)','window.NyxI18n.number((v.locations||[]).length)');
 const dynamicTemplates=[["`Showing the top ${o.data.items.length.toLocaleString()} of ${o.data.total.toLocaleString()} IPs; each shown IP includes the complete selected interval.`", "window.NyxI18n.message(\"ui.5546d5efd75d37c2\",{shown:o.data.items.length,total:o.data.total})"], ["`Showing ${currentIpPage*100+1}–${Math.min((currentIpPage+1)*100,F.length)} of ${F.length} matching loaded IPs`", "window.NyxI18n.message(\"ui.0221a6a8e1691687\",{start:currentIpPage*100+1,end:Math.min((currentIpPage+1)*100,F.length),total:F.length})"], ["`${v.length?E+1:0}-${E+v.length} of ${(g.data?.total??0).toLocaleString()}`", "window.NyxI18n.message(\"ui.0cfde1184dbba9ff\",{start:v.length?E+1:0,end:E+v.length,total:g.data?.total??0})"], ["`Set ban to ${m}`", "window.NyxI18n.message(\"ui.7bbf0cb5f52595cc\",{duration:m})"], ["`Total: ${Number.isFinite(t)?t.toLocaleString():String(t)}`", "window.NyxI18n.message(\"ui.ee4b556f37821cbf\",{total:Number.isFinite(t)?t:0})"], ["`Proxy Host #${p.id}`", "window.NyxI18n.message(\"ui.cda6344c797b7a4b\",{id:p.id})"], ["`User #${a.id}`", "window.NyxI18n.message(\"ui.c0b5c13d92b68a2e\",{id:a.id})"], ["`Failed to load LAN access config (${a.status})`", "window.NyxI18n.message(\"ui.a88feb65a79256e3\",{status:a.status})"], ["`Failed to save LAN access config (${c.status})`", "window.NyxI18n.message(\"ui.9f8ad2c2c50a877c\",{status:c.status})"], ["`ARP scan failed (${a.status})`", "window.NyxI18n.message(\"ui.3ccc511e01ade994\",{status:a.status})"]];
 for(const[old,next]of dynamicTemplates)source=source.replaceAll(old,next);
 source=source.replaceAll("`Request failed (${e.status})`","window.NyxI18n.message(\"ui.d5f9abf9557a579d\",{status:e.status})");
 source=source.replaceAll("`Export failed (${t.status})`","window.NyxI18n.message(\"ui.69cb76d6472ca31b\",{status:t.status})");


 if(name.startsWith('index-CP-DF6LG-')){
  const old='e.jsxs("div",{className:s.emptyState,children:["No recent traffic found in the last ",le(c),". If you are sure there is traffic, confirm the NyxGuard access logs are present under `/data/logs` (or set `NYXGUARD_LOG_DIR`)."]})';
  if(!source.includes(old))throw Error('Decision-stream empty state prerequisite changed');
  source=source.replace(old,'e.jsx("div",{className:s.emptyState,children:window.NyxI18n.message("nyxguard.section.decision-stream.empty",{window:le(c)})})');
 }
 if(name.startsWith('index-DTnhxNQ_')){
  const old='try{d=(await c.json())?.error?.message||d}catch{}throw new Error(d)';if(!source.includes(old))throw Error('LAN error prerequisite changed');source=source.replace(old,'try{const detail=(await c.json())?.error;if(detail)d=window.NyxI18n.apiError(detail,c.status)}catch{}throw new Error(d)');
 }
 if(name.startsWith('index-CTHAIRmi-')){
  const old='wx=(e,t="en-US")=>';if(!source.includes(old))throw Error('Canonical date formatter prerequisite changed');source=source.replace(old,'wx=(e,t=st.locale)=>');
 }
 if(name.startsWith('index-BwxhCj6Q-')){
  const old='ry=(e,t="en-US")=>';if(!source.includes(old))throw Error('Legacy date formatter prerequisite changed');source=source.replace(old,'ry=(e,t=window.NyxI18n.locale)=>');
 }
 if(name.startsWith('index-CTHAIRmi-')||name.startsWith('index-BwxhCj6Q-'))source=source.replaceAll('timeStyle:"medium",hourCycle:"h12"','timeStyle:"medium"');
 if(name.startsWith('index-'))source=source.replaceAll('.toLocaleString()', '.toLocaleString(window.NyxI18n.locale)').replaceAll('.toLocaleDateString()', '.toLocaleDateString(window.NyxI18n.locale)').replaceAll('.toLocaleTimeString()', '.toLocaleTimeString(window.NyxI18n.locale)');
 return source;
}
