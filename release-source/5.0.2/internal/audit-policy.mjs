export const CATEGORIES = ['security', 'users', 'application', 'access', 'configuration'];
export function categoryFor(type) {
  if (['access-login', 'access-check'].includes(type)) return 'access';
  if (['user', 'authentication'].includes(type)) return 'users';
  if (['ip-rule', 'country-rule', 'waf-rule', 'security-settings', 'web-threat-policy'].includes(type)) return 'security';
  if (['proxy-host', 'redirection-host', 'dead-host', 'access-list', 'certificate', 'stream', 'setting', 'integration', 'notification-channel'].includes(type)) return 'configuration';
  return 'application';
}
// Deliberately exclude free-form descriptions, URLs, request bodies and nested objects.
const TEXT_FIELDS = new Set(['name', 'result', 'ctx', 'reason_code']);
const NUMBER_FIELDS = new Set(['id', 'host_id', 'status', 'rule_id', 'count']);
const BOOLEAN_FIELDS = new Set(['enabled']);
export function sanitizeContext(meta) {
  const out = {};
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return out;
  for (const [key, value] of Object.entries(meta)) {
    if (TEXT_FIELDS.has(key) && typeof value === 'string') out[key] = value.slice(0, 128);
    if (NUMBER_FIELDS.has(key) && Number.isSafeInteger(value)) out[key] = value;
    if (BOOLEAN_FIELDS.has(key) && typeof value === 'boolean') out[key] = value;
  }
  return out;
}
export function auditFields(access, data) {
  const actor = access?.token?.getUserId();
  if (!Number.isSafeInteger(actor) || actor <= 0) throw new Error('Authenticated audit actor required');
  if (typeof data.action !== 'string' || !data.action) throw new Error('Audit action required');
  const type = String(data.object_type || '').slice(0, 255);
  return {user_id: actor, actor_kind:'user', action: data.action.slice(0, 255), object_type: type,
    object_id: Number.isSafeInteger(data.object_id) && data.object_id >= 0 ? data.object_id : 0,
    category: categoryFor(type), result: ['success', 'failed', 'denied'].includes(data.result) ? data.result : 'success',
    meta: sanitizeContext(data.meta)};
}

export function systemAuditFields(data) {
  const row=auditFields({token:{getUserId:()=>1}},data);
  return {...row,user_id:0,actor_kind:'system'};
}
