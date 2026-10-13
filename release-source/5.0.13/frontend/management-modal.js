// Shared presentation only: original forms, validation, mutations and permissions remain owners.
function NyxManagementModal({kind='general',busy=false,className='',dialogClassName='',onHide,children,...props}) {
 const id=I.useId();
 I.useEffect(()=>{
  if(!props.show)return;
  const node=document.querySelector('[data-nyx-modal-id="'+id+'"]');const root=node?.closest('.modal')||node;if(!root)return;
  const configure=()=>{
   const title=root.querySelector('.modal-title,h3,h2');if(title){if(!title.id)title.id=id+'-title';root.setAttribute('aria-labelledby',title.id)}
   root.querySelector('.nav-tabs')?.setAttribute('role','tablist');
   [...root.querySelectorAll('[role=tab]')].forEach((tab,index)=>{const href=tab.getAttribute('href');if(!href?.startsWith('#'))return;tab.id=id+'-step-'+index;tab.setAttribute('aria-controls',href.slice(1));const panel=root.querySelector(href);panel?.setAttribute('aria-labelledby',tab.id)});
  };
  configure();const observer=new MutationObserver(configure);observer.observe(root,{childList:true,subtree:true});
  const keys=event=>{
   if(NyxConfirmationBusyNow()||!root.contains(event.target))return;
   const visible=[...document.querySelectorAll('.modal.show')].filter(e=>!e.inert&&!e.closest('[inert]'));if(visible.at(-1)!==root)return;
   if(event.key==='Tab'){
    const controls=[...root.querySelectorAll('button,input,select,textarea,a[href],[tabindex]')].filter(e=>!e.disabled&&e.tabIndex>=0&&e.getClientRects().length&&getComputedStyle(e).visibility!=='hidden');
    const first=controls[0],last=controls.at(-1);if(controls.length&&((event.shiftKey&&document.activeElement===first)||(!event.shiftKey&&document.activeElement===last))){event.preventDefault();(event.shiftKey?last:first).focus()}return;
   }
   const tab=event.target.closest('[role=tab]');if(!tab||!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
   event.preventDefault();if(busy)return;const tabs=[...root.querySelectorAll('[role=tab]')],at=tabs.indexOf(tab),next=event.key==='Home'?0:event.key==='End'?tabs.length-1:(at+(event.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length;tabs[next]?.click();tabs[next]?.focus();
  };
  root.addEventListener('keydown',keys);return()=>{observer.disconnect();root.removeEventListener('keydown',keys)};
 },[props.show,id,busy]);
 return g.jsx(Ve,{...props,show:props.show,container:document.body,centered:true,animation:false,onHide:()=>{if(!busy)onHide?.()},keyboard:props.keyboard!==false&&!busy,className:'nyx-management-modal nyx-management-'+kind+' '+className,dialogClassName:'nyx-management-dialog '+dialogClassName,'data-nyx-modal-id':id,'data-nyx-managed-controls':true,'aria-labelledby':props['aria-labelledby']||id+'-title','aria-busy':busy,children});
}
Object.assign(NyxManagementModal,{Header:Ve.Header,Body:Ve.Body,Footer:Ve.Footer,Title:Ve.Title});
function NyxUserBody({children,...props}) {
 const fields=I.Children.toArray(children),permissions=fields[4];
 return g.jsxs(Ve.Body,{...props,className:'nyx-user-body',children:[fields[0],g.jsx('section',{className:'nyx-user-profile',children:fields[1]}),g.jsxs('section',{className:'nyx-form-section nyx-user-identity',style:permissions?undefined:{gridColumn:'1 / -1'},children:[g.jsx('h3',{children:'Identity'}),...fields.slice(2,4)]}),permissions?g.jsx('section',{className:'nyx-form-section nyx-user-permissions',children:permissions}):null]});
}
function NyxCertificateBody({kind,children,...props}) {
 const explanation=kind==='http'?'Request a certificate for domains routed to this Manager. Check HTTP reachability before requesting issuance.':kind==='dns'?'Validate domain ownership through your DNS provider. Review its required credentials before requesting issuance.':'Import a certificate and its private key. An intermediate certificate chain is optional.';
 return g.jsxs(Ve.Body,{...props,className:'nyx-certificate-body nyx-certificate-'+kind,children:[g.jsx('p',{className:'nyx-form-context',children:explanation}),children]});
}
export {NyxManagementModal};
