import {retentionAllowed} from './retention-guard.mjs';
import {retainAuditHistory} from './audit-retention.mjs';
let expiredSignature;
export async function expireSecurityState(k, now=Date.now()) {
  // Expiration affects enforcement, not ownership of stored configuration.
  // The renderer and ruleState already exclude expired allowances/denials.
  // Preserve inactive and expired rows for administrators and upgrade recovery;
  // request a reload only when the expired set changes.
  const rows=await k('nyxguard_ip_rule').select('id','expires_on','enabled')
    .whereIn('rule_origin',['automatic_ban','verified_crawler'])
    .whereNotNull('expires_on').where('expires_on','<=',new Date(now)).orderBy('id')
    .timeout(10000,{cancel:true});
  const signature=JSON.stringify(rows);
  if(signature===expiredSignature)return 0;
  expiredSignature=signature;return rows.length;
}
export async function retainHistory(k,now=Date.now()) {
  // Preserve the backup baseline until upgrade/recovery verification completes.
  if(!await retentionAllowed()) return;
  await k('nyxguard_attack_event').whereNull('legacy_web_threat_id')
    .where('created_on','<',new Date(now-30*86400000)).delete();
  await retainAuditHistory(k);
}
