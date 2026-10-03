import auditLog from './audit-log.js';
import {express as logger} from '../logger.js';
const targets = [
  [/^\/nyxguard\/rules\/ip(?:\/(\d+))?$/, 'ip-rule'],
  [/^\/nyxguard\/rules\/country(?:\/(\d+))?$/, 'country-rule'],
  [/^\/nyxguard\/waf-rules(?:\/(\d+))?$/, 'waf-rule'],
  [/^\/nyxguard\/settings$/, 'security-settings'],
  [/^\/nyxguard\/apps\/(\d+)/, 'security-settings'],
  [/^\/nyxguard\/attacks\/ban$/, 'ip-rule'],
  [/^\/web-threat\/policy-sets\/(\d+)\/(?:versions|activate|rollback)$/, 'web-threat-policy'],
  [/^\/settings(?:\/([^/]+))?$/, 'setting'],
  [/^\/integrations(?:\/(\d+))?$/, 'integration'],
  [/^\/notifications\/(?:channels)(?:\/(\d+))?$/, 'notification-channel'],
  [/^\/users(?:\/(\d+))?/, 'user', true],
  [/^\/nginx\/proxy-hosts(?:\/(\d+))?/, 'proxy-host', true],
  [/^\/nginx\/access-lists(?:\/(\d+))?/, 'access-list', true],
  [/^\/nginx\/redirection-hosts(?:\/(\d+))?/, 'redirection-host', true],
  [/^\/nginx\/dead-hosts(?:\/(\d+))?/, 'dead-host', true],
  [/^\/nginx\/certificates(?:\/(\d+))?/, 'certificate', true],
  [/^\/nginx\/streams(?:\/(\d+))?/, 'stream', true],
];
export default function adminAudit(req,res,next) {
  if (!['POST','PUT','PATCH','DELETE'].includes(req.method)) return next();
  const entry = targets.map(([pattern,type,failureOnly])=>({match:req.path.match(pattern),type,failureOnly})).find(e=>e.match);
  if (!entry) return next();
  const send = res.send;
  let recorded = false;
  res.send = function(body) {
    if (recorded || (entry.failureOnly && res.statusCode < 400) || !res.locals.access?.token?.getUserId()) return send.call(this,body);
    recorded = true;
    const id = Number(entry.match[1]) || Number(body?.item?.id ?? body?.id ?? body?.ruleId) || 0;
    const action = req.path.endsWith('/activate') ? 'activated' : req.path.endsWith('/rollback') ? 'rolled_back' : req.path.endsWith('/attacks/ban') ? 'manual_ban' : req.method === 'DELETE' ? 'deleted' : req.method === 'POST' ? 'created' : 'updated';
    // Only route/method/result and server response identity enter this audit. No request body is copied.
    void auditLog.add(res.locals.access,{action,object_type:entry.type,object_id:id,
      result:res.statusCode < 400 ? 'success' : res.statusCode === 403 ? 'denied' : 'failed',meta:{status:res.statusCode}})
      .then(()=>send.call(res,body)).catch(()=>{logger.error('Administrative audit persistence failed');send.call(res,body);});
    return res;
  };
  next();
}
