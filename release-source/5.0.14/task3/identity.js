// Inserted in the canonical React module; uses its existing router, identity query and capability checks.
const NyxIdentityTabs=[{key:'policy',path:'/access',module:'access_lists',label:'task3.policies',component:()=>rhe},{key:'certificate',path:'/certificates',module:'certificates',label:'task3.certificates',component:()=>ahe},{key:'user',path:'/users',module:'users',label:'task3.accounts',component:()=>she}];
function NyxIdentityNav({onClick}){
 const {data:user}=ql('me'),{pathname}=Js();
 const tabs=NyxIdentityTabs.filter(tab=>NyxCanView(user,tab.module));
 if(!tabs.length)return null;
 return g.jsx('li',{className:'nav-item','data-menu':'identity-access',children:g.jsxs(pP,{to:tabs[0].path,onClick,className:'nav-link'+(tabs.some(t=>pathname===t.path)?' active':''),children:[g.jsx('span',{className:'nav-link-icon d-md-none d-lg-inline-block',children:g.jsx(zm,{height:24,width:24})}),g.jsx('span',{className:'nav-link-title',children:g.jsx(K,{id:'task3.identity'})})]})});
}
function NyxIdentity({active}){
 const {data:user,isPending}=ql('me');
 if(isPending||!user)return g.jsx(em,{noLogo:true});
 const tabs=NyxIdentityTabs.filter(tab=>NyxCanView(user,tab.module));
 if(!active)return tabs.length?g.jsx(Hs,{to:tabs[0].path,replace:true}):g.jsx('div',{className:'nyx-dashboard',children:g.jsx(K,{id:'no-permission-error'})});
 const current=tabs.find(t=>t.key===active);
 // Never mount an unauthorized list or fetch data for inactive tabs.
 if(!current)return g.jsx('div',{className:'nyx-dashboard',children:g.jsx(K,{id:'no-permission-error'})});
 return g.jsx(NyxIdentityPage,{framed:true,children:g.jsxs('section',{className:'nyx-dashboard nyx-identity','aria-labelledby':'nyx-identity-title',children:[g.jsxs('header',{className:'nyx-identity-header',children:[g.jsx('h1',{id:'nyx-identity-title',className:'nyx-dashboard-title',children:g.jsx(K,{id:'task3.identity'})}),g.jsx('p',{className:'nyx-dashboard-subtitle',children:g.jsx(K,{id:'task3.description'})})]}),g.jsx('nav',{className:'_tabBar_1gz5u_92 nyx-identity-tabs','data-nyx-module-tabs':true,onKeyDown:NyxModuleTabKeys,'aria-label':st.formatMessage({id:'task3.identity'}),children:tabs.map(tab=>g.jsx(Ox,{to:tab.path,className:'_tab_1gz5u_92 nyx-identity-tab'+(tab.key===active?' _tabActive_1gz5u_119 active':''),'aria-current':tab.key===active?'page':undefined,children:g.jsx(K,{id:tab.label})},tab.key))}),g.jsx('div',{className:'nyx-identity-content',children:g.jsx(current.component(),{})})]})});
}

