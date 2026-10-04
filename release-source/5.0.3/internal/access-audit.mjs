import crypto from 'node:crypto';
import net from 'node:net';
import {sanitizeContext} from './audit-policy.mjs';

// No-session redirects are access decisions, not credential submissions. Keep
// every occurrence, grouped only within a five-minute source/resource bucket.
// Supplied credentials, revoked users, changed hashes and exceptions stay individual.
export function accessDecision(req, reason, ctx = {}, now = Date.now()) {
  const listId = Number(ctx.listId ?? ctx.parsedList) || 0;
  const host = String(ctx.host || req.headers['x-nyxguard-original-host'] || req.headers.host || '').split(':')[0].toLowerCase();
  const peer = String(req.socket?.remoteAddress || '').replace(/^::ffff:/, '');
  const loopback = ['127.0.0.1', '::1'].includes(peer);
  const ip = loopback ? String(req.headers['x-real-ip'] || peer) : peer;
  const sourceIp = net.isIP(ip) ? ip : '';
  const supplied = Boolean(String(req.headers.cookie || '').match(/(?:^|;\s*)(?:__Host-)?nyxguard_access=[^;\s]+/) || req.query?.token || req.headers['x-nyxguard-access-token']);
  const code = reason === 'token_unverified' && !supplied ? 'session_absent' : reason;
  const meta = sanitizeContext({reason_code: code, host_id: listId, source_ip: sourceIp,
    resource: '/nginx/access-portal/check', name: host});
  const key = code === 'session_absent' ? crypto.createHash('sha256').update(JSON.stringify([
    Math.floor(now / 300000), listId, host, sourceIp, String(req.headers['user-agent'] || '')])).digest('hex') : null;
  return {user_id: 0, actor_kind: 'unauthenticated', category: 'access', object_type: 'access-check',
    object_id: listId, action: 'deny', result: 'denied', meta: JSON.stringify(meta), noise_key: key,
    event_count: 1};
}

export async function recordAccessDecision(k, req, reason, ctx) {
  const row = accessDecision(req, reason, ctx);
  if (!row.noise_key) return k('audit_log').insert({...row, created_on:k.fn.now(), modified_on:k.fn.now(), last_seen:k.fn.now()});
  // A unique nullable key makes grouping race-safe across requests/processes.
  // Existing occurrence counts survive restarts; no in-memory suppression cache.
  return k('audit_log').insert({...row, created_on:k.fn.now(), modified_on:k.fn.now(), last_seen:k.fn.now()})
    .onConflict('noise_key').merge({event_count:k.raw('event_count + 1'), last_seen:k.fn.now(), modified_on:k.fn.now()});
}
