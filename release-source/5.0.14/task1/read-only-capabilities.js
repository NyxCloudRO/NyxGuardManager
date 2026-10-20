// Native controls opt in explicitly; navigation/filter controls are unchanged.
// Live identity is shared with the application's existing permission queries.
function NyxCapabilityControl({render,component,properties,controlKey}) {
  const {data:user,isPending}=ql("me");
  const {nyxMutation,nyxModule="settings",nyxTargetAdmin,nyxPersonalOwner,nyxRequires=[],...props}=properties;
  const personal=Number(nyxPersonalOwner)>0&&Number(nyxPersonalOwner)===user?.id;
  const restricted=isPending||!personal&&(!NyxCanManage(user,nyxModule)||nyxRequires.some(module=>!NyxCanManage(user,module))||nyxTargetAdmin&&!NyxCanManage(user,"admin"));
  if(restricted){
    if(nyxMutation==="hide")return null;
    props.disabled=true;
    props.isDisabled=true;
    props.readOnly=true;
    props["aria-disabled"]=true;
    for(const name of ["onClick","onChange","onSubmit","onKeyDown","onInput","onConfirm"])
      if(name in props)props[name]=undefined;
  }
  return render(component,props,controlKey);
}
function NyxCanManage(user,module){
  if(!user||user.monitoringOnly||user.roles?.includes("nyxagent"))return false;
  if(user.roles?.includes("admin"))return true;
  if(module==="me")return true;
  const names={web_controls:"webControls",proxy_hosts:"proxyHosts",access_lists:"accessLists",dead_hosts:"deadHosts",redirection_hosts:"redirectionHosts"};
  return iV(names[module]||module,"manage",user.permissions,user.roles);
}
window.NyxGuardCapabilities={
  administratorRecord(record){return !!record?.roles?.includes("admin")&&!record.roles.includes("nyxagent");},
  userMenuAllowed(actor,record){
    return !!actor&&!!record&&(actor.id===record.id||NyxCanManage(actor,"users")&&(!this.administratorRecord(record)||NyxCanManage(actor,"admin")));
  },
  certificateDetails(id){$t.show(NyxCertificateDetails,{id});},
  message(id){return st.formatMessage({id});},
  identity:null,
  routeGroup(path,hash=""){
    if(["#nyxguard-license","#nyxguard-diagnostics-support","#nyxguard-professional-support"].some(prefix=>hash.startsWith(prefix)))return "settings";
    if(path==="/nyxguard/proxy"||path.startsWith("/nyxguard/proxy/"))return "proxy_hosts";
    if(path==="/"||path.startsWith("/nyxguard/"))return "nyxguard";
    return path.startsWith("/web-controls")?"web_controls":path.startsWith("/access")?"access_lists":path.startsWith("/certificates")?"certificates":path.startsWith("/users")?"users":path.startsWith("/event-center")?"auditlog":path.startsWith("/settings")?"settings":null;
  },
  canViewRoute(user,path,hash=""){
    const group=this.routeGroup(path,hash);
    if(!group)return true;
    if(user?.monitoringOnly||user?.roles?.includes("admin"))return true;
    const names={web_controls:"webControls",proxy_hosts:"proxyHosts",access_lists:"accessLists"};
    return iV(names[group]||group,"view",user?.permissions,user?.roles);
  },
  canMutate(module="settings"){return NyxCanManage(this.identity,module);},
  control(render,component,properties,controlKey){
    return g.jsx(NyxCapabilityControl,{render,component,properties,controlKey},controlKey);
  }
};

function NyxReadOnlyRegion({module,children,...props}){
  const {data:user}=ql("me");
  if(!NyxCanView(user,module))return null;
  return g.jsx("div",{...props,children:NyxCanManage(user,module)?children:g.jsx("fieldset",{disabled:true,"data-nyx-readonly-region":true,style:{display:"contents",pointerEvents:"none"},children})});
}

function NyxCanView(user,module){
  if(!user)return false;
  if(user.monitoringOnly||user.roles?.includes("nyxagent")||user.roles?.includes("admin"))return true;
  const names={web_controls:"webControls",proxy_hosts:"proxyHosts",access_lists:"accessLists",dead_hosts:"deadHosts",redirection_hosts:"redirectionHosts"};
  return iV(names[module]||module,"view",user.permissions,user.roles);
}
function NyxViewControl({module,children}){
  const {data:user}=ql("me");
  return NyxCanView(user,module)?children:null;
}
