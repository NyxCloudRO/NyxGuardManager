// Existing stored groups remain authoritative; no defaults broaden assignments.
import {isMonitoring,monitoringOperation} from './monitoring-policy.mjs';
export const GROUPS=['proxy_hosts','redirection_hosts','dead_hosts','streams','access_lists','certificates','nyxguard','web_controls','users','auditlog','settings'];
export function effectiveLevel(user,group){
  if(isMonitoring(user))return 'view';
  if(user?.roles?.includes('admin'))return 'manage';
  const value=user?.permissions?.[group];
  return ['manage','view'].includes(value)?value:'hidden';
}
export function operationGroup(path){
  if(/^\/nyxguard(?:\/|$)/.test(path))return 'nyxguard';
  if(/^\/web-threat(?:\/|$)/.test(path))return 'web_controls';
  if(/^\/(?:audit-log|event-center)(?:\/|$)/.test(path))return 'auditlog';
  if(/^\/users(?:\/|$)/.test(path))return 'users';
  if(path==='/reports/hosts')return 'proxy_hosts';
  const nginx=path.match(/^\/nginx\/(proxy-hosts|redirection-hosts|dead-hosts|streams|access-lists|certificates)(?:\/|$)/);
  if(nginx)return nginx[1].replaceAll('-','_');
  if(/^\/(?:settings|notifications|integrations|lan-access|vpn-client|professional-support|update-manager)(?:\/|$)/.test(path))return 'settings';
  return null;
}
export function administratorOperation(method,path){
  if(/^\/settings\/backup(?:\/|$)/.test(path)||/^\/nginx\/certificates\/[^/]+\/download$/.test(path))return true;
  return method!=='GET' && (/^\/(?:professional-support|update-manager)(?:\/|$)/.test(path)
    || /^\/settings\/backup(?:\/|$)/.test(path)
    || /^\/users\/[^/]+\/(?:permissions|login-as|login)$/.test(path)
    || /^\/settings\/(?:sso[-_]|auth[-_])/.test(path));
}
export function moduleOperation(user,method,path,query={}){
  if(isMonitoring(user))return monitoringOperation(method,path,query,user.id);
  if(user?.roles?.includes('admin'))return true;
  // Session identity and local shell metadata are needed even with every group hidden.
  if(method==='GET'&&['/','/users/me','/schema','/developer-message','/version/check','/auth/sso/config','/_nyxguard/lan-access/check'].includes(path))return true;
  if(method==='GET'&&/^\/avatar\/[1-9]\d*$/.test(path))return true;
  if(/^\/tokens\/?$/.test(path))return method==='GET'&&(!query.scope||query.scope==='user');
  if(method==='POST'&&['/tokens/logout','/developer-message','/developer-message/'].includes(path))return true;
  if(new RegExp('^/users/(?:me|'+user.id+')(?:(?:/auth|/2fa|/avatar)(?:/[^/]+)*)?$').test(path))return !path.endsWith('/permissions')&&!path.endsWith('/login-as');
  const group=operationGroup(path),level=effectiveLevel(user,group);
  if(level==='hidden'||administratorOperation(method,path))return false;
  if(method==='GET'&&monitoringOperation(method,path,query))return true;
  return level==='manage';
}
