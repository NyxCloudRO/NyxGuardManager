export const AUDIT_RETENTION_DEFAULT_DAYS = 180;
export const AUDIT_RETENTION_BATCH = 1000;
export function retentionDays(value) {
  const days = Number(value ?? AUDIT_RETENTION_DEFAULT_DAYS);
  // Preserve the existing explicit zero (manual retention) option. Invalid
  // settings use the existing default rather than silently disabling cleanup.
  return Number.isSafeInteger(days) && days >= 0 && days <= 36500 ? days : AUDIT_RETENTION_DEFAULT_DAYS;
}
export async function retainAuditHistory(k) {
  const setting = await k('setting').where('id','audit-log-retention-days').first();
  const days = retentionDays(setting?.value);
  if (!days) return {deleted:0, days, batch:AUDIT_RETENTION_BATCH};
  // Knex's MySQL delete compiler ignores limit/orderBy. Use the dialect's
  // bounded single-table DELETE explicitly; bindings keep configuration safe.
  const [result] = await k.raw('DELETE FROM audit_log WHERE created_on < DATE_SUB(NOW(), INTERVAL ? DAY) ORDER BY created_on, id LIMIT ?', [days,AUDIT_RETENTION_BATCH]);
  const deleted = Number(result.affectedRows);
  return {deleted, days, batch:AUDIT_RETENTION_BATCH};
}
