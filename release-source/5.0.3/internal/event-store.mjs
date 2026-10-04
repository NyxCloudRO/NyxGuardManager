import {CATEGORIES, sanitizeContext} from './audit-policy.mjs';
export function normalizeScope(input = {}, now = Date.now()) {
  const category = input.category || input.scope || 'all';
  if (category !== 'all' && !CATEGORIES.includes(category)) throw new Error('Invalid event category');
  const hours = Number(input.hours ?? 24);
  if (![0, 24, 168, 720, 4320].includes(hours)) throw new Error('Invalid time window');
  const actor = input.actor === undefined || input.actor === '' ? null : Number(input.actor);
  if (actor !== null && (!Number.isSafeInteger(actor) || actor < 0)) throw new Error('Invalid actor');
  const action = input.action || '';
  if (typeof action !== 'string' || action.length > 255) throw new Error('Invalid action');
  const search = input.search || '';
  if (typeof search !== 'string' || search.length > 100) throw new Error('Invalid search');
  const actorKind = input.actorKind || '';
  if (!['','user','system','unauthenticated','legacy'].includes(actorKind)) throw new Error('Invalid actor kind');
  const result = input.result || '';
  if (!['','success','failed','denied','unknown'].includes(result)) throw new Error('Invalid result');
  return {category, hours, actor, actorKind, result, action, search, after: hours ? new Date(now - hours * 3600000) : null};
}
export function scopedQuery(k, scope) {
  const q = k('audit_log');
  if (scope.category !== 'all') q.where('category', scope.category);
  if (scope.actorKind) q.where('actor_kind', scope.actorKind);
  if (scope.result) q.where('result', scope.result);
  if (scope.actor !== null) q.where('user_id', scope.actor);
  if (scope.action) q.where('action', scope.action);
  if (scope.search) q.andWhere(function(){
    this.whereRaw('LOCATE(?, object_type) > 0',[scope.search]).orWhereRaw('LOCATE(?, action) > 0',[scope.search])
      .orWhereRaw('LOCATE(?, CAST(object_id AS CHAR)) > 0',[scope.search]).orWhereRaw('LOCATE(?, meta) > 0',[scope.search])
      .orWhereExists(k('user as actor').select(k.raw('1')).whereColumn('actor.id','audit_log.user_id').whereRaw('LOCATE(?, actor.name) > 0',[scope.search]));
  });
  if (scope.after) q.where('created_on', '>=', k.raw('DATE_SUB(NOW(), INTERVAL ? HOUR)', [scope.hours]));
  return q;
}
export async function listEvents(k, input = {}) {
  const scope = normalizeScope(input);
  const limit = Number(input.limit ?? 100), offset = Number(input.offset ?? 0);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 500 || !Number.isSafeInteger(offset) || offset < 0 || offset > 1000000) throw new Error('Invalid pagination');
  const counts = await scopedQuery(k, scope).select('category').count({count:'*'}).sum({occurrences:'event_count'}).groupBy('category');
  const counters = Object.fromEntries(CATEGORIES.map(c => [c, 0]));
  for (const row of counts) counters[row.category] = Number(row.occurrences);
  const total = counts.reduce((n,r)=>n+Number(r.count),0);
  const occurrences = Object.values(counters).reduce((a,b)=>a+b,0);
  const rows = await scopedQuery(k, scope).select('*', k.raw('UNIX_TIMESTAMP(created_on) * 1000 AS timestamp_ms'), k.raw('UNIX_TIMESTAMP(last_seen) * 1000 AS last_seen_ms')).orderBy('created_on','desc').orderBy('id','desc').limit(limit).offset(offset);
  const ids = [...new Set(rows.map(r=>r.user_id).filter(Boolean))];
  const actors = ids.length ? await k('user').select('id','name').whereIn('id',ids) : [];
  const names = new Map(actors.map(r=>[r.id,r.name]));
  return {total, occurrences, counters, limit, offset, items: rows.map(r=>({id:r.id, actorId:r.user_id,
    actor: r.user_id ? names.get(r.user_id) || `User #${r.user_id}` : r.actor_kind === 'system' ? 'System' : 'Unauthenticated', actorKind:r.actor_kind, action:r.action,
    category:r.category, targetType:r.object_type, targetId:r.object_id, timestamp:new Date(Number(r.timestamp_ms)).toISOString(),
    result:r.result, count:Number(r.event_count), lastSeen:r.last_seen_ms ? new Date(Number(r.last_seen_ms)).toISOString() : null, context:contextFor(r.meta), targetLabel:targetLabel(r)}))};
}
export async function clearEvents(k, input) {
  const scope = normalizeScope(input);
  // One narrowly scoped statement is atomic on Aria; no cross-table transaction is claimed.
  const deleted = await scopedQuery(k, scope).delete();
  return {deleted, scope:{category:scope.category, actor:scope.actor, actorKind:scope.actorKind, result:scope.result, action:scope.action, search:scope.search, hours:scope.hours}};
}

function contextFor(meta) {
  try {return sanitizeContext(typeof meta === 'string' ? JSON.parse(meta || '{}') : meta);}
  catch {return {};}
}
function targetLabel(row) {
  const labels = {'access-check':'Access List','access-login':'Access List',authentication:'Authentication',
    'proxy-host':'Proxy Host',user:'User','ip-rule':'Traffic Rule','country-rule':'Country Rule',
    'waf-rule':'WAF Rule','access-list':'Access List',certificate:'Certificate',setting:'Setting',
    'professional_support':'Support operation','security-settings':'Security Settings'};
  const context=contextFor(row.meta);
  const type=labels[row.object_type] || row.object_type.replaceAll('-',' ');
  const name=context.name || (row.object_type==='professional_support' ? row.action.replace(/^nyxcloud\.support\./,'').replaceAll('.',' ') : '');
  return type + (name ? ': '+name : '') + (row.object_id ? ' (#'+row.object_id+')' : '');
}
