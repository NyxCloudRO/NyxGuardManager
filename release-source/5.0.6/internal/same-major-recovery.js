import releasePolicy,{sourceSchemas} from './release-policy.mjs';
import {acceptBaseline} from './baseline-acceptance.mjs';
import {unseal} from './nyxcloud-licensing/store.mjs';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import { spawn } from 'node:child_process';
import mysql from 'mysql2';
import yaml from 'js-yaml';
import { captureIntegrity, validateIntegrity, validateUpgradePreservation, validateSourceRuntimePreservation } from './database-integrity.mjs';
import { docker, runSqlHelper, sqlProgress } from './recovery-docker.mjs';
import { prepareDatabaseSnapshot, commitDatabaseSnapshot, tableNames } from './recovery-database.mjs';
import { durableJson, treeFingerprint, makeFilePlan, prepareFilePlan, sealFilePlan, switchFiles, undoFileSwitch } from './recovery-files.mjs';

process.umask(0o077);
const id = process.env.RECOVERY_ID, mode = process.env.RECOVERY_MODE;
if (!/^[A-Za-z0-9_-]{12,80}$/.test(id || '') || !['backup', 'restore', 'verify', 'metadata', 'finalize', 'cleanup', 'pair', 'verify-source', 'baseline'].includes(mode))
  throw new Error('Invalid recovery request');
const root = path.join('/recovery', id);
const volumes = JSON.parse(process.env.RECOVERY_VOLUMES || '[]');
const allowed = { data: 'nyxguard_data', letsencrypt: 'nyxguard_letsencrypt', vpn: 'nyxguard_vpn', vpn_auth: 'nyxguard_vpn_auth' };
if (!Array.isArray(volumes) || volumes.length < 2 || volumes.some(v => !Object.hasOwn(allowed,v.key)||!(typeof v.name==='string'&&(/^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(v.name)||v.name.startsWith('/')&&!v.name.includes(':')&&!v.name.split('/').includes('..')))) ||
  new Set(volumes.map(v => v.key)).size !== volumes.length || !volumes.some(v => v.key === 'data') ||
  !volumes.some(v => v.key === 'letsencrypt') ||
  volumes.some(v => v.key === 'vpn') !== volumes.some(v => v.key === 'vpn_auth')) throw new Error('Invalid recovery volumes');

const db = await docker('GET', `/containers/${process.env.RECOVERY_DATABASE_ID}/json`);
const recoveryVolume=process.env.RECOVERY_VOLUME;
if(!/^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(recoveryVolume||''))throw new Error('Invalid protected recovery volume');
if (!db.State.Running) throw new Error('Installed MariaDB is not running');
const dbEnv = Object.fromEntries(db.Config.Env.map(value => [value.slice(0,value.indexOf('=')), value.slice(value.indexOf('=')+1)]));
const database = dbEnv.MYSQL_DATABASE;
if (!/^[A-Za-z0-9_]{1,64}$/.test(database || '')) throw new Error('Invalid installed database name');
const connection = mysql.createConnection({ host: '127.0.0.1', user: 'root', password: dbEnv.MYSQL_ROOT_PASSWORD,
  database, dateStrings: true, supportBigNumbers: true, bigNumberStrings: true, connectTimeout: 5000 });
const query = async (sql, args=[]) => (await connection.promise().query(sql,args))[0];
const journal = path.join(root, 'state.json');
const composeFiles=JSON.parse(process.env.RECOVERY_COMPOSE_FILES||'[]');
if(!Array.isArray(composeFiles)||!composeFiles.length||composeFiles.some(name=>typeof name!=='string'||name.includes('/')||name==='.'||name==='..'))throw new Error('Compose files must belong to the installed directory');

