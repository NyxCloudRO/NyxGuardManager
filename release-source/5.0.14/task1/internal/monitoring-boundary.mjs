import Access from '../lib/access.js';
import userModel from '../models/user.js';
import auditLog from './audit-log.js';
import errs from '../lib/error.js';
import {moduleOperation,operationGroup,effectiveLevel} from './module-policy.mjs';
import mainRoutes from '../routes/main.js';
import {registeredDefinition,reviewedDefinition} from './monitoring-routes.mjs';
import {isMonitoring, monitoringOperation, canonicalPath, personalOperation, redactMonitoring} from './monitoring-policy.mjs';

const publicOperation = (method,path) =>
  method === 'OPTIONS' || method === 'GET' && [ '/', '/api', '/auth/sso/config', '/auth/sso/redirect', '/auth/sso/callback', '/version/check', '/grafana/dashboard.json', '/integrations/metrics', '/_nyxguard/lan-access/check', '/health' ].includes(path)
  || method === 'GET' && /^\/avatar\/[1-9]\d*$/.test(path)
  || method === 'POST' && ['/tokens','/tokens/','/tokens/2fa','/tokens/recovery-reset','/web-threat/csp-report'].includes(path)
  || /^\/nginx\/access-portal\//.test(path);

export default async function monitoringBoundary(req,res,next) {
  const path = canonicalPath(req.path);
  try {
    if (!res.locals.token) {
      if (path && publicOperation(req.method,path)) return next();
      // Preserve first-account setup safeguards in the existing route.
      if (req.method === 'POST' && /^\/users\/?$/.test(path || '')) {
        const {isSetup} = await import('../setup.js');
        if (!await isSetup()) return next();
      }
      return res.status(403).json({error:{code:403,message:'Permission Denied'}});
    }
    const access = new Access(res.locals.token);
    await access.load(); // Validates JWT, live user, disabled state and scopes.
    const user = await userModel.query().where('id',access.token.getUserId(0))
      .where('is_deleted',0).where('is_disabled',0).withGraphFetched('permissions').first();
    if (!user || !(access.token.hasScope('user') || access.token.hasScope('admin'))) return res.status(403).json({error:{code:403,message:'Permission Denied'}});
    res.locals.access = access;
    res.locals.monitoring = isMonitoring(user);
    req.user = res.locals.monitoring ? {...user,roles:['nyxagent']} : user;
    const administrator=!res.locals.monitoring&&user.roles?.includes('admin');
    res.locals.readOnly=!administrator;
    if(administrator)return next();
    if(!moduleOperation(user,req.method,path||'/invalid-path',req.query)){
      await auditLog.add(access,{action:'authorization_denied',object_type:'authorization',object_id:0,result:'denied',meta:{resource:path||'/invalid-path',reason_code:req.method,status:403}});
      return res.status(403).json({error:{code:403,message:'Permission Denied'}});
    }
    const definition = path === '/_nyxguard/lan-access/check' ? path : registeredDefinition(mainRoutes,req.method,path || '/invalid-path');
    const reviewed = personalOperation(user.id,req.method,path) && ["/users/:user_id","/users/:user_id/auth","/users/:user_id/avatar"].includes(definition) || req.method === 'GET' && definition === '/_nyxguard/lan-access/check' || reviewedDefinition(req.method,definition);
    if (res.locals.monitoring && (!monitoringOperation(req.method,req.path,req.query,user.id) || !reviewed) || !res.locals.monitoring && req.method==="GET" && operationGroup(path||"") && effectiveLevel(user,operationGroup(path))==="view" && !reviewed) {
      await auditLog.add(access,{action:'authorization_denied',object_type:'authorization',object_id:0,result:'denied',meta:{resource:path || '/invalid-path',reason_code:req.method,status:403}});
      return res.status(403).json({error:{code:403,message:'Permission Denied'}});
    }
    // A refreshed token belongs to this same authenticated user. It is the sole
    // credential-bearing response allowed to NyxAgent. Authorized ordinary module
    // managers also receive newly generated integration credentials once.
    const issuedIntegrationCredential=!res.locals.monitoring&&effectiveLevel(user,'settings')==='manage'&&req.method==='POST'&&/^\/integrations(?:\/[1-9]\d*\/rotate)?\/?$/.test(path||'');
    const issuedPersonal2FACredential=!res.locals.monitoring&&req.method==='POST'&&new RegExp('^/users/(?:me|'+user.id+')/2fa(?:/(?:enable|backup-codes))?$').test(path||'');
    if (!issuedPersonal2FACredential && !/^\/tokens\/?$/.test(path || '') && path!=='/schema' && path!=='/schema/' && path!=='/nginx/certificates/dns-providers' && !issuedIntegrationCredential) {
      const send = res.send;
      res.send = function(body) {
        const normalize = (value) => {
          if (res.locals.monitoring && /^\/users\/(?:me|[1-9]\d*)$/.test(path || '') && value?.id === user.id) {
            value = {...value,monitoring_only:true,permissions:{...value.permissions,visibility:'all'}};
            value.roles = [...new Set([...(value.roles || []).filter(role=>role!=='admin'),'nyxagent'])];
            for (const key of ['proxy_hosts','redirection_hosts','dead_hosts','streams','access_lists','certificates','nyxguard','web_controls','users','auditlog','settings']) value.permissions[key]='view';
          }
          if(/^\/users(?:\/(?:me|[1-9]\d*))?\/?$/.test(path||'')){
            const profile=item=>item&&typeof item==='object'&&Number.isSafeInteger(item.id)&&item.id!==user.id ? Object.fromEntries(['id','name','nickname','email','avatar','roles','monitoring_only','is_disabled','created_on','modified_on'].filter(key=>key in item).map(key=>[key,item[key]])) : item;
            value=Array.isArray(value)?value.map(profile):profile(value);
          }
          return redactMonitoring(value);
        };
        if (body && typeof body === 'object' && !Buffer.isBuffer(body)) body = normalize(body);
        else if (typeof body === 'string' && /^\s*[\[{]/.test(body)) {
          try { body = JSON.stringify(normalize(JSON.parse(body))); } catch { return res.status(500).end(); }
        }
        return send.call(this,body);
      };
    }
    next();
  } catch (error) {
    if (error instanceof errs.AuthError || error instanceof errs.PermissionError || ['JsonWebTokenError','TokenExpiredError','NotBeforeError'].includes(error.name)) return res.status(403).json({error:{code:403,message:'Permission Denied'}});
    next(error);
  }
}
