export async function up(k) {
  if (!await k.schema.hasColumn('audit_log','event_count')) await k.schema.alterTable('audit_log', t => {
    t.bigInteger('event_count').unsigned().notNullable().defaultTo(1);
    t.dateTime('last_seen').nullable();
    t.string('noise_key',64).nullable();
    t.unique(['noise_key'],'idx_audit_noise_key');
    // 5.0.2 had category/actor/action-time indexes but no global time index:
    // unfiltered history and retention scanned the table and sorted all matches.
    t.index(['created_on','id'],'idx_audit_time_id');
  });
}
export async function down() {
  throw new Error('Event Center V2 is forward-only; restore a verified pre-migration backup');
}
