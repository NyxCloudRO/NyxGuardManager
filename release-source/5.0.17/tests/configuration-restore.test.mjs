import test from 'node:test';import assert from 'node:assert/strict';
import knex from '/app/node_modules/knex/knex.mjs';
import {restoreConfiguration,publicBackupTable}from '../configuration-restore.mjs';
if(process.env.NYXGUARD_DISPOSABLE_FIXTURE!=='yes')throw Error('Disposable fixture acknowledgement required');
const k=knex({client:'mysql2',connection:{host:'nyx-architecture-db',user:'root',database:'restoretest',timezone:'Z'},pool:{min:0,max:2}});
const names=['restore_items','restore_links'];
const source={restore_items:[{id:1,name:'preserved',created_on:'2026-10-21 04:00:00'}],restore_links:[{id:1,item_id:1}]};
const incoming={restore_items:[{id:2,name:'restored',created_on:'2026-10-21T05:06:07.000Z',rogue:'ignored'}],restore_links:[{id:2,item_id:2}]};
async function reset(engine='Aria'){
 for(const row of(await k.raw('SHOW TABLES'))[0]){const table=Object.values(row)[0];if(names.includes(table)||table.startsWith('nyxrestore_')||table==='nyxcloud_license_state')await k.schema.dropTableIfExists(table)}
 await k.raw('CREATE TABLE restore_items(id INT PRIMARY KEY,name VARCHAR(32) UNIQUE,created_on DATETIME NOT NULL) ENGINE='+engine);
 await k.raw('CREATE TABLE restore_links(id INT PRIMARY KEY,item_id INT NOT NULL) ENGINE='+engine);
 for(const table of names)await k(table).insert(source[table]);
}
const snapshot=async()=>JSON.stringify(await Promise.all(names.map(table=>k(table).orderBy('id'))));
const leftovers=async()=>(await k.raw('SHOW TABLES'))[0].map(row=>Object.values(row)[0]).filter(publicBackupTable).length;
function intercept(fn){return new Proxy(k,{apply:(target,thisArg,args)=>Reflect.apply(target,thisArg,args),get(target,key){if(key==='raw')return (sql,bindings)=>fn(sql,bindings,()=>target.raw(sql,bindings));const value=Reflect.get(target,key);return typeof value==='function'?value.bind(target):value}})}
test('Aria stages exported dates and swaps the complete dataset while retaining indexes and licensing',async()=>{
 await reset();await k.raw('CREATE TABLE nyxcloud_license_state(id INT PRIMARY KEY,marker VARCHAR(32)) ENGINE=Aria');await k('nyxcloud_license_state').insert({id:1,marker:'existing-installation'});
 const result=await restoreConfiguration(k,{...incoming,nyxcloud_license_state:[{id:1,marker:'foreign-installation'}]},[...names,'nyxcloud_license_state']);assert.equal(result.cleanupDeferred,false);
 assert.equal((await k('restore_items').first()).name,'restored');assert.equal((await k('restore_links').first()).item_id,2);assert.equal((await k('nyxcloud_license_state').first()).marker,'existing-installation');
 const [{stamp}]=await k.raw("SELECT DATE_FORMAT(created_on,'%Y-%m-%d %H:%i:%s') stamp FROM restore_items").then(r=>r[0]);assert.equal(stamp,'2026-10-21 05:06:07');assert((await k.raw('SHOW INDEX FROM restore_items'))[0].some(row=>row.Column_name==='name'&&row.Non_unique===0));
 assert(!(await k.raw('SHOW TABLES'))[0].some(row=>Object.values(row)[0].startsWith('nyxrestore_')));
});
test('invalid staged insert leaves all original Aria rows intact',async()=>{
 await reset();const before=await snapshot();await assert.rejects(restoreConfiguration(k,{...incoming,restore_links:[{id:2,item_id:null}]},names));assert.equal(await snapshot(),before);assert.equal(await leftovers(),2);
});
test('rename refusal leaves all source tables intact',async()=>{
 await reset();const before=await snapshot();const failing=intercept((sql,b,run)=>sql.startsWith('RENAME TABLE')?Promise.reject(Error('Controlled rename refusal')):run());await assert.rejects(restoreConfiguration(failing,incoming,names));assert.equal(await snapshot(),before);assert.equal(await leftovers(),2);
});
test('cleanup failure preserves committed rows and requires review before another restore',async()=>{
 await reset();const failing=intercept((sql,b,run)=>sql==='DROP TABLE ??'?Promise.reject(Error('Controlled cleanup refusal')):run());assert.equal((await restoreConfiguration(failing,incoming,names)).cleanupDeferred,true);assert.equal((await k('restore_items').first()).name,'restored');await assert.rejects(restoreConfiguration(k,incoming,names),/previous configuration restore/);assert.equal(publicBackupTable('nyxrestore_old_fixture'),false);
});
test('missing or malformed input never removes live rows',async()=>{
 await reset();const before=await snapshot();for(const payload of [{restore_items:[]},{...incoming,restore_items:[null]},{...incoming,restore_items:[{id:1,created_on:'2026-99-99T00:00:00Z'}]}])await assert.rejects(restoreConfiguration(k,payload,names));assert.equal(await snapshot(),before);
});
test('InnoDB insert failure rolls back both configuration tables',async()=>{
 await reset('InnoDB');const before=await snapshot();await assert.rejects(restoreConfiguration(k,{...incoming,restore_links:[{id:2,item_id:null}]},names));assert.equal(await snapshot(),before);
});
test.after(async()=>{await reset();for(const table of names)await k.schema.dropTable(table);await k.destroy()});
