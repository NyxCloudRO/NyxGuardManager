import {r as React,j as jsx,M as Modal} from './index-CTHAIRmi-409dev-4012certfix4-threatpagination3.js';
let current=null;
const listeners=new Set();
function publish(){for(const listener of listeners)listener();}
function subscribe(listener){listeners.add(listener);return ()=>listeners.delete(listener);}
export function confirmationBusy(){return !!current;}
export function useConfirmationBusy(){return !!React.useSyncExternalStore(subscribe,()=>current,()=>null);}
export function requestConfirmation(options){
  if(current)return false;
  current={...options,pending:false,error:null,initiator:document.activeElement};publish();return true;
}
export function requestDecision(options){return new Promise(resolve=>{if(!requestConfirmation({...options,resolve}))resolve(false)});}
export function requestAlert(options){return requestDecision({...options,alert:true,action:options.action||'Close'});}
function finish(decision){const operation=current;current=null;publish();operation?.resolve?.(decision);}
function cancel(){if(!current?.pending)finish(false);}
async function performConfirmation(){
  if(!current||current.pending)return;
  const operation=current;
  if(!operation.onConfirm){finish(true);return}
  current={...operation,pending:true,error:null};publish();
  try{await operation.onConfirm();finish(true);}
  catch{current={...operation,pending:false,error:'The change could not be saved. Check your connection and try again. The displayed state remains the last confirmed configuration.'};publish();}
}
export function ConfirmationDialog(){
  const state=React.useSyncExternalStore(subscribe,()=>current,()=>null);
  React.useEffect(()=>{
    if(!state)return;
    const previous=new Map();let frame;
    const isolate=()=>{
      const dialog=document.querySelector('.nyx-confirmation');if(!dialog){frame=requestAnimationFrame(isolate);return;}
      for(const element of document.body.children){
        if(element===dialog||element.classList.contains('nyx-confirmation-backdrop')||['SCRIPT','STYLE','LINK'].includes(element.tagName))continue;
        if(!previous.has(element))previous.set(element,element.inert);element.inert=true;
      }
    };
    isolate();const observer=new MutationObserver(isolate);observer.observe(document.body,{childList:true});
    function contain(event){
      const dialog=document.querySelector('.nyx-confirmation .modal-content');if(!dialog)return;
      if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();cancel();return;}
      if(event.key!=='Tab')return;
      const controls=[...dialog.querySelectorAll('button:not(:disabled),a[href],input:not(:disabled),[tabindex="0"]')].filter(element=>element.getClientRects().length);
      if(!controls.length){event.preventDefault();return;}
      const first=controls[0],last=controls.at(-1);
      if(event.shiftKey&&(document.activeElement===first||!dialog.contains(document.activeElement))){event.preventDefault();last.focus();}
      else if(!event.shiftKey&&(document.activeElement===last||!dialog.contains(document.activeElement))){event.preventDefault();first.focus();}
    }
    document.addEventListener('keydown',contain,true);
    return ()=>{cancelAnimationFrame(frame);observer.disconnect();document.removeEventListener('keydown',contain,true);for(const [element,inert] of previous)element.inert=inert;if(state.initiator?.isConnected)requestAnimationFrame(()=>{if(state.initiator?.isConnected&&!state.initiator.closest("[inert]"))state.initiator.focus()});};
  },[!!state]);
  return jsx.jsxs(Modal,{show:!!state,onHide:cancel,container:document.body,centered:true,animation:false,backdrop:'static',backdropClassName:'nyx-confirmation-backdrop',className:'nyx-confirmation',dialogClassName:'nyx-confirmation-dialog','aria-labelledby':'nyx-confirmation-title','aria-describedby':'nyx-confirmation-description',children:[
    jsx.jsx(Modal.Header,{children:jsx.jsxs(Modal.Title,{id:'nyx-confirmation-title',children:[jsx.jsxs('svg',{'aria-hidden':true,width:20,height:20,viewBox:'0 0 24 24',fill:'none',stroke:'currentColor',strokeWidth:1.8,children:[jsx.jsx('path',{d:'M12 3 2 21h20L12 3Z'}),jsx.jsx('path',{d:'M12 9v5m0 3v.1'})]}),state?.title]})}),
    jsx.jsxs(Modal.Body,{children:[jsx.jsx('p',{id:'nyx-confirmation-description',children:state?.message}),state?.error?jsx.jsx('div',{role:'alert',className:'nyx-confirmation-error',children:state.error}):null]}),
    jsx.jsxs(Modal.Footer,{children:[!state?.alert?jsx.jsx('button',{type:'button',className:'btn nyx-confirmation-cancel',disabled:state?.pending,onClick:cancel,autoFocus:true,children:state?.cancelLabel||'Cancel'}):null,jsx.jsx('button',{type:'button',className:'btn '+(state?.reducesProtection?'nyx-confirmation-risk':'nyx-confirmation-primary'),disabled:state?.pending,onClick:performConfirmation,autoFocus:!!state?.alert,'aria-busy':!!state?.pending,children:state?.pending?(state?.pendingLabel||'Saving…'):state?.action})]})
  ]});
}
