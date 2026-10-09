import {advance} from '../internal/startup-progress.mjs';
export async function up(k) {
  advance('migration-event-center');
  if (!await k.schema.hasColumn('audit_log','event_count')) {
    await k.schema.alterTable('audit_log', t => {
      t.bigInteger('event_count').unsigned().notNullable().defaultTo(1);
      t.dateTime('last_seen').nullable();
      t.string('noise_key',64).nullable();
    });
    advance('migration-event-center-columns');
    await k.schema.alterTable('audit_log',t=>t.unique(['noise_key'],'idx_audit_noise_key'));
    advance('migration-event-center-noise-index');
    // Preserve the global history/retention index introduced in Event Center V2.
    await k.schema.alterTable('audit_log',t=>t.index(['created_on','id'],'idx_audit_time_id'));
    advance('migration-event-center-time-index');
  }
}
export async function down() {
  throw new Error('Event Center V2 is forward-only; restore a verified pre-migration backup');
}
