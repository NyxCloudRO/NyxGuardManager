import auditLog from './audit-log.js';
import {express as logger} from '../logger.js';
const targets = [
  [/^\/nyxguard\/rules\/ip(?:\/(\d+))?$/, 'ip-rule'],
  [/^\/nyxguard\/rules\/country(?:\/(\d+))?$/, 'country-rule'],
  [/^\/nyxguard\/waf-rules(?:\/(\d+))?$/, 'waf-rule'],
  [/^\/nyxguard\/settings$/, 'security-settings'],
  [/^\/nyxguard\/apps\/(\d+)/, 'security-settings'],
  [/^\/nyxguard\/apps\/(?:waf|bot|ddos|sqli)$/, 'security-settings'],
  [/^\/nyxguard\/logs\/clear$/, 'security-settings'],
  [/^\/nyxguard\/attacks\/ban$/, 'ip-rule'],
  [/^\/web-threat\/policy-sets\/(\d+)\/(?:versions|activate|rollback)$/, 'web-threat-policy'],
  [/^\/settings(?:\/([^/]+))?$/, 'setting'],
  [/^\/settings\/backup\/(?:import|reboot)$/, 'setting'],
  [/^\/nyxguard\/geoip\/config$/, 'security-settings'],
  [/^\/event-center\/clear$/, 'event-center'],
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
  // Capture before child routers temporarily strip their mount prefix.
  const resource = req.path;
  const entry = targets.map(([pattern,type,failureOnly])=>({match:resource.match(pattern),type,failureOnly})).find(e=>e.match);
  if (!entry) return next();
  const send = res.send;
  let recorded = false;
  res.send = function(body) {
    if (recorded || (entry.failureOnly && res.statusCode < 400) || !res.locals.access?.token?.getUserId()) return send.call(this,body);
    recorded = true;
    const id = Number(entry.match[1]) || Number(body?.item?.id ?? body?.id ?? body?.ruleId) || 0;
    const action = (resource.endsWith('/event-center/clear') || resource.endsWith('/logs/clear')) ? 'logs_cleared' : resource.endsWith('/activate') ? 'activated' : resource.endsWith('/rollback') ? 'rolled_back' : resource.endsWith('/attacks/ban') ? 'manual_ban' : req.method === 'DELETE' ? 'deleted' : req.method === 'POST' ? 'created' : 'updated';
    // Only route/method/result and server response identity enter this audit. No request body is copied.
    void auditLog.add(res.locals.access,{action,object_type:entry.type,object_id:id,
      result:res.statusCode < 400 ? 'success' : res.statusCode === 403 ? 'denied' : 'failed',meta:{status:res.statusCode,resource}})
      .then(()=>send.call(res,body)).catch(()=>{logger.error('Administrative audit persistence failed');send.call(res,body);});
    return res;
  };
  next();
}
