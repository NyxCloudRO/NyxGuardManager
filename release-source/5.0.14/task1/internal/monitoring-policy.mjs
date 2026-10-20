// Explicit operations, never HTTP-method-derived authorization.
export const LEGACY_FIELDS = ['proxy_hosts','redirection_hosts','dead_hosts','streams','access_lists','certificates'];
export function isMonitoring(user) {
  if (user?.roles?.includes('nyxagent')) return true;
  return !user?.roles?.includes('admin') && user?.permissions?.visibility === 'all'
    && LEGACY_FIELDS.every(key => user.permissions[key] === 'view');
}
export const READ_PERMISSIONS = new Set([
  'access_lists:get','access_lists:list','certificates:get','certificates:list',
  'proxy_hosts:get','proxy_hosts:list','dead_hosts:get','dead_hosts:list',
  'redirection_hosts:get','redirection_hosts:list','streams:get','streams:list',
  'reports:hosts','settings:get','settings:list','nyxguard:get','nyxguard:list',
  'web_controls:get','web_controls:list','users:get','users:list','auditlog:list',
]);
export const READ_ROUTES = [
  /^\/_nyxguard\/lan-access\/check$/,
  /^\/$/, /^\/schema\/?$/, /^\/avatar\/[1-9]\d*$/,
  /^\/users(?:\/(?:me|[1-9]\d*))?\/?$/,
  /^\/reports\/hosts$/, /^\/audit-log(?:\/[1-9]\d*)?\/?$/,
  /^\/event-center\/(?:options|events)$/,
  /^\/settings(?:\/[a-zA-Z0-9_-]+)?\/?$/,
  /^\/nyxguard\/(?:summary|ips|settings|apps|apps\/summary|attacks|attacks\/summary|rate-status|geoip|rules\/ip|rules\/country|waf-rules)$/,
  /^\/web-threat\/(?:effective|analytics\/overview|events)$/,
  /^\/(?:integrations|notifications)\/?$/,
  /^\/lan-access\/(?:config|arp-scan)$/,
  /^\/vpn-client\/(?:status|sites|sites\/[a-zA-Z0-9_-]+)$/,
  /^\/nginx\/proxy-hosts(?:\/[1-9]\d*)?\/?$/,
  /^\/nginx\/access-lists(?:\/[1-9]\d*)?\/?$/,
  /^\/nginx\/certificates(?:\/[1-9]\d*|\/dns-providers)?\/?$/,
  /^\/professional-support\/(?:status|problems|operations|diagnostics)$/,
  /^\/update-manager\/(?:status|changelog|whats-new)$/,
  /^\/update-manager\/job\/[a-zA-Z0-9_-]+$/,
  /^\/developer-message\/?$/, /^\/grafana\/dashboard\.json$/,
  /^\/auth\/sso\/config$/, /^\/version\/check$/,
];
export function canonicalPath(path) {
  // Reject encoded path ambiguity; Express params can otherwise decode separators.
  if (path.includes('%') || path.includes('\\') || path.includes('//')) return null;
  return path.replace(/^\/api(?=\/|$)/,'') || '/';
}
export function personalOperation(userId,method,path){
  if(!Number.isSafeInteger(Number(userId))||Number(userId)<=0)return false;
  const own=new RegExp('^/users/(?:me|'+Number(userId)+')$');
  if(method==='PUT'&&own.test(path))return true;
  if(method==='PUT'&&new RegExp('^/users/(?:me|'+Number(userId)+')/auth$').test(path))return true;
  return ['POST','DELETE'].includes(method)&&new RegExp('^/users/(?:me|'+Number(userId)+')/avatar$').test(path);
}
export function monitoringOperation(method, path, query = {}, userId) {
  path = canonicalPath(path);
  if (!path) return false;
  if(personalOperation(userId,method,path))return true;
  if (method === 'GET' && /^\/tokens\/?$/.test(path)) return !query.scope || query.scope === 'user';
  if (method === 'POST' && path === '/tokens/logout') return true;
  // Personal acknowledgement: the handler ignores target IDs and updates only
  // the authenticated user's acknowledgement timestamp, never shared settings.
  if (method === 'POST' && /^\/developer-message\/?$/.test(path)) return true;
  return method === 'GET' && READ_ROUTES.some(pattern => pattern.test(path));
}
const SECRET_KEY = /password|passphrase|passwd|secret|token|credential|(?:private|preshared|api|access|client|license|certificate|ssl).?key|recovery.?key|backup.?codes|totp|authorization|cookie|session|sealed|vault|encryption|dns_provider_credentials|config_json|advanced_config|raw_config|^(?:key|pass|psk|environment|env)$/i;
const SECRET_TEXT = /-----BEGIN [^-]*PRIVATE KEY-----|\b(?:Bearer|Basic)\s+\S+|(?:password|secret|token|api[_-]?key|private[_-]?key|authorization|cookie)\s*[:=]|[?&](?:password|secret|token|key)=|https?:\/\/[^\s/@:]+:[^\s/@]+@/i;
export function redactMonitoring(value, depth = 0) {
  if (depth > 30) return '[REDACTED]';
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.toISOString() : null;
  if (typeof value === 'string') return SECRET_TEXT.test(value) ? '[REDACTED]' : value;
  if (Array.isArray(value)) return value.map(item => redactMonitoring(item, depth + 1));
  if (value && typeof value === 'object') {
    const out = Object.create(null);
    for (const [key,item] of Object.entries(value)) {
      if (['botUaTokens','botPathTokens','bot_ua_tokens','bot_path_tokens','cookieFlags','cookie_flags'].includes(key)) out[key] = redactMonitoring(item,depth+1);
      else if (/(?:configured|enabled|count|remaining|available|seconds|minutes|hours|days|ttl)$/i.test(key) && ['boolean','number'].includes(typeof item)) out[key]=item;
      else if (key === 'value' && SECRET_KEY.test(String(value.id ?? ''))) out[key] = item ? '[REDACTED]' : item;
      else if (SECRET_KEY.test(key) || /^(?:webhook(?:url)?|url)$/i.test(key) && typeof item === 'string' && /hooks|webhook/i.test(item)) out[key] = item ? '[REDACTED]' : item;
      else if (typeof item === 'string' && /^\s*[\[{]/.test(item)) {
        try { out[key] = JSON.stringify(redactMonitoring(JSON.parse(item),depth+1)); }
        catch { out[key] = redactMonitoring(item,depth+1); }
      }
      else out[key] = redactMonitoring(item,depth + 1);
    }
    return out;
  }
  return value;
}
