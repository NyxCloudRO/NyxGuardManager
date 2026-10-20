// Render inside the native Settings card, using its exact grid/panel/field classes.
// The existing React providers, registries and draft guard remain the owners.
function NyxInterfacePreferences({classes}) {
 const {locale,setLocale}=Um();
 const {currentTheme,themes,setTheme}=wee();
 const languageOptions=pv.map(option=>({value:option.code,label:option.code==='de'?'Deutsch':option.label}));
 const themeOptions=themes.map(theme=>({value:theme.id,label:theme.displayName}));
 async function changeLanguage(value) {
  if(value===Fm(true)||!await window.NyxLanguageDrafts.allowChange())return;
  o8(value);setLocale(value);location.reload();
 }
 const selectClasses={wrap:'nyx-interface-control',trigger:classes.notifInput+' nyx-interface-trigger',value:'nyx-interface-value',chevron:'nyx-interface-chevron',list:'nyx-interface-options show',item:'nyx-interface-option',itemActive:'active',itemText:'nyx-interface-option-text'};
 function select(value,options,onChange,label) {
  return g.jsx(AR,{value,options,onChange,ariaLabel:st.formatMessage({id:label}),placement:'bottom-start',minWidth:0,maxWidth:320,maxHeight:240,fitViewport:true,classNames:selectClasses});
 }
 return g.jsxs('div',{className:classes.grid,'data-nyx-interface':true,children:[
  g.jsxs('section',{className:classes.panel,'aria-labelledby':'nyx-interface-language-title',children:[
   g.jsx('h3',{id:'nyx-interface-language-title',className:classes.panelTitle,children:g.jsx(K,{id:'language.label'})}),
   select((locale||'en').slice(0,2),languageOptions,changeLanguage,'language.label')
  ]}),
  g.jsxs('section',{className:classes.panel,'aria-labelledby':'nyx-interface-theme-title',children:[
   g.jsx('h3',{id:'nyx-interface-theme-title',className:classes.panelTitle,children:g.jsx(K,{id:'settings.interface.appearance'})}),
   select(currentTheme.id,themeOptions,setTheme,'theme.label')
  ]})
 ]});
}

// Reuse the existing router, so direct links, reload and browser history agree.
function NyxSettingsNavigation(personalOnly) {
 const location=Js(),navigate=ff();
 const allowed=personalOnly?['interface']:['backup','notifications','integrations','sso','grafana','lan-access','vpn-client','interface'];
 const requested=new URLSearchParams(location.search).get('tab');
 const active=allowed.includes(requested)?requested:personalOnly?'interface':'backup';
 const choose=I.useCallback(tab=>{
  if(!allowed.includes(tab)||tab===active)return;
  const params=new URLSearchParams(location.search);params.set('tab',tab);
  navigate({pathname:location.pathname,search:'?'+params.toString(),hash:location.hash});
 },[location,navigate,personalOnly,active]);
 I.useEffect(()=>{
  const select=event=>choose(event.detail);
  window.addEventListener('nyxguard:settings-tab',select);
  return()=>window.removeEventListener('nyxguard:settings-tab',select);
 },[choose]);
 return [active,choose];
}
export {NyxInterfacePreferences,NyxSettingsNavigation};