async function run(command, args) {
  await new Promise((resolve,reject) => {
    const child = spawn(command,args,{stdio:'ignore'});
    child.on('error',reject); child.on('exit',code => code===0 ? resolve() : reject(new Error(`${command} exited ${code}`)));
  });
}
async function hash(file) {
  const h = crypto.createHash('sha256');
  for await (const chunk of fsSync.createReadStream(file)) h.update(chunk);
  return h.digest('hex');
}
async function bytes(directory) {
  let size=0;
  for (const entry of await fs.readdir(directory,{withFileTypes:true})) {
    const file=path.join(directory,entry.name);
    if(entry.isDirectory()) size+=await bytes(file);
    else if(entry.isFile()) size+=(await fs.stat(file)).size;
  }
  return size;
}
async function importSql(credentials) {
  return runSqlHelper({ image:db.Image,dbId:db.Id,recoveryId:id,
    env:[`MYSQL_PWD=${credentials.password}`,`STAGE_USER=${credentials.user}`,`STAGE_DATABASE=${credentials.database}`],
    script:`exec mariadb -h 127.0.0.1 -u "$STAGE_USER" "$STAGE_DATABASE" < /recovery/${id}/database.sql`,
    binds:[`${recoveryVolume}:/recovery:ro`],
    progress:sqlProgress(connection,credentials.database,credentials.user) });
}
async function manifest() {
  const value=JSON.parse(await fs.readFile(path.join(root,'manifest.json'),'utf8'));
  if(value.format!=='nyxguard-same-major-v2'||value.id!==id||value.database!==database||
    JSON.stringify(value.volumes)!==JSON.stringify(volumes)) throw new Error('Recovery manifest mismatch');
  const required=['database.sql','vault.key','installed-metadata.json',...volumes.map(v=>`${v.key}.tar`)];
  if(JSON.stringify(Object.keys(value.hashes).sort())!==JSON.stringify(required.sort())) throw new Error('Incomplete recovery manifest');
  for(const file of required) if(await hash(path.join(root,file))!==value.hashes[file]) throw new Error(`Recovery checksum mismatch: ${file}`);
  validateIntegrity(value.snapshot.expected);
  return value;
}

function assertSourceSchema(actual) {
  const wanted=sourceSchemas[process.env.RECOVERY_SOURCE_VERSION];
  if(!wanted||actual.migrations!==wanted)throw new Error('Source runtime/database schema pairing mismatch');
}

