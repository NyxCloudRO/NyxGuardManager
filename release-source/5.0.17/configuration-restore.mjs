import {randomBytes}from'node:crypto';
const INTERNAL=/^nyxrestore_/;
const PROTECTED=new Set(['migrations','migrations_lock','sqlite_sequence','nyxcloud_license_state','nyxcloud_support_upload']);
let restoring=false;
export const publicBackupTable=name=>!INTERNAL.test(name);
function rowsFor(table,columns,payload){
 if(!Array.isArray(payload[table]))throw Error('Backup is missing a required configuration table.');
 return payload[table].map(row=>{
  if(!row||typeof row!=='object'||Array.isArray(row))throw Error('Backup contains an invalid configuration row.');
  const result={};
  for(const [name,column]of Object.entries(columns)){
   if(!Object.hasOwn(row,name))continue;
   let value=row[name];
   if(/^(?:date|datetime|timestamp)/i.test(column.type)&&typeof value==='string'&&/^\d{4}-\d\d-\d\dT/.test(value)){
    const stamp=new Date(value);if(!Number.isFinite(stamp.getTime()))throw Error('Backup contains an invalid timestamp.');
    value=/^date$/i.test(column.type)?stamp.toISOString().slice(0,10):stamp.toISOString().slice(0,23).replace('T',' ');
   }
   if(/blob|binary|bytea/i.test(column.type)&&value?.type==='Buffer'&&Array.isArray(value.data))value=Buffer.from(value.data);
   result[name]=value;
  }
  if(!Object.keys(result).length)throw Error('Backup row has no supported fields.');
  return result;
 });
}
async function insert(k,target,source,columns,rows){for(let i=0;i<rows.length;i+=200)await k(target).insert(rowsFor(source,columns,{[source]:rows.slice(i,i+200)}))}
export async function restoreConfiguration(k,payload,allTables){
 if(restoring)throw Object.assign(Error('Another configuration restore is active.'),{status:409});
 restoring=true;
 try{
  const tables=allTables.filter(name=>!PROTECTED.has(name)&&!INTERNAL.test(name));
  if(!tables.length||tables.some(name=>!/^[a-zA-Z0-9_]+$/.test(name)))throw Error('Configuration schema requires review.');
  // Validate shapes and convert exported UTC Date values before live mutation.
  const schemas=new Map();for(const table of tables){
   const columns=await k(table).columnInfo();schemas.set(table,columns);
   if(!Array.isArray(payload[table]))throw Error('Backup is missing a required configuration table.');
   for(let i=0;i<payload[table].length;i+=200)rowsFor(table,columns,{[table]:payload[table].slice(i,i+200)});
  }
  const mysql=/mysql/i.test(k.client.config.client);
  if(mysql){
   const status=(await k.raw('SHOW TABLE STATUS'))[0];
   if(status.some(row=>INTERNAL.test(row.Name)))throw Error('A previous configuration restore requires review.');
   const engines=new Map(status.map(row=>[row.Name,String(row.Engine||'').toLowerCase()]));
   if(tables.some(table=>engines.get(table)!=='innodb')){
    const version=String((await k.raw('SELECT VERSION() AS version'))[0][0].version),match=/^(\d+)\.(\d+)\.(\d+)/.exec(version);
    if(!/MariaDB/i.test(version)||!match||Number(match[1])<10||(Number(match[1])===10&&(Number(match[2])<6||(Number(match[2])===6&&Number(match[3])<1))))throw Error('This database cannot safely replace nontransactional configuration tables.');
    if(tables.some(table=>!['aria','innodb','myisam'].includes(engines.get(table))))throw Error('Unsupported configuration table engine.');
    const constraints=(await k.raw("SELECT TABLE_NAME,REFERENCED_TABLE_NAME FROM information_schema.KEY_COLUMN_USAGE WHERE CONSTRAINT_SCHEMA=DATABASE() AND REFERENCED_TABLE_NAME IS NOT NULL"))[0];
    const triggers=(await k.raw('SHOW TRIGGERS'))[0];
    if(constraints.some(row=>tables.includes(row.TABLE_NAME)||tables.includes(row.REFERENCED_TABLE_NAME))||triggers.some(row=>tables.includes(row.Table)))throw Error('Custom database dependencies require restore review.');
    const nonce=randomBytes(8).toString('hex'),stages=[],previous=[];let committed=false;
    try{
     for(const [index,table]of tables.entries()){
      const staged='nyxrestore_new_'+nonce+'_'+index,old='nyxrestore_old_'+nonce+'_'+index;
      await k.raw('CREATE TABLE ?? LIKE ??',[staged,table]);stages.push(staged);previous.push(old);
      // All constraints and values must succeed in staged copies first.
      await insert(k,staged,table,schemas.get(table),payload[table]);
     }
     const pairs=tables.flatMap((table,index)=>[[table,previous[index]],[stages[index],table]]);
     // MariaDB >=10.6 atomically swaps mixed Aria/InnoDB tables in one statement.
     await k.raw('RENAME TABLE '+pairs.map(()=>'?? WAIT 5 TO ??').join(', '),pairs.flat());committed=true;
     const deferred=[];for(const old of previous){try{await k.raw('DROP TABLE ??',[old])}catch{deferred.push(old)}}
     return {cleanupDeferred:deferred.length>0};
    }finally{
     if(!committed)for(const staged of stages){try{await k.raw('DROP TABLE IF EXISTS ??',[staged])}catch{}}
    }
   }
  }
  // Transactional engines retain native all-or-nothing rollback behavior.
  await k.transaction(async trx=>{
   try{
    if(mysql)await trx.raw('SET FOREIGN_KEY_CHECKS = 0');
    for(const table of tables)await trx(table).del();
    for(const table of tables)await insert(trx,table,table,schemas.get(table),payload[table]);
   }finally{if(mysql)await trx.raw('SET FOREIGN_KEY_CHECKS = 1')}
  });
  return {cleanupDeferred:false};
 }finally{restoring=false}
}
