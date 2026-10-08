import fs from 'node:fs/promises';
import {docker} from './recovery-docker.mjs';
import {loadTransaction} from './handover-transaction.mjs';
const directory=process.env.HOST_INSTALL_DIR;
if(!directory?.startsWith('/'))throw new Error('Installed directory required');
const all=await docker('GET','/containers/json?all=1');
const candidates=all.filter(c=>c.Labels?.['nyxguard.install-dir']===directory&&c.Labels?.['nyxguard.target-version']==='5.0.6');
const pending=[];
const pointer=JSON.parse(await fs.readFile('/handover-data/.nyx-handover/active.json','utf8'));
function infoActive(t,state){return pointer.id===t.id&&state.stage!=='success';}
for(const c of candidates){const t=await loadTransaction('/handover-data/.nyx-handover/'+c.Id.slice(0,12)+'.json');if(t&&t.phase!=='ROLLBACK_COMPLETE'){
  const state=JSON.parse(await fs.readFile('/handover-data/update-manager/state.json','utf8'));
  if(t.phase!=='COMMITTED'||state.recoveryCleanupPending===t.recoveryId||infoActive(t,state))pending.push({c,t});
}}
if(pending.length!==1)throw new Error('Expected exactly one unfinished transaction for this installation; inspect retained helper and ledger');
const {c,t}=pending[0],info=await docker('GET',`/containers/${c.Id}/json`);
if(info.State.Running||info.Image!==t.target.image)throw new Error('Recovery helper is active or differs from its transaction');
const e=Object.fromEntries(info.Config.Env.map(x=>x.split(/=(.*)/s).slice(0,2)));
if(e.OLD_MANAGER_ID!==t.source.id||e.NEW_MANAGER_ID!==t.target.originalId||e.TARGET_IMAGE_ID!==t.target.image)throw new Error('Recovery helper transaction ownership differs');
await docker('POST',`/containers/${c.Id}/start`);
for(let n=0;n<900;n++){
  const next=await docker('GET',`/containers/${c.Id}/json`);
  if(!next.State.Running){const final=await loadTransaction('/handover-data/.nyx-handover/'+c.Id.slice(0,12)+'.json');if(!['ROLLBACK_COMPLETE','COMMITTED'].includes(final?.phase))throw new Error('Recovery remains incomplete; inspect retained worker logs and retry this same transaction');console.log(JSON.stringify({transaction:final.id,phase:final.phase,restoreVerified:!!final.restoreVerified}));process.exit(0);}
  await new Promise(resolve=>setTimeout(resolve,1000));
}
throw new Error('Recovery helper still active; do not start a concurrent update');