async function licenseIdentity(dbName){
  const rows=await query('SELECT * FROM `'+dbName+'`.nyxcloud_license_state');
  const key=await fs.readFile('/host-vault/vault.key');
  return crypto.createHash('sha256').update(JSON.stringify(rows.map(row=>{const s=unseal(row.sealed_state,key);return {installation:row.installation_id,revision:row.revision_floor,activation:s.activationId,refresh:s.refreshCredential,entitlement:s.envelope,revoked:s.revoked,invalid:s.invalid};}))).digest('hex');
}
async function protectedFiles(){
  const files={};
  async function walk(root,prefix){
    const stat=await fs.lstat(root).catch(error=>{if(error.code==='ENOENT')return null;throw error;});
    if(!stat)return;
    if(stat.isDirectory()){for(const name of (await fs.readdir(root)).sort()){if(prefix==='letsencrypt'&&(name.startsWith('.nyx-restore-')||name==='.nyx-baseline-history'))continue;await walk(path.join(root,name),prefix+'/'+name);}}
    else if(stat.isSymbolicLink())files[prefix]={type:'link',target:await fs.readlink(root),mode:stat.mode&0o777};
    else if(stat.isFile())files[prefix]={type:'file',sha256:await hash(root),mode:stat.mode&0o777};
    else throw new Error('Unsupported protected persistent object');
  }
  await walk('/source/letsencrypt','letsencrypt');
  await walk('/source/data/keys.json','data/keys.json');
  await walk('/source/data/custom_ssl','data/custom_ssl');
  await walk('/source/data/nginx/custom','data/nginx/custom');
  if(volumes.some(v=>v.key==='vpn'))await walk('/source/vpn/profiles','vpn/profiles');
  if(volumes.some(v=>v.key==='vpn_auth'))await walk('/source/vpn_auth/token','vpn_auth/token');
  return files;
}
async function verifyProtectedFiles(expected){
  const actual=await protectedFiles();
  for(const [name,value] of Object.entries(expected))if(JSON.stringify(actual[name])!==JSON.stringify(value))throw new Error('Protected TLS, custom proxy configuration, authentication or VPN file changed: '+name);
}
async function backup() {
  // Reserve capacity before stopping at a partially populated snapshot. A second
  // real Aria copy remains present through replacement startup and migration.
  const estimate=await bytes('/source/db')+(await Promise.all(volumes.map(v=>bytes(`/source/${v.key}`)))).reduce((a,b)=>a+b,0);
  for(const directory of ['/recovery','/source/db']) {
    const stat=await fs.statfs(directory), available=stat.bavail*stat.bsize;
    if(available<estimate*3+256*1024*1024) throw new Error('Insufficient protected recovery capacity');
  }
  for(const v of volumes) if(!process.env.BASELINE_AUTHORIZATION&&(await fs.readdir(`/source/${v.key}`)).some(name=>name.startsWith('.nyx-restore-')))
    throw new Error('Previous filesystem recovery evidence requires review before a new upgrade');
  await fs.mkdir(root,{mode:0o700});
  await durableJson(journal,{phase:'backing_up'});
  const metadata={};for(const name of [...new Set([...composeFiles,'.version','.env'])])metadata[name]=await fs.readFile(path.join('/host-install',name),'utf8');
  await durableJson(path.join(root,'installed-metadata.json'),metadata);
  const expected=await captureIntegrity(connection,database);
  assertSourceSchema(expected);
  await runSqlHelper({image:db.Image,dbId:db.Id,recoveryId:id,
    env:[`MYSQL_PWD=${dbEnv.MYSQL_ROOT_PASSWORD}`,`SOURCE_DATABASE=${database}`],
    script:`umask 077; exec mariadb-dump -h 127.0.0.1 -uroot --lock-all-tables --skip-triggers "$SOURCE_DATABASE" > /recovery/${id}/database.sql`,
    binds:[`${recoveryVolume}:/recovery:rw`],
    progress:async()=>String((await fs.stat(path.join(root,'database.sql')).catch(()=>({size:0}))).size)});
  // The last usable database is still live here. A failed restricted import
  // aborts backup/upgrade while leaving that original database untouched.
  const snapshot=await prepareDatabaseSnapshot(connection,database,expected,importSql);
  validateIntegrity(await captureIntegrity(connection,database),expected);
  const trees={};
  for(const v of volumes) {
    trees[v.key]=await treeFingerprint(`/source/${v.key}`);
    await run('tar',['--exclude=./.nyx-update.lock','--exclude=./.nyx-handover','--exclude=./.nyx-baselines','--exclude=./.nyx-baseline-history','--exclude=./.nyx-restore-*','-C',`/source/${v.key}`,'-cf',path.join(root,`${v.key}.tar`),'.']);
    await run('tar',['-tf',path.join(root,`${v.key}.tar`)]);
    if(await treeFingerprint(`/source/${v.key}`)!==trees[v.key]) throw new Error('Persistent files changed during quiesced backup');
  }
  const vault=await fs.stat('/host-vault/vault.key');
  if(!vault.isFile()||vault.size!==32||(vault.mode&0o077)!==0) throw new Error('Invalid vault key');
  await fs.copyFile('/host-vault/vault.key',path.join(root,'vault.key'));
  const files=['database.sql','vault.key','installed-metadata.json',...volumes.map(v=>`${v.key}.tar`)];
  const hashes=Object.fromEntries(await Promise.all(files.map(async file=>[file,await hash(path.join(root,file))])));
  await durableJson(path.join(root,'manifest.json'),{format:'nyxguard-same-major-v2',id,database,volumes,snapshot,trees,hashes,
    protectedFiles:await protectedFiles(),licenseIdentity:await licenseIdentity(database),vaultOwner:{uid:vault.uid,gid:vault.gid,mode:vault.mode&0o777}});
  await durableJson(journal,{phase:'protected',snapshot});
}

