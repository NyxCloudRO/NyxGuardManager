// DDL is deliberately resumable: both traffic tables must be InnoDB before the
// collector starts. Preserve all existing rows, keys and original cursor offsets.
export const config={transaction:false};
export async function up(k){
 for(const name of ['nyxguard_traffic_stat','nyxguard_traffic_state']){
  const [rows]=await k.raw('SELECT ENGINE FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=?',[name]);
  if(rows.length!==1)throw Error('Missing traffic migration prerequisite: '+name);
  if(rows[0].ENGINE!=='InnoDB')await k.raw('ALTER TABLE ?? ENGINE=InnoDB',[name]);
 }
 if(!await k.schema.hasColumn('nyxguard_traffic_state','integrity'))await k.schema.alterTable('nyxguard_traffic_state',t=>t.text('integrity').nullable());
}
export async function down(){throw Error('Traffic integrity migration preserves history; restore verified schema/backup under an approved rollback procedure');}
