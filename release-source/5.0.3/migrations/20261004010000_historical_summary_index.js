export async function up(k){
 const [rows]=await k.raw('SHOW INDEX FROM nyxguard_traffic_stat WHERE Key_name = ?', ['idx_traffic_summary_cover']);
 const columns=['bucket','proxy_host_id','requests','bytes_in','bytes_out','status_2xx','status_3xx','status_4xx','status_5xx'];
 if(rows.length){if(rows.map(r=>r.Column_name).join(',')!==columns.join(','))throw Error('Historical summary index prerequisite mismatch');return;}
 // Global windows otherwise scan Aria data pages before grouping. Cover precisely
 // the existing summary aggregates; retain host/bucket uniqueness for ingestion.
 await k.schema.alterTable('nyxguard_traffic_stat',t=>t.index(columns,'idx_traffic_summary_cover'));
}
export async function down(){throw Error('Historical query optimization is forward-only; restore a verified backup');}
