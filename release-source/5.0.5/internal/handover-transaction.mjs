import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {durableJson} from './recovery-files.mjs';

// Only controlled diagnostic text is retained. Arbitrary exception messages,
// URL contents, response bodies and environment values never enter the journal.
export function sanitizedFailure(error, phase) {
  const categories = new Set(['Error','TypeError','RangeError','SyntaxError','AbortError']);
  const category = categories.has(error?.name) ? error.name : 'Error';
  const code = /^(?:E[A-Z0-9_]{2,30}|WORKER_STATE_UNCERTAIN|WORKER_DEADLINE_EXCEEDED)$/.test(error?.code||'') ? error.code : undefined;
  const raw = String(error?.message||'');
  let message = 'Failure details withheld';
  if (/^(Docker API deadline exceeded|Docker response limit exceeded|Recovery worker final state uncertain|Recovery worker deadline exceeded; worker still running|Handover interrupted before health commit)$/.test(raw)) message = raw;
  const docker = raw.match(/^Docker (GET|POST|DELETE) \/[^\s]+ failed: (\d{3})$/);
  if (docker) message = `Docker ${docker[1]} request failed: ${docker[2]}`;
  const worker = raw.match(/^Same-major recovery (backup|restore|verify|metadata|finalize|cleanup|pair|verify-source) failed with exit (-?\d+)$/);
  if (worker) message = `Same-major recovery ${worker[1]} failed with exit ${worker[2]}`;
  const request=error?.dockerRequest;
  const context=request&&['GET','POST','DELETE'].includes(request.method)&&
    ['container-stop','docker-api'].includes(request.operation)&&Number.isSafeInteger(request.deadlineMs)&&request.deadlineMs>0 ?
    {method:request.method,operation:request.operation,deadlineMs:request.deadlineMs,
      ...(Number.isSafeInteger(request.graceMs)&&request.graceMs>=0?{graceMs:request.graceMs}:{})}:undefined;
  return {category, ...(code?{code}:{}), message, ...(context?{request:context}:{}), ...(phases.has(phase)?{phase}:{})};
}

export const sourceSchemas = {'5.0.1':42,'5.0.2':43,'5.0.3':45,'5.0.4':45};
const phases = new Set(['INITIALIZED','SOURCE_VERIFIED','REPLACEMENT_PREPARED','BACKUP_STARTING','BACKUP_VERIFIED',
  'REPLACEMENT_STARTING','REPLACEMENT_READY','APPLICATION_DATA_VERIFIED','COMMITTING','COMMITTED',
  'ROLLBACK_REQUIRED','REPLACEMENT_STOPPED','RESTORE_STARTING','RESTORE_VERIFIED','OLD_RUNTIME_STARTING',
  'OLD_RUNTIME_READY','OLD_APPLICATION_DATA_VERIFIED','ROLLBACK_COMPLETE']);
const image = v => /^sha256:[a-f0-9]{64}$/.test(v||'');
const container = v => /^[a-f0-9]{64}$/.test(v||'');
const digest = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function validateTransaction(t, identity) {
  if(!t || t.format!=='nyxguard-handover-v1' || !/^[a-f0-9]{12,64}$/.test(t.id||'') ||
    !Number.isSafeInteger(t.sequence)||t.sequence<0||!phases.has(t.phase)||
    !container(t.source?.id)||!image(t.source?.image)||sourceSchemas[t.source?.version]!==t.source?.schema||
    !container(t.target?.id)||!container(t.target?.originalId)||!image(t.target?.image)||!['5.0.4','5.0.5'].includes(t.target?.version)||
    !/^[A-Za-z0-9_-]{12,80}$/.test(t.recoveryId||'')||typeof t.backupVerified!=='boolean'||
    typeof t.mutationPossible!=='boolean'||typeof t.committed!=='boolean'||
    (t.mutationPossible&&!t.backupVerified)||(t.committed&&t.phase!=='COMMITTED')||
    (t.phase==='COMMITTED'&&!t.committed)||(t.restoreVerified!==undefined&&typeof t.restoreVerified!=='boolean')||(t.restoreVerified&&!t.mutationPossible)||
    !path.isAbsolute(t.source?.installDir||'')||!Array.isArray(t.source?.volumes)||
    !t.source.volumes.some(v=>v.key==='data'&&v.name==='nyxguard_data')||
    !t.source.volumes.some(v=>v.key==='letsencrypt'&&v.name==='nyxguard_letsencrypt')) throw new Error('Invalid durable handover transaction');
  const requiresMutation=['REPLACEMENT_STARTING','REPLACEMENT_READY','APPLICATION_DATA_VERIFIED','COMMITTING','COMMITTED'];
  if(requiresMutation.includes(t.phase)&&(!t.mutationPossible||!t.backupVerified))throw new Error('Contradictory durable mutation phase');
  const allowed={data:'nyxguard_data',letsencrypt:'nyxguard_letsencrypt',vpn:'nyxguard_vpn',vpn_auth:'nyxguard_vpn_auth'};
  if(t.source.volumes.some(v=>allowed[v.key]!==v.name)||new Set(t.source.volumes.map(v=>v.key)).size!==t.source.volumes.length||
    !/^[A-Za-z0-9_-]+$/.test(t.source.name||''))throw new Error('Invalid durable source topology');
  if(identity && (t.id!==identity.id||t.source.id!==identity.sourceId||t.source.version!==identity.sourceVersion||
    t.target.originalId!==identity.targetId||t.target.image!==identity.targetImage||t.target.version!==identity.targetVersion))
    throw new Error('Durable handover identity mismatch');
  return t;
}
export async function loadTransaction(file, identity) {
  let raw;
  try {raw=await fs.readFile(file,'utf8');}catch(error){if(error.code==='ENOENT')return null;throw error;}
  if(raw.length>128*1024)throw new Error('Oversized handover transaction');
  let wrapper;try{wrapper=JSON.parse(raw);}catch{throw new Error('Corrupt durable handover transaction');}
  if(wrapper.sha256!==digest(wrapper.transaction))throw new Error('Durable handover checksum mismatch');
  return validateTransaction(wrapper.transaction,identity);
}
export async function persistTransaction(file,t) {
  validateTransaction(t);
  await fs.mkdir(path.dirname(file),{recursive:true,mode:0o700});
  await durableJson(file,{sha256:digest(t),transaction:t});
}

