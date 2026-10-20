import {randomUUID} from 'node:crypto';
export async function up(k){
 if(!await k.schema.hasTable('nyxguard_blocked_bucket'))await k.schema.createTable('nyxguard_blocked_bucket',t=>{
  t.string('id',64).primary();t.string('generation',36).notNullable().index();t.integer('minute').unsigned().notNullable().index();
  t.string('ip',45).notNullable().index();t.integer('app_id').unsigned().notNullable().index();t.string('app_name',255).notNullable();t.string('host',253).notNullable();t.string('country',2).notNullable().index();t.string('reason',32).notNullable().index();t.text('policy').notNullable();t.text('vector').notNullable();t.bigInteger('requests').unsigned().notNullable();t.integer('first_sec').unsigned().notNullable();t.integer('last_sec').unsigned().notNullable();
 });
 if(!await k.schema.hasTable('nyxguard_blocked_state'))await k.schema.createTable('nyxguard_blocked_state',t=>{t.integer('id').primary();t.string('generation',36).notNullable();t.text('pending').nullable();t.text('health').notNullable();});
 if(!await k('nyxguard_blocked_state').where({id:1}).first())await k('nyxguard_blocked_state').insert({id:1,generation:randomUUID(),health:'{}'});
}
export async function down(){} // Preserve monitoring evidence on rollback.
