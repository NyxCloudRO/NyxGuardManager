import test from 'node:test';
import assert from 'node:assert/strict';
import {observedMigrations} from '../internal/observed-migrations.mjs';
function fixture(migration){
 const events=[];
 const source={getMigrations:()=>['migration.js'],getMigrationName:info=>info,getMigration:async()=>migration};
 const telemetry={start:name=>events.push(['start',name]),complete:name=>events.push(['complete',name]),failed:(name,code)=>events.push(['failed',name,code])};
 return {source:observedMigrations(source,telemetry),events};
}
test('discovery retains names and config without reporting execution',async()=>{
 const {source,events}=fixture({config:{transaction:false},up:async()=>42,down:async()=>7});
 assert.deepEqual(source.getMigrations(),['migration.js']);
 const migration=await source.getMigration('migration.js');
 assert.deepEqual(events,[]);assert.equal(migration.config.transaction,false);assert.equal(await migration.down(),7);
});
test('completed execution preserves argument identity and result',async()=>{
 const input={fixture:true};const {source,events}=fixture({up:async k=>{assert.equal(k,input);return 42;}});
 const migration=await source.getMigration('migration.js');assert.equal(await migration.up(input),42);
 assert.deepEqual(events,[['start','migration.js'],['complete','migration.js']]);
});
test('failure preserves original error while telemetry excludes its message',async()=>{
 const error=Object.assign(new Error('sensitive configuration'),{code:'invalid secret text'});
 const {source,events}=fixture({up:async()=>{throw error;}});const migration=await source.getMigration('migration.js');
 await assert.rejects(migration.up(),e=>e===error);
 assert.deepEqual(events,[['start','migration.js'],['failed','migration.js','DATABASE_MIGRATION_FAILED']]);
});
test('invalid migration remains invalid for Knex validation',async()=>{
 const original={down:async()=>{}};const {source,events}=fixture(original);
 assert.equal(await source.getMigration('migration.js'),original);assert.deepEqual(events,[]);
});
