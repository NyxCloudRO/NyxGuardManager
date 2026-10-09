import mysql from '/app/node_modules/mysql2/index.js';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {runSqlHelper,sqlProgress,docker} from '/app/internal/recovery-docker.mjs';
import {prepareDatabaseSnapshot} from '/app/internal/recovery-database.mjs';
import {captureIntegrity,validateIntegrity} from '/app/internal/database-integrity.mjs';
const c=mysql.createConnection({host:'127.0.0.1',user:'root',password:process.env.NYXGUARD_TEST_PASSWORD,dateStrings:true,supportBigNumbers:true,bigNumberStrings:true});
const q=async(s,a=[])=>(await c.promise().query(s,a))[0];
const inspected=await docker('GET','/containers/'+process.env.NYXGUARD_TEST_DB+'/json');
if(inspected.Config.Labels?.['nyxguard.task']!=='507')throw new Error('Explicit owned DEV SQL fixture required');
const database=process.env.NYXGUARD_TEST_DATABASE; const expected=await captureIntegrity(c,database);const results=[];
async function test(name,fn){const started=Date.now();await fn();results.push({name,result:'PASS',ms:Date.now()-started});console.log(JSON.stringify(results.at(-1)));await fs.writeFile('/proof/sql-results.json',JSON.stringify(results,null,2));}
async function importer(creds,suffix='',options={}) {
 const script=suffix==='full'?'exec mariadb -h127.0.0.1 -u"$STAGE_USER" "$STAGE_DATABASE" < /proof/fixture.sql':`exec mariadb -h127.0.0.1 -u"$STAGE_USER" "$STAGE_DATABASE" -e '${suffix}'`;
 return runSqlHelper({image:inspected.Image,dbId:inspected.Id,recoveryId:'nyx507-fixed-proof',env:[`MYSQL_PWD=${creds.password}`,`STAGE_USER=${creds.user}`,`STAGE_DATABASE=${creds.database}`],script,binds:[process.env.NYXGUARD_TEST_EVIDENCE+':/proof:ro'],progress:sqlProgress(c,creds.database,creds.user),...options});
}
try {
await test('fixture dump verified restore, complete row/schema fingerprints, 512 MB / one CPU',async()=>{const s=await prepareDatabaseSnapshot(c,database,expected,x=>importer(x,'full'));validateIntegrity(await captureIntegrity(c,s.stage),expected);validateIntegrity(await captureIntegrity(c,database),expected);await q(`DROP DATABASE \`${s.stage}\``);});
await test('SQL error rejects backup, protects live DB, removes stage and credentials',async()=>{await assert.rejects(prepareDatabaseSnapshot(c,database,expected,x=>importer(x,'INVALID SQL;')), /Staged restore rejected/);validateIntegrity(await captureIntegrity(c,database),expected);});
await test('idle timeout terminates importer and cleans failed stage',async()=>{await assert.rejects(prepareDatabaseSnapshot(c,database,expected,x=>importer(x,'DO SLEEP(30);',{idleMs:2000})), /Staged restore rejected/);});
await test('total deadline terminates importer and cleans failed stage',async()=>{await assert.rejects(prepareDatabaseSnapshot(c,database,expected,x=>importer(x,'DO SLEEP(30);',{totalMs:2000})), /Staged restore rejected/);});
await test('persistent monitor failure exhausts idle budget, control connection remains usable',async()=>{await assert.rejects(prepareDatabaseSnapshot(c,database,expected,x=>importer(x,'DO SLEEP(30);',{idleMs:2000,progress:async()=>{throw Object.assign(new Error('injected monitor deadline'),{code:'PROTOCOL_SEQUENCE_TIMEOUT'});}})), /Staged restore rejected/);assert.equal((await q('SELECT 1 AS ok'))[0].ok,1);});
await test('no failed SQL staging schemas or import accounts remain',async()=>{assert.equal((await q("SELECT SCHEMA_NAME FROM information_schema.SCHEMATA WHERE SCHEMA_NAME LIKE 'nyx_stage_%'")).length,0);assert.equal((await q("SELECT User FROM mysql.user WHERE User LIKE 'nyx_import_%'")).length,0);validateIntegrity(await captureIntegrity(c,database),expected);});
}finally{await c.promise().end();}