function NyxModuleTabKeys(event){
 if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
 const tabs=[...event.currentTarget.querySelectorAll('a,button')].filter(e=>!e.disabled&&e.getClientRects().length),at=tabs.indexOf(event.target.closest('a,button'));if(at<0)return;
 event.preventDefault();const next=event.key==='Home'?0:event.key==='End'?tabs.length-1:(at+(event.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length;
 tabs[next]?.focus({preventScroll:true});tabs[next]?.click();
}
export {NyxModuleTabKeys};

// Preserve the native React Select implementation, choices and handlers. Only scoped
// management dialogs share presentation and a portal inside their accessible modal.
function NyxManagementSelect({component:Select,...props}){
 const ref=I.useRef(null),[owner,setOwner]=I.useState(null),[menu,setMenu]=I.useState({placement:'auto',height:240});
 function positionMenu(){
  const control=ref.current?.controlRef,root=control?.closest('.modal');if(!root)return;
  const box=control.getBoundingClientRect(),content=root.querySelector('.modal-content').getBoundingClientRect();
  const headers=[...root.querySelectorAll('.modal-header,.card-header')].filter(e=>e.getClientRects().length&&e.getBoundingClientRect().bottom<=box.top);
  const top=Math.max(content.top,...headers.map(e=>e.getBoundingClientRect().bottom));
  const bottom=root.querySelector('.modal-footer')?.getBoundingClientRect().top??content.bottom;
  const above=box.top-top,below=bottom-box.bottom,placement=below>=248||below>=above?'bottom':'top';
  const height=Math.max(48,Math.min(240,(placement==='bottom'?below:above)-8));
  setMenu(old=>old.placement===placement&&old.height===height?old:{placement,height});
 }
 I.useEffect(()=>{if(!owner)return;const update=()=>{if(ref.current?.props?.menuIsOpen)positionMenu()};window.addEventListener('resize',update);owner.addEventListener('scroll',update,true);return()=>{window.removeEventListener('resize',update);owner.removeEventListener('scroll',update,true)};},[owner]);
 I.useLayoutEffect(()=>{setOwner(ref.current?.controlRef?.closest('.nyx-management-access-list,.nyx-management-certificate-http,.nyx-management-certificate-dns,.nyx-management-certificate-custom,.nyx-proxy-wizard')||null);},[]);
 const styles=I.useMemo(()=>({...props.styles,
  control:(base,state)=>({...base,minHeight:40,borderRadius:'var(--nyx-control-radius)',fontSize:13,backgroundColor:'var(--app-input-bg)',borderColor:state.isFocused?'var(--app-primary)':'var(--app-border)',boxShadow:state.isFocused?'0 0 0 2px var(--app-focus-ring)':'none',':hover':{borderColor:'var(--app-primary)'}}),
  valueContainer:base=>({...base,padding:'2px 8px',gap:4}),input:base=>({...base,margin:0,padding:0,color:'var(--app-text-primary)'}),
  singleValue:base=>({...base,margin:0,color:'var(--app-text-primary)',whiteSpace:'normal',overflowWrap:'anywhere'}),placeholder:base=>({...base,margin:0,color:'var(--app-text-secondary)'}),
  indicatorsContainer:base=>({...base,alignSelf:'stretch'}),indicatorSeparator:base=>({...base,backgroundColor:'var(--app-border)',marginTop:7,marginBottom:7}),
  dropdownIndicator:base=>({...base,padding:'6px 8px',color:'var(--app-text-secondary)',':hover':{color:'var(--app-text-primary)'}}),clearIndicator:base=>({...base,padding:6,color:'var(--app-text-secondary)',':hover':{color:'var(--app-text-primary)'}}),
  multiValue:base=>({...base,margin:0,maxWidth:'100%',borderRadius:4,backgroundColor:'color-mix(in srgb,var(--app-primary) 14%,var(--app-surface-2))',border:'1px solid var(--app-border)'}),
  multiValueLabel:base=>({...base,padding:'2px 6px',color:'var(--app-text-primary)',fontSize:12,whiteSpace:'normal',overflowWrap:'anywhere'}),multiValueRemove:base=>({...base,color:'var(--app-text-secondary)',':hover':{backgroundColor:'color-mix(in srgb,var(--app-primary) 20%,var(--app-surface-2))',color:'var(--app-text-primary)'}}),
  noOptionsMessage:base=>({...base,color:'var(--app-text-secondary)',fontSize:13,padding:'8px 10px'}),loadingMessage:base=>({...base,color:'var(--app-text-secondary)',fontSize:13,padding:'8px 10px'}),loadingIndicator:base=>({...base,color:'var(--app-primary)'}),
  menuPortal:base=>({...base,zIndex:3200}),menu:base=>({...base,margin:'4px 0',backgroundColor:'var(--app-surface-2)',border:'1px solid var(--app-border)',borderRadius:'var(--tblr-border-radius)',overflow:'hidden',boxShadow:'0 8px 24px color-mix(in srgb,var(--app-background) 65%,transparent)',color:'var(--app-text-primary)',fontSize:13}),menuList:base=>({...base,padding:4}),
  option:(base,state)=>({...base,height:'auto',padding:'7px 9px',borderRadius:4,whiteSpace:'normal',overflowWrap:'anywhere',fontWeight:state.isSelected?600:400,color:state.isDisabled?'var(--app-text-secondary)':'var(--app-text-primary)',backgroundColor:state.isSelected?'color-mix(in srgb,var(--app-primary) 22%,var(--app-surface-2))':state.isFocused?'color-mix(in srgb,var(--app-primary) 12%,var(--app-surface-2))':'transparent',':active':{backgroundColor:'color-mix(in srgb,var(--app-primary) 26%,var(--app-surface-2))'}})
 }),[props.styles]);
 return g.jsx(Select,{...props,ref,...owner?{id:undefined,inputId:props.inputId??props.id,menuPortalTarget:owner,menuPosition:'fixed',menuPlacement:menu.placement,maxMenuHeight:menu.height,minMenuHeight:Math.min(100,menu.height),menuShouldScrollIntoView:false,onMenuOpen:()=>{positionMenu();props.onMenuOpen?.()},styles}: {}});
}
