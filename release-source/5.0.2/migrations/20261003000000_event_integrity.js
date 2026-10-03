import {categoryFor, sanitizeContext} from '../internal/audit-policy.mjs';
import {backfillLegacyHistory} from '../internal/legacy-history.mjs';
export async function up(k) {
  if (!await k.schema.hasColumn('audit_log','category')) await k.schema.alterTable('audit_log',t=>{
    t.string('actor_kind',16).notNullable().defaultTo('legacy');
    t.string('category',32).notNullable().defaultTo('application');
    t.string('result',16).notNullable().defaultTo('unknown');
    t.index(['category','created_on'],'idx_audit_category_time');
    t.index(['user_id','created_on'],'idx_audit_actor_time');
    t.index(['action','created_on'],'idx_audit_action_time');
  });
  // Minimize existing audit context as well as all future writes; do not invent success for old rows.
  let last = 0;
  for (;;) {
    const rows = await k('audit_log').where('id','>',last).orderBy('id').limit(200);
    if (!rows.length) break;
    for (const row of rows) {
      last = row.id;
      let meta;try{meta=typeof row.meta==='string'?JSON.parse(row.meta):row.meta;}catch{meta={};}
      const result = ['login_success','login_failed','deny'].includes(row.action) ? ({login_success:'success',login_failed:'failed',deny:'denied'})[row.action] : row.result;
      await k('audit_log').where('id',row.id).update({category:categoryFor(row.object_type),result,...(['access-login','access-check'].includes(row.object_type)?{user_id:0,actor_kind:'unauthenticated'}:{}),meta:JSON.stringify(sanitizeContext(meta))});
    }
  }
  if (!await k.schema.hasColumn('nyxguard_ip_rule','rule_origin')) {
    await k.schema.alterTable('nyxguard_ip_rule',t=>{
      t.string('rule_origin',32).notNullable().defaultTo('manual');
      t.index(['rule_origin','expires_on'],'idx_rule_origin_expiry');
    });
    // Existing producer signatures are the historical ownership convention. New writes use explicit ownership.
    await k('nyxguard_ip_rule').where('action','deny').where('note','like','Auto-ban:%').update({rule_origin:'automatic_ban'});
    await k('nyxguard_ip_rule').where('action','allow').where('note','like','Auto-allow verified crawler:%').update({rule_origin:'verified_crawler'});
  }
  if (!await k.schema.hasColumn('nyxguard_attack_event','legacy_web_threat_id')) {
    await k.schema.alterTable('nyxguard_attack_event',t=>{
      t.bigInteger('legacy_web_threat_id').unsigned().nullable().unique();
      t.dateTime('created_on',{precision:3}).notNullable().alter();
    });
  }
  await backfillLegacyHistory(k);
}
export async function down() {
  throw new Error('History-preserving migration is forward-only; restore a verified pre-migration backup for rollback');
}
