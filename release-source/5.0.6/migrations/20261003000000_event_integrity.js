import {advance} from '../internal/startup-progress.mjs';
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
  const [{total}]=await k("audit_log").count("* as total").timeout(30000,{cancel:true});
  let completed=0;advance("migration-audit",0,Number(total));
  let last = 0;
  for (;;) {
    const rows = await k('audit_log').where('id','>',last).orderBy('id').limit(200).timeout(30000,{cancel:true});
    if (!rows.length) break;
    const updates=rows.map(row=>{
      let meta;try{meta=typeof row.meta==='string'?JSON.parse(row.meta):row.meta;}catch{meta={};}
      const result=['login_success','login_failed','deny'].includes(row.action)?({login_success:'success',login_failed:'failed',deny:'denied'})[row.action]:row.result;
      const external=['access-login','access-check'].includes(row.object_type);
      return {id:row.id,category:categoryFor(row.object_type),result,user_id:external?0:row.user_id,actor_kind:external?'unauthenticated':row.actor_kind,meta:JSON.stringify(sanitizeContext(meta))};
    });
    const columns=['category','result','user_id','actor_kind','meta'],bindings=[];
    const sets=columns.map(column=>{
      const cases=updates.map(row=>{bindings.push(row.id,row[column]);return 'WHEN ? THEN ?';}).join(' ');
      return '`'+column+'`=CASE id '+cases+' ELSE `'+column+'` END';
    });
    bindings.push(...updates.map(row=>row.id));
    await k.raw('UPDATE audit_log SET '+sets.join(',')+' WHERE id IN ('+updates.map(()=>'?').join(',')+')',bindings).timeout(30000,{cancel:true});
    last=rows.at(-1).id;completed+=rows.length;
    advance('migration-audit',completed,Number(total));
  }
  advance('migration-rules',completed,Number(total));
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
  advance("migration-history",completed,Number(total));
  await backfillLegacyHistory(k);

}
export async function down() {
  throw new Error('History-preserving migration is forward-only; restore a verified pre-migration backup for rollback');
}
