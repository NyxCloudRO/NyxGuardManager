import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {isDeepStrictEqual} from 'node:util';
import {dockerHealthcheck} from '../internal/readiness-policy.mjs';

export const handoverPhases=['INITIALIZED','SOURCE_VERIFIED','REPLACEMENT_PREPARED','BACKUP_STARTING','BACKUP_VERIFIED','REPLACEMENT_STARTING','REPLACEMENT_READY','APPLICATION_DATA_VERIFIED','COMMITTING','COMMITTED','ROLLBACK_REQUIRED','REPLACEMENT_STOPPED','RESTORE_STARTING','RESTORE_VERIFIED','OLD_RUNTIME_STARTING','OLD_RUNTIME_READY','OLD_APPLICATION_DATA_VERIFIED','ROLLBACK_COMPLETE'];
export const requiredCases=[...Array.from({length:10},(_,i)=>`R${i+1}`),...Array.from({length:8},(_,i)=>`U${i+1}`),
  'path-5.0.1','path-5.0.2','path-5.0.3','real-host-A','real-host-B','fresh-install','built-in-updater','cli-updater','stale-metadata','vpn-mapping',...handoverPhases.map(phase=>'handover-'+phase),
  'worker-restore-db-before','worker-restore-db-after','worker-restore-files-preparing','worker-restore-files-moving','resume-corrupt-state','resume-stale-state','failed-path-5.0.1'];
