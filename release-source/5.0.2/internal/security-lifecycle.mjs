export async function expireSecurityState(k, now = Date.now()) {
  const deleted = await k('nyxguard_ip_rule').whereIn('rule_origin', ['automatic_ban','verified_crawler'])
    .whereNotNull('expires_on').where('expires_on','<=',new Date(now)).delete();
  return deleted;
}
export async function retainHistory(k, now = Date.now()) {
  // Legacy recovered history is explicitly retained until an administrator clears Threat Activity.
  await k('nyxguard_attack_event').whereNull('legacy_web_threat_id')
    .where('created_on','<',new Date(now - 30 * 86400000)).delete();
  const setting = await k('setting').where('id','audit-log-retention-days').first();
  const days = Number(setting?.value ?? 180);
  if (Number.isInteger(days) && days > 0) await k('audit_log').where('created_on','<',new Date(now - days * 86400000)).delete();
}
