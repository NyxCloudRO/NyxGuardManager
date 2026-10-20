import {advance,progressFile}from'../internal/startup-progress.mjs';
import fs from 'node:fs/promises';
import {backfillGroups}from'../internal/blocked-groups.mjs';
export async function up(k){
 if(!await k.schema.hasColumn('nyxguard_blocked_bucket','group_key'))await k.schema.alterTable('nyxguard_blocked_bucket',t=>t.string('group_key',64).nullable());
 const startUnits=JSON.parse(await fs.readFile(progressFile,'utf8')).units;
 const [{n}]=await k('nyxguard_blocked_bucket').whereNull('group_key').count({n:'id'});
 advance('migration-blocked-groups',startUnits,startUnits+Number(n));
 await backfillGroups(k,units=>advance('migration-blocked-groups',startUnits+units,startUnits+Number(n)));
 advance('migration-blocked-index');
 const [indexes]=await k.raw('SHOW INDEX FROM nyxguard_blocked_bucket');
 if(!indexes.some(r=>r.Key_name==='blocked_window_cover'))await k.schema.alterTable('nyxguard_blocked_bucket',t=>t.index(['minute','group_key','id','requests','first_sec','last_sec','ip','app_id','reason','country'],'blocked_window_cover'));
 if(indexes.some(r=>r.Key_name==='nyxguard_blocked_bucket_group_key_index'))await k.schema.alterTable('nyxguard_blocked_bucket',t=>t.dropIndex('group_key','nyxguard_blocked_bucket_group_key_index'));
 advance('migration-blocked-index-complete');
}
export async function down(){} // Preserve retained observations through rollback.
