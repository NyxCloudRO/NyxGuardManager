import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {durableJson} from './recovery-files.mjs';
const digest=value=>crypto.createHash('sha256').update(typeof value==='string'?value:JSON.stringify(value)).digest('hex');
async function read(file){try{return await fs.readFile(file,'utf8');}catch(error){if(error.code==='ENOENT')return null;throw error;}}
export async function baselinePlan(data,manager){
  const pointer=await read(path.join(data,'.nyx-handover/active.json'));
  let ledger=null,id=null;
  if(pointer){id=JSON.parse(pointer).id;if(!/^[a-f0-9]{12,64}$/.test(id||''))throw new Error('Invalid historical transaction identity');ledger=await read(path.join(data,'.nyx-handover',id+'.json'));}
  if(ledger){const wrapper=JSON.parse(ledger);if(digest(wrapper.transaction)!==wrapper.sha256)throw new Error('Historical transaction checksum mismatch');}
  const state=await read(path.join(data,'update-manager/state.json'));
  const guard=state?JSON.parse(state):{};
  const identity={format:'nyxguard-baseline-plan-v1',managerId:manager.Id,image:manager.Image,mounts:manager.Mounts.map(({Type,Name,Source,Destination,RW})=>({Type,Name,Source,Destination,RW})).sort((a,b)=>a.Destination.localeCompare(b.Destination)),project:manager.Config.Labels['com.docker.compose.project'],configFiles:manager.Config.Labels['com.docker.compose.project.config_files'],historicalId:id,pointerHash:pointer&&digest(pointer),ledgerHash:ledger&&digest(ledger),recoveryId:guard.recoveryId||null};
  return {...identity,challenge:digest(identity),historicalRollbackVerified:false};
}
async function completeTreeHash(root){
  const hash=crypto.createHash('sha256');
  async function walk(dir,relative=''){
    for(const name of (await fs.readdir(dir)).sort()){
      const file=path.join(dir,name),rel=path.join(relative,name),stat=await fs.lstat(file);
      hash.update(JSON.stringify([rel,stat.mode,stat.uid,stat.gid]));
      if(stat.isDirectory())await walk(file,rel);
      else if(stat.isSymbolicLink())hash.update(await fs.readlink(file));
      else if(stat.isFile()){const handle=await fs.open(file,'r');try{for await(const chunk of handle.createReadStream())hash.update(chunk);}finally{await handle.close();}}
      else throw new Error('Unsupported historical recovery object');
    }
  }
  await walk(root);return hash.digest('hex');
}
export async function acceptBaseline(data,volumes,plan,authorization,reason,proof){
  if(!plan||authorization!==plan.challenge||!reason?.trim()||reason.length>1000||!proof.recoveryId||!proof.hashes||!proof.licenseIdentity)throw new Error('Explicit baseline authorization and verified restore proof required');
  if(!/^[A-Za-z0-9_-]{12,80}$/.test(proof.recoveryId))throw new Error('Invalid baseline recovery identity');
  const directory=path.join(data,'.nyx-baselines',plan.challenge,proof.recoveryId);
  await fs.mkdir(directory,{recursive:true,mode:0o700});
  const receipt=path.join(directory,'acceptance.json');
  let accepted=await read(receipt);
  if(accepted){accepted=JSON.parse(accepted);if(accepted.challenge!==authorization||JSON.stringify(accepted.proof)!==JSON.stringify(proof))throw new Error('Baseline receipt identity differs');}
  else {
    const pointer=await read(path.join(data,'.nyx-handover/active.json'));
    const ledger=plan.historicalId?await read(path.join(data,'.nyx-handover',plan.historicalId+'.json')):null;
    if((pointer&&digest(pointer))!==plan.pointerHash||(ledger&&digest(ledger))!==plan.ledgerHash)throw new Error('Historical evidence changed after administrator authorization');
    // Keep raw originals and an independent proof before accepting any pointer,
    // flags or staging changes. Never write to the old transaction ledger.
    await durableJson(path.join(directory,'historical-evidence.json'),{pointer,ledger,updaterState:await read(path.join(data,'update-manager/state.json'))});
    accepted={format:'nyxguard-baseline-acceptance-v1',challenge:authorization,reason,at:new Date().toISOString(),plan,proof,historicalRollbackVerified:false};
    await durableJson(receipt,accepted);
  }
  for(const v of volumes){
    const source='/source/'+v.key,archive=path.join(source,'.nyx-baseline-history',plan.challenge);
    await fs.mkdir(archive,{recursive:true,mode:0o700});
    for(const name of (await fs.readdir(source)).filter(name=>name.startsWith('.nyx-restore-'))){
      const from=path.join(source,name),to=path.join(archive,name),record=path.join(directory,v.key+'-'+name+'.json');
      const before=await completeTreeHash(from);
      await durableJson(record,{name,volume:v.name,sha256:before,historicalRollbackVerified:false});
      await fs.rename(from,to);
      if(await completeTreeHash(to)!==before)throw new Error('Archived historical recovery evidence differs');
      for(const dir of [source,archive]){const handle=await fs.open(dir,'r');try{await handle.sync();}finally{await handle.close();}}
    }
  }
  const stateFile=path.join(data,'update-manager/state.json');
  const state=JSON.parse(await read(stateFile)||'{}');
  const owner=await fs.stat(stateFile).catch(()=>fs.stat(path.dirname(stateFile)));
  state.stage='baseline_accepted';state.manualRecoveryRequired=false;state.restartPending=false;state.pendingVersion=null;state.activation=null;state.recoveryCleanupPending=null;state.acceptedBaseline=plan.challenge;state.acceptedBaselineRecoveryId=proof.recoveryId;state.downloadedVersion=null;state.downloadedImageId=null;
  // Durable receipt is the authorization. The old lastApplyFailure/recoveryId
  // remain history and are never described as verified historical rollback.
  await durableJson(stateFile,state);await fs.chown(stateFile,owner.uid,owner.gid);
  await durableJson(path.join(directory,'completed.json'),{challenge:authorization,at:new Date().toISOString()});
}
