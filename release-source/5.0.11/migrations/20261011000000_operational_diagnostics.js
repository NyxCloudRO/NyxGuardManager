export async function up(knex) {
 if(!await knex.schema.hasTable('operational_diagnostic')) await knex.schema.createTable('operational_diagnostic',table=>{
  table.string('event_id',36).primary();table.string('created_on',24).notNullable().index();table.string('fingerprint',240).notNullable().index();table.text('payload').notNullable();
 });
}
export async function down() {} // Preserve support evidence through rollback.
