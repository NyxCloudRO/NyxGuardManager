// Content-aware sizing for the existing native wizards. No form values, state or APIs are touched.
export function workspaceHeight(natural,limit,chrome){return Math.max(0,Math.min(Math.ceil(natural),Math.floor(limit-chrome)));}
if(typeof document!=='undefined'){
 const selector='.nyx-management-access-list.show,.nyx-proxy-wizard.show',states=new Map();let frame=0;
 const number=value=>Number.parseFloat(value)||0;
 function panelHeight(panel,width){
  const visible=getComputedStyle(panel).display!=='none';
  if(visible)return Math.max(panel.scrollHeight,panel.getBoundingClientRect().height);
  // Only inactive panes are temporarily measured. Focus and active controls remain untouched.
  const original=panel.getAttribute('style');
  panel.style.cssText+=';display:block!important;position:absolute!important;visibility:hidden!important;pointer-events:none!important;height:auto!important;min-height:0!important;max-height:none!important;width:'+width+'px!important;';
  const result=Math.max(panel.scrollHeight,panel.getBoundingClientRect().height);
  if(original===null)panel.removeAttribute('style');else panel.setAttribute('style',original);
  return result;
 }
 function size(root,state){
  const content=root.querySelector('.modal-content'),workspace=root.querySelector('.card-body'),region=workspace?.querySelector('.tab-content');
  if(!content||!workspace||!region)return;
  const panes=[...region.querySelectorAll(':scope > [role=tabpanel],:scope > fieldset > [role=tabpanel]')];
  if(!panes.length)return;
  if(!root.classList.contains('nyx-content-sized'))root.classList.add('nyx-content-sized');
  const key=Math.round(region.getBoundingClientRect().width)+'x'+innerHeight;
  const padding=number(getComputedStyle(workspace).paddingTop)+number(getComputedStyle(workspace).paddingBottom);
  const active=panes.find(p=>getComputedStyle(p).display!=='none'),summary=workspace.querySelector('.nyx-wizard-summary');
  if(state.key!==key){state.key=key;state.peak=Math.max(...panes.map(p=>panelHeight(p,region.clientWidth)),summary?.getClientRects().length?summary.scrollHeight:0)+padding;}
  else state.peak=Math.max(state.peak,(active?panelHeight(active,region.clientWidth):0)+padding,summary?.getClientRects().length?summary.scrollHeight+padding:0);
  const chrome=content.getBoundingClientRect().height-workspace.getBoundingClientRect().height;
  const computed=number(getComputedStyle(content).maxHeight),limit=computed>0?Math.min(computed,innerHeight):innerHeight;
  const height=workspaceHeight(state.peak,limit,chrome),value=height+'px';
  if(root.style.getPropertyValue('--nyx-wizard-workspace')!==value)root.style.setProperty('--nyx-wizard-workspace',value);
  if(state.region!==region){state.resize.disconnect();state.resize.observe(region);state.resize.observe(content);state.region=region;}
 }
 function update(){
  frame=0;
  for(const[root,state]of states)if(!root.isConnected||!root.matches(selector)){state.resize.disconnect();states.delete(root);}
  for(const root of document.querySelectorAll(selector)){
   let state=states.get(root);if(!state){state={key:null,peak:0,resize:new ResizeObserver(schedule)};states.set(root,state);}
   size(root,state);
  }
 }
 function schedule(){if(!frame)frame=requestAnimationFrame(update);}
 new MutationObserver(records=>{if(states.size||records.some(record=>record.target instanceof Element&&record.target.closest(selector)||[...record.addedNodes].some(node=>node instanceof Element&&(node.matches(selector)||node.querySelector(selector)))))schedule();}).observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['class','aria-hidden']});
 window.addEventListener('resize',schedule,{passive:true});window.visualViewport?.addEventListener('resize',schedule,{passive:true});document.fonts?.ready.then(schedule);schedule();
}