// Every effect is preceded by a durable intention. Uncommitted restart always
// returns to the verified source, never creates a new point from migrated data.
export async function runTransaction(t, effects, save, resumed=false) {
  const mark=async(phase,patch={})=>{t={...t,...patch,phase,sequence:t.sequence+1};await save(t);await effects.boundary?.(phase,t);};
  const rollback=async()=>{
    await mark('ROLLBACK_REQUIRED');
    await effects.stopReplacement(t);await mark('REPLACEMENT_STOPPED');
    if(t.mutationPossible&&!t.restoreVerified){await mark('RESTORE_STARTING');await effects.restore(t);await mark('RESTORE_VERIFIED',{restoreVerified:true});}
    await effects.verifySourcePair(t); // schema compatibility BEFORE old code starts
    await mark('OLD_RUNTIME_STARTING');await effects.startSource(t);await mark('OLD_RUNTIME_READY');
    await effects.verifySourceData(t);await mark('OLD_APPLICATION_DATA_VERIFIED');
    await mark('ROLLBACK_COMPLETE');await effects.recordRollback(t);
    await effects.finalizeRollback(t);return {transaction:t,result:'rollback'};
  };
  if(t.phase==='COMMITTED') {await effects.verifyCommitted(t);await effects.finishCommit(t);return {transaction:t,result:'committed'};}
  if(t.phase==='ROLLBACK_COMPLETE') {await effects.verifySourcePair(t);await effects.startSource(t);await effects.verifySourceData(t);await effects.recordRollback(t);return {transaction:t,result:'rollback'};}
  if(resumed)return rollback();
  try {
    await effects.verifySourcePair(t);await mark('SOURCE_VERIFIED');
    const prepared=await effects.prepareReplacement(t);await mark('REPLACEMENT_PREPARED',{target:{...t.target,...prepared}});
    await mark('BACKUP_STARTING');await effects.backup(t);await mark('BACKUP_VERIFIED',{backupVerified:true});
    await mark('REPLACEMENT_STARTING',{mutationPossible:true});await effects.startReplacement(t);await mark('REPLACEMENT_READY');
    await effects.verifyTargetData(t);await mark('APPLICATION_DATA_VERIFIED');
    await mark('COMMITTING');await effects.commitMetadata(t);
    await mark('COMMITTED',{committed:true});
  } catch(error) {
    // No rollback is allowed after a durable commit. A failed acknowledgement
    // of that write is resolved only by re-reading on the next invocation.
    if(t.committed)throw error;
    t={...t,failure:t.failure||sanitizedFailure(error,t.phase)};
    try { await rollback(); }
    catch (recoveryError) {
      t={...t,recoveryFailure:sanitizedFailure(recoveryError,t.phase),sequence:t.sequence+1};
      await save(t);
      recoveryError.handoverFailure=t.failure;
      recoveryError.handoverRecoveryFailure=t.recoveryFailure;
      throw recoveryError;
    }
    return {transaction:t,result:'rollback',error};
  }
  await effects.finishCommit(t);return {transaction:t,result:'committed'};
}