const digest=/^sha256:[a-f0-9]{64}$/;
const business=['user','auth','user_permission','setting','proxy_host','nyxguard_traffic_stat'];
const baselines={
  '5.0.1':{image:'sha256:a38e1f0aba5c88b36354b6f05852b31e28b830869fa56219b1bbdf5cb402d8d4',schema:42},
  '5.0.2':{image:'sha256:a364c57b1ec427500f25ec606443eb630476431ad684b4fbd63a70a1bd2f9b36',schema:43},
  '5.0.3':{image:'sha256:029c14b4f3a54950bd29a4a1e89cc8541165a16bc206bec43a34f02ca88d488f',schema:45},
};
const reuseScopes={
  transaction:['handover-transaction.mjs','update-handover.js','same-major-recovery.js','recovery-database.mjs','recovery-files.mjs','recovery-docker.mjs','database-integrity.mjs','readiness.mjs','readiness-probe.mjs','readiness-policy.mjs','readiness-policy.json','update-manager.js','update-contract.mjs','bounded-process.mjs'],
  database:['recovery-database.mjs','recovery-docker.mjs','database-integrity.mjs'],
  fresh:['index.js','app.js','lib/certbot.js','internal/readiness.mjs','internal/readiness-probe.mjs','internal/readiness-policy.mjs','internal/readiness-policy.json','internal/bounded-process.mjs','internal/database-integrity.mjs'],
};
async function acceptScopedReuse(proof,manifest,root) {
  const reuse=proof.reuse;
  if(manifest.phase!=='private-main1'||!reuse)return false;
  const expectedScope=['U4','U5','U6'].includes(proof.id)?'external':['R3','R4','R7'].includes(proof.id)?'database':proof.id==='fresh-install'?'fresh':'transaction';
  if(reuse.scope!==expectedScope||!reuse.file||path.isAbsolute(reuse.file)||reuse.file.split(/[\\/]/).includes('..'))return false;
  const raw=await fs.readFile(path.join(root,reuse.file));
  if(crypto.createHash('sha256').update(raw).digest('hex')!==reuse.sha256)throw new Error('Reuse binding bytes differ');
  const binding=JSON.parse(raw);
  if(binding.previousImageId!==proof.candidateImageId||binding.currentImageId!==manifest.candidateImageId)return false;
  const hashes=binding.scopes?.[expectedScope];
  const dependencies=expectedScope==='external'?[...reuseScopes.transaction,'bounded-https.mjs','ip_ranges.js','setup.js','lib/certbot.js']:reuseScopes[expectedScope];
  for(const module of dependencies) {
    const previous=hashes?.previous?.[module],current=hashes?.current?.[module];
    if(!/^[a-f0-9]{64}$/.test(previous||''))throw new Error(`Invalid reused dependency: ${proof.id}/${module}`);
    if(previous!==current) {
      const delta=binding.legacyVpnHostnameDelta;
      if(module!=='update-handover.js'||!reuse.legacyNormalizationNotExercised||!delta||
        delta.previousHash!==previous||delta.currentHash!==current||delta.canonicalCurrentHash!==previous||
        delta.exactOnlyChange!=="...vpn.Config,Hostname:'',Image:vpn.Image"||!delta.regressionFile||
        path.isAbsolute(delta.regressionFile)||delta.regressionFile.split(/[\\/]/).includes('..'))
        throw new Error(`Reused dependency differs: ${proof.id}/${module}`);
      const regressionRaw=await fs.readFile(path.join(root,delta.regressionFile));
      if(crypto.createHash('sha256').update(regressionRaw).digest('hex')!==delta.regressionSha256)throw new Error('Legacy normalization regression bytes differ');
      const regression=JSON.parse(regressionRaw);
      if(regression.status!=='PASS'||regression.candidateImageId!==manifest.candidateImageId||regression.terminalPhase!=='COMMITTED'||!regression.vpnHealthy||!regression.vpnNamespaceCorrect)
        throw new Error('Changed legacy normalization branch is unproven');
    }
  }
  return true;
}
export async function safetyGate(manifest,root) {
  if(manifest.format!=='nyxguard-safety-evidence-v1'||!digest.test(manifest.candidateImageId||'')||
    !/^[a-f0-9]{64}$/.test(manifest.sourceTreeSha256||''))throw new Error('Candidate identity is not frozen');
  if(!isDeepStrictEqual(manifest.imageHealthcheck,dockerHealthcheck()))throw new Error('Image readiness policy differs');
  const seen=new Set();
  for(const proof of manifest.cases||[]) {
    if(seen.has(proof.id))throw new Error('Duplicate safety case');seen.add(proof.id);
    if(proof.status!=='PASS'||(proof.candidateImageId!==manifest.candidateImageId&&!await acceptScopedReuse(proof,manifest,root)))throw new Error(`Missing exact-candidate proof: ${proof.id}`);
    const sourceVersion=proof.id.startsWith('path-')?proof.id.slice(5):({'real-host-A':'5.0.2','real-host-B':'5.0.3'})[proof.id];
    if(sourceVersion&&(proof.sourceImageId!==baselines[sourceVersion].image||proof.sourceSchema!==baselines[sourceVersion].schema||proof.finalSchema!==45))
      throw new Error(`Public baseline or final schema differs: ${proof.id}`);
    if(proof.id.startsWith('handover-')&&(!proof.actualSIGKILL||!proof.recoveryIdPreserved||!proof.repeatedResume||!['COMMITTED','ROLLBACK_COMPLETE'].includes(proof.terminalPhase)))throw new Error(`Interrupted handover convergence missing: ${proof.id}`);
    if(!Array.isArray(proof.artifacts)||!proof.artifacts.length)throw new Error(`Evidence missing: ${proof.id}`);
    for(const artifact of proof.artifacts) {
      if(!artifact.file||path.isAbsolute(artifact.file)||artifact.file.split(/[\\/]/).includes('..'))throw new Error('Unsafe evidence path');
      const hash=crypto.createHash('sha256').update(await fs.readFile(path.join(root,artifact.file))).digest('hex');
      if(hash!==artifact.sha256)throw new Error(`Evidence bytes differ: ${proof.id}`);
    }
    if(proof.id.startsWith('handover-')||proof.id.startsWith('failed-path-')||proof.id.startsWith('path-')||proof.id.startsWith('real-host-')||['U1','U2','U3','U7','U8','fresh-install'].includes(proof.id)) {
      if(!proof.loginBefore||!proof.loginAfter||!proof.proxyAPI||!proof.settingsAPI||!proof.restartPersistence)
        throw new Error(`Application acceptance incomplete: ${proof.id}`);
      if(!isDeepStrictEqual(proof.effectiveHealthcheck,manifest.imageHealthcheck))throw new Error(`Fixture readiness differs: ${proof.id}`);
      for(const table of business) {
        const before=proof.before?.[table],after=proof.after?.[table];
        if(!before||!after||!Number.isSafeInteger(before.count)||!Number.isSafeInteger(after.count)||
          !/^[a-f0-9]{64}$/.test(before.sha256||'')||!isDeepStrictEqual(before,after))throw new Error(`Persistent data proof incomplete: ${proof.id}/${table}`);
      }
    }
  }
  for(const id of requiredCases)if(!seen.has(id))throw new Error(`Mandatory safety proof missing: ${id}`);
  // Publication is a separate trust boundary and cannot inherit WIP receipts.
  if(manifest.phase==='public') {
    const p=manifest.public;
    if(!p||p.dockerDigest!==manifest.acceptedDockerDigest||p.gitCommit!==manifest.acceptedGitCommit||
      !p.fetchedUpdateSha256||p.fetchedUpdateSha256!==manifest.acceptedUpdateSha256||
      !p.publicPullCompleted||!p.publicTagRefetched||!p.publicUpgrade502||!p.publicUpgrade501||
      !p.publicFailedUpgradeRecovery||!p.publicRestartPersistence||!p.repositoryHygiene||!p.websiteVersion504||!p.websiteUnsafe503Removed)
      throw new Error('Public artifact acceptance is incomplete; RELEASE NOT SAFE / PROD NO-GO');
  }else if(manifest.phase!=='private-main1')throw new Error('Unknown acceptance phase');
  return {status:'PASS',phase:manifest.phase,candidateImageId:manifest.candidateImageId,publicationAuthorized:false};
}
if(process.argv[1]===fileURLToPath(import.meta.url)) {
  try {
    const file=process.argv[2];if(!file)throw new Error('Private evidence manifest required');
    console.log(JSON.stringify(await safetyGate(JSON.parse(await fs.readFile(file,'utf8')),path.dirname(file))));
  }catch(error){console.error(`SAFETY NO-GO: ${error.message}`);process.exitCode=1;}
}
