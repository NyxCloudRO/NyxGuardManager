import {createHash}from'node:crypto';
const fields=['ip','app_id','app_name','host','country','reason','policy'];
export const groupHash=row=>createHash('sha256').update(fields.map(k=>{const v=String(row[k]);return Buffer.byteLength(v,'utf8')+':'+v;}).join('')).digest('hex');
export async function backfillGroups(k,progress=()=>{}){
 const sqlFields=fields.map(f=>f==='app_id'?'CAST(app_id AS CHAR)':f);
 const expression=`SHA2(CONCAT(${sqlFields.map(f=>`LENGTH(${f}),':',${f}`).join(',')}),256)`;
 let units=0;while(true){const [result]=await k.raw(`UPDATE nyxguard_blocked_bucket SET group_key=${expression} WHERE group_key IS NULL LIMIT 5000`);if(!result.affectedRows)return units;units+=result.affectedRows;progress(units);}
}
