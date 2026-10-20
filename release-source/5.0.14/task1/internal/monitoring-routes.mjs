// Review the registered operation, not just a concrete URL that could overlap
// an existing dynamic read route (for example a new GET /settings/restart).
const READ_DEFINITIONS = new Set([
  '/', '/avatar/:user_id', '/schema', '/users', '/users/:user_id',
  '/reports/hosts', '/audit-log', '/audit-log/:event_id',
  '/event-center/options', '/event-center/events', '/settings', '/settings/:setting_id',
  '/nyxguard/summary', '/nyxguard/ips', '/nyxguard/settings', '/nyxguard/apps',
  '/nyxguard/apps/summary', '/nyxguard/attacks', '/nyxguard/attacks/summary',
  '/nyxguard/rate-status', '/nyxguard/geoip', '/nyxguard/rules/ip',
  '/nyxguard/rules/country', '/nyxguard/waf-rules',
  '/web-threat/effective', '/web-threat/analytics/overview', '/web-threat/events',
  '/integrations', '/notifications', '/lan-access/config', '/lan-access/arp-scan',
  '/vpn-client/status', '/vpn-client/sites', '/vpn-client/sites/:id',
  '/nginx/proxy-hosts', '/nginx/proxy-hosts/:host_id',
  '/nginx/access-lists', '/nginx/access-lists/:list_id',
  '/nginx/certificates', '/nginx/certificates/:certificate_id', '/nginx/certificates/dns-providers',
  '/professional-support/status', '/professional-support/problems',
  '/professional-support/operations', '/professional-support/diagnostics',
  '/update-manager/status', '/update-manager/changelog', '/update-manager/whats-new',
  '/update-manager/job/:id', '/developer-message', '/grafana/dashboard.json',
  '/auth/sso/config', '/version/check', '/tokens',
]);
const normalize = path => path.replace(/\/$/,'') || '/';

export function registeredDefinition(router, method, pathname, prefix = '', depth = 0) {
  if (depth > 12) return null;
  // Matching is synchronous and never invokes middleware or handlers. Express
  // rematches layers when normal dispatch begins. The pinned router API is
  // exercised by the regression test and authenticated endpoint matrix.
  for (const layer of router.stack || []) {
    if (typeof layer.match !== 'function' || !layer.match(pathname)) continue;
    if (layer.route) {
      if (!layer.route.stack.some(handler => handler.method === method.toLowerCase())) continue;
      return typeof layer.route.path === 'string' ? normalize(prefix + layer.route.path) : null;
    }
    if (Array.isArray(layer.handle?.stack)) {
      const mounted = layer.path || '';
      const found = registeredDefinition(layer.handle,method,pathname.slice(mounted.length) || '/',prefix + mounted,depth + 1);
      if (found) return found;
    }
  }
  return null;
}

export function reviewedDefinition(method, definition) {
  if (!definition) return false;
  return method === 'GET' && READ_DEFINITIONS.has(definition)
    || method === 'POST' && ['/tokens/logout','/developer-message'].includes(definition);
}
