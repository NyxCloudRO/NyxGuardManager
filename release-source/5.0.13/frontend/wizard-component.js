// Inserted into the certified application module, sharing its React and buttons.
function NyxWizardSteps({busy,modalSelector=".nyx-proxy-wizard",steps=5}) {
  const [step,setStep]=I.useState(0);
  I.useEffect(()=>{
    const modal=document.querySelector(modalSelector);
    if(!modal)return;
    const sync=()=>setStep([...modal.querySelectorAll('[role=tab]')].findIndex(t=>t.classList.contains('active')));
    modal.addEventListener('shown.bs.tab',sync);sync();
    return ()=>modal.removeEventListener('shown.bs.tab',sync);
  },[modalSelector]);
  const move=delta=>document.querySelectorAll(modalSelector+' [role=tab]')[step+delta]?.click();
  return g.jsxs('div',{className:'nyx-wizard-step-actions',children:[
    g.jsx(wt,{type:'button',disabled:busy||step<=0,onClick:()=>move(-1),children:'Previous'}),
    g.jsx(wt,{type:'button',disabled:busy||step>=steps-1,onClick:()=>move(1),children:'Next'})]});
}
function NyxWizardAccessibility() {
  I.useEffect(()=>{
    const modal=document.querySelector('.nyx-proxy-wizard');
    const tabs=[...modal.querySelectorAll('[role=tab]')];
    document.body.classList.add('nyx-proxy-wizard-open');
    for(const tab of tabs){
      const id=tab.getAttribute('href').slice(1);tab.id='nyx-nav-'+id;tab.setAttribute('aria-controls',id);
      const panel=modal.querySelector('#'+id);panel?.setAttribute('aria-labelledby',tab.id);
    }
    const syncErrors=()=>{
      for(const field of modal.querySelectorAll('input[id],select[id],textarea[id]')){
        const error=field.closest('.mb-3')?.querySelector('.invalid-feedback');
        if(error&&error.textContent.trim()){
          error.id='nyx-error-'+field.id;field.setAttribute('aria-describedby',error.id);
          field.setAttribute('aria-invalid',String(field.classList.contains('is-invalid')));
        }else if(field.getAttribute('aria-describedby')?.startsWith('nyx-error-')){
          field.removeAttribute('aria-describedby');field.removeAttribute('aria-invalid');
        }
      }
    };
    const observer=new MutationObserver(syncErrors);observer.observe(modal,{childList:true,subtree:true,characterData:true});syncErrors();
    const key=event=>{
      if(event.key==='Tab'){
        const controls=[...modal.querySelectorAll('button,input,select,textarea,a[href],[tabindex]')].filter(e=>!e.disabled&&e.tabIndex>=0&&e.getClientRects().length&&getComputedStyle(e).visibility!=='hidden');
        const first=controls[0],last=controls.at(-1);
        if(controls.length&&((event.shiftKey&&document.activeElement===first)||(!event.shiftKey&&document.activeElement===last))){event.preventDefault();(event.shiftKey?last:first).focus();}
        return;
      }
      const tab=event.target.closest('[role=tab]');if(!tab||!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
      event.preventDefault();const index=tabs.indexOf(tab);const next=event.key==='Home'?0:event.key==='End'?tabs.length-1:(index+(event.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length;
      tabs[next].click();tabs[next].focus();
    };
    modal.addEventListener('keydown',key);
    return ()=>{observer.disconnect();modal.removeEventListener('keydown',key);document.body.classList.remove('nyx-proxy-wizard-open');};
  },[]);
  return null;
}
function NyxValidateProxyLocations(values) {
  const errors={},seen=new Set();
  const locations=(values.locations||[]).map((location,index)=>{
    const error={},path=String(location.path||'').trim();
    if(!path)error.path='Location '+(index+1)+' requires a path.';
    else if(seen.has(path))error.path='Duplicate custom location path: '+path;
    seen.add(path);
    if(!String(location.forwardHost||'').trim())error.forwardHost='Location '+(index+1)+' requires a forward hostname.';
    if(!['http','https'].includes(location.forwardScheme))error.forwardScheme='Select a valid location scheme.';
    const port=Number(location.forwardPort);if(!Number.isInteger(port)||port<1||port>65535)error.forwardPort='Location port must be between 1 and 65535.';
    return error;
  });
  if(locations.some(error=>Object.keys(error).length))errors.locations=locations;
  return errors;
}
function NyxWizardDetails({children,...props}) {
  const fields=I.Children.toArray(children);
  return g.jsxs('div',{...props,children:[
    g.jsxs('section',{className:'nyx-wizard-group',children:[g.jsx('h3',{children:'Route identity'}),...fields.slice(0,2)]}),
    g.jsxs('section',{className:'nyx-wizard-group',children:[g.jsx('h3',{children:'Destination & access'}),...fields.slice(2)]})]});
}
function NyxWizardLocations({children,...props}) {
  return g.jsxs('div',{...props,children:[g.jsxs('div',{className:'nyx-wizard-intro',children:[g.jsx('h3',{children:'Custom routing'}),g.jsx('p',{children:'Optional paths use their own upstream settings. Other requests keep the main destination.'})]}),children]});
}
function NyxWizardSsl({children,...props}) {
  const fields=I.Children.toArray(children);
  return g.jsxs('div',{...props,children:[g.jsxs('section',{className:'nyx-wizard-group',children:[g.jsx('h3',{children:'TLS certificate'}),fields[0]]}),g.jsxs('section',{className:'nyx-wizard-group',children:[g.jsx('h3',{children:'Transport policies'}),...fields.slice(1)]})]});
}
function NyxProxySummary() {
  const {values}=os();const v=values||{},domains=v.domainNames||[];
  const fields=[['Domains',domains.length?domains.join(', '):'No domains entered'],['Destination',v.forwardHost?`${v.forwardScheme||'http'}://${v.forwardHost}:${v.forwardPort||'—'}`:'No upstream entered'],['Access',v.accessListId?'Access list #'+v.accessListId:'Publicly accessible'],['TLS',v.certificateId?'Certificate #'+v.certificateId:'No certificate selected'],['Custom paths',String((v.locations||[]).length)],['WAF',v.meta?.nyxguardWafEnabled?'Configured on':'Configured off']];
  return g.jsxs('aside',{className:'nyx-wizard-summary','aria-label':'Draft Proxy Host configuration',children:[g.jsx('span',{className:'nyx-wizard-summary-label',children:'DRAFT CONFIGURATION'}),g.jsx('h3',{children:v.meta?.nyxguardAppName||'Proxy Host'}),g.jsx('dl',{children:fields.map(([label,value])=>g.jsxs('div',{children:[g.jsx('dt',{children:label}),g.jsx('dd',{children:value})]},label))}),g.jsx('p',{className:'nyx-wizard-summary-note',children:'Changes take effect after Save. Cancel keeps the existing configuration.'})]});
}
function NyxLocationInput({locationIndex,fieldName,as='input',...props}) {
 const {errors}=os(),error=errors?.locations?.[locationIndex]?.[fieldName],errorId=props.id+'-error';
 return g.jsxs(g.Fragment,{children:[g.jsx(as,{...props,className:props.className+(error?' is-invalid':''),'aria-invalid':!!error,'aria-describedby':error?errorId:undefined}),error?g.jsx('div',{id:errorId,className:'invalid-feedback d-block',children:error}):null]});
}