async function restore() {
  const value=await manifest();
  const state=JSON.parse(await fs.readFile(journal,'utf8'));
  const previousMetadata=path.join(root,'installed-metadata.json');
  try {
    const previous=JSON.parse(await fs.readFile(previousMetadata,'utf8'));
    for(const [name,text] of Object.entries(previous)) await atomicText(path.join('/host-install',name),text);
  } catch(error) { if(error.code!=='ENOENT') throw error; }
  if(state.phase==='restored') {
    validateIntegrity(await captureIntegrity(connection,database),value.snapshot.expected);
    return;
  }
  // Determine whether an interrupted atomic DDL already committed, using both
  // the intact staged table set and the saved full baseline fingerprint.
  if(state.phase==='database_switching' && (await tableNames(connection,value.snapshot.stage)).length===0) {
    validateIntegrity(await captureIntegrity(connection,database),value.snapshot.expected);
    await durableJson(journal,{phase:'restored',snapshot:value.snapshot}); return;
  }
  validateIntegrity(await captureIntegrity(connection,value.snapshot.stage),value.snapshot.expected);
  const fileJournal=path.join(root,'files.json');
  let plan;
  try { plan=JSON.parse(await fs.readFile(fileJournal,'utf8')); }
  catch(error) { if(error.code!=='ENOENT') throw error; }
  if(plan) {
    if(plan.phase==='moving'||plan.phase==='switched') await undoFileSwitch(plan,fileJournal);
  } else {
    plan=await makeFilePlan(id,[...volumes.map(v=>({source:`/source/${v.key}`})),{source:'/host-vault',only:['vault.key']}],fileJournal);
  }
  if(plan.phase==='preparing') {
    await prepareFilePlan(plan);
    for(let i=0;i<volumes.length;i++) {
      const v=volumes[i],fresh=path.join(plan.entries[i].stage,'new');
      await run('tar',['-C',fresh,'-xf',path.join(root,`${v.key}.tar`)]);
      if(await treeFingerprint(fresh)!==value.trees[v.key]) throw new Error(`Staged persistent integrity mismatch: ${v.key}`);
    }
    const vaultTarget=path.join(plan.entries.at(-1).stage,'new','vault.key');
    await fs.copyFile(path.join(root,'vault.key'),vaultTarget);
    await fs.chown(vaultTarget,value.vaultOwner.uid,value.vaultOwner.gid); await fs.chmod(vaultTarget,value.vaultOwner.mode);
    await sealFilePlan(plan,fileJournal);
  }
  await durableJson(journal,{phase:'files_switching',snapshot:value.snapshot});
  try {
    await switchFiles(plan,fileJournal);
    await durableJson(journal,{phase:'database_switching',snapshot:value.snapshot});
    await commitDatabaseSnapshot(connection,database,value.snapshot);
  } catch(error) {
    // An ambiguous API loss after DDL is resolved from atomic table identities.
    if((await tableNames(connection,value.snapshot.stage)).length) {
      await undoFileSwitch(plan,fileJournal);
      await durableJson(journal,{phase:'protected',snapshot:value.snapshot});
    }
    throw error;
  }
  await durableJson(journal,{phase:'restored',snapshot:value.snapshot});
}

async function atomicText(file,text) {
  const temporary=`${file}.nyx-upgrade`;
  const stat=await fs.stat(file).catch(error=>{if(error.code==='ENOENT')return {mode:0o600,uid:0,gid:0};throw error;});
  const handle=await fs.open(temporary,'w',stat.mode&0o777);
  try {await handle.writeFile(text);await handle.sync();}finally{await handle.close();}
  await fs.chown(temporary,stat.uid,stat.gid);await fs.rename(temporary,file);
  const directory=await fs.open(path.dirname(file),'r');try{await directory.sync();}finally{await directory.close();}
}
async function metadata() {
  const value=await manifest();
  const previous=JSON.parse(await fs.readFile(path.join(root,'installed-metadata.json'),'utf8'));
  const image=await docker('GET',`/images/${encodeURIComponent(process.env.RECOVERY_TARGET_IMAGE)}/json`);
  if(image.Config?.Labels?.['org.opencontainers.image.version']!==releasePolicy.version)throw new Error('Metadata target differs');
  const {dockerHealthcheck}=await import('./readiness-policy.mjs');
  if(!isDeepStrictEqual(image.Config.Healthcheck,dockerHealthcheck()))throw new Error('Image readiness contract differs');
  const pinned=(image.RepoDigests||[]).find(ref=>ref.startsWith('nyxmael/nyxguardmanager@'))||image.Id;
  for(const file of composeFiles){
    const current=await fs.readFile(path.join('/host-install',file),'utf8');
    if(current!==previous[file])throw new Error('Compose configuration changed during upgrade');
    const compose=yaml.load(current),manager=compose?.services?.['nyxguard-manager'];
    if(manager){if(manager.image||file===composeFiles[0])manager.image=pinned;delete manager.healthcheck;}
    if(compose?.services?.['vpn-client-agent']?.image)compose.services['vpn-client-agent'].image='nyxmael/nyxguardmanager-vpn-agent:'+releasePolicy.agent;
    await atomicText(path.join('/host-install',file),yaml.dump(compose,{lineWidth:-1,noRefs:true}));
  }
  await atomicText('/host-install/.version',releasePolicy.version+'\n');
}

