import crypto from 'node:crypto';
import {unseal} from './nyxcloud-licensing/store.mjs';

// SQL NULL is the persisted, unactivated state used by the application store.
// Non-null sealed payloads retain authentication and the historical digest format.
export function recoveryLicenseIdentity(rows,key) {
  if(!Buffer.isBuffer(key)||key.length!==32)throw new Error('Invalid recovery licensing vault key');
  const identities=rows.map(row=>{
    const identity={installation:row.installation_id,revision:row.revision_floor};
    if(row.sealed_state===null)return {...identity,state:null};
    const state=unseal(row.sealed_state,key);
    return {...identity,activation:state.activationId,refresh:state.refreshCredential,
      entitlement:state.envelope,revoked:state.revoked,invalid:state.invalid};
  });
  return crypto.createHash('sha256').update(JSON.stringify(identities)).digest('hex');
}