try {
  if(mode==='backup') await backup();
  else if(mode==='restore') await restore();
  else if(mode==='pair'||mode==='verify-source') {
    const limits=(mode==='verify-source'&&process.env.RECOVERY_MUTATION_POSSIBLE==='1')?Object.fromEntries(Object.entries((await manifest()).snapshot.expected.history||{}).map(([table,h])=>[table,h.max])):{};
    const actual=await captureIntegrity(connection,database,limits);
    assertSourceSchema(actual);
    if(mode==='verify-source' && process.env.RECOVERY_MUTATION_POSSIBLE==='1') {
      const value=await manifest();
      validateSourceRuntimePreservation(actual,value.snapshot.expected);
      await verifyProtectedFiles(value.protectedFiles);
      if(await licenseIdentity(database)!==value.licenseIdentity)throw new Error('Restored licensing identity differs');
    }
    console.log(JSON.stringify({sourceVersion:process.env.RECOVERY_SOURCE_VERSION,schema:actual.migrations,integrity:true}));
  }
  else if(mode==='verify') {
    const value=await manifest();
    const state=JSON.parse(await fs.readFile(journal,'utf8'));
    const actual=await captureIntegrity(connection,database);
    if(process.env.RECOVERY_MUTATION_POSSIBLE==='0') {
      // Before replacement startup, authoritative backup completion consists of
      // the existing protected journal, complete checksummed manifest and its
      // validated staged/source database pair. No new format or phase is used.
      if(state.phase!=='protected'||JSON.stringify(state.snapshot)!==JSON.stringify(value.snapshot))
        throw new Error('Protected backup completion state is missing or inconsistent');
      assertSourceSchema(value.snapshot.expected);
      validateIntegrity(await captureIntegrity(connection,value.snapshot.stage),value.snapshot.expected);
      validateIntegrity(actual,value.snapshot.expected);
    } else if(state.phase==='restored') validateIntegrity(actual,value.snapshot.expected);
    else await validateUpgradePreservation(connection,database,value.snapshot.stage);
    await verifyProtectedFiles(value.protectedFiles);
      if(await licenseIdentity(database)!==value.licenseIdentity)throw new Error('Licensing identity or entitlement changed during upgrade');
  }
  else if(mode==='baseline'){const value=await manifest();validateIntegrity(await captureIntegrity(connection,value.snapshot.stage),value.snapshot.expected);validateIntegrity(await captureIntegrity(connection,database),value.snapshot.expected);await acceptBaseline('/source/data',volumes,JSON.parse(process.env.BASELINE_PLAN),process.env.BASELINE_AUTHORIZATION,process.env.BASELINE_REASON,{recoveryId:id,hashes:value.hashes,schema:value.snapshot.expected.migrations,licenseIdentity:value.licenseIdentity});}
  else if(mode==='metadata') await metadata();
  else if(mode==='finalize') {
    await manifest();
    const state=JSON.parse(await fs.readFile(journal,'utf8'));
    if(state.phase!=='restored'&&state.phase!=='recovered')throw new Error('Recovery is not committed');
    validateIntegrity(await captureIntegrity(connection,database));
    const plan=JSON.parse(await fs.readFile(path.join(root,'files.json'),'utf8'));
    const expectedSources=[...volumes.map(v=>`/source/${v.key}`),'/host-vault'];
    if(plan.phase!=='switched'||JSON.stringify(plan.entries.map(e=>e.source))!==JSON.stringify(expectedSources))throw new Error('File recovery journal differs');
    for(let i=0;i<plan.entries.length;i++) {
      const entry=plan.entries[i];
      if(entry.stage!==path.join(entry.source,`.nyx-restore-${id}`))throw new Error('Staging ownership differs');
      if(await fs.stat(entry.stage).catch(error=>{if(error.code==='ENOENT')return null;throw error;})) {
        const archive=path.join(root,`rejected-files-${i}.tar`);
        await run('tar',['-C',entry.stage,'-cf',archive,'.']);
        const handle=await fs.open(archive,'r');try{await handle.sync();}finally{await handle.close();}
        await durableJson(path.join(root,`rejected-files-${i}.json`),{sha256:await hash(archive)});
        await fs.rm(entry.stage,{recursive:true});
      }
    }
    await durableJson(journal,{phase:'recovered',snapshot:state.snapshot});
  }
  else {
    // Successful target acceptance releases only the protected table copy.
    // SQL, manifests and diagnostics stay private for explicit later rotation.
    const value=await manifest();
    validateIntegrity(await captureIntegrity(connection,database));
    await query(`DROP DATABASE IF EXISTS \`${value.snapshot.stage}\``);
    await durableJson(journal,{phase:'accepted',snapshot:value.snapshot});
  }
} finally { await connection.promise().end(); }
