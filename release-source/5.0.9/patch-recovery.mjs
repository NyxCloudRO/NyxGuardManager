import fs from 'node:fs';
const file='/app/internal/same-major-recovery.js';let text=fs.readFileSync(file,'utf8');
const before="return crypto.createHash('sha256').update(JSON.stringify(rows.map(row=>{const s=unseal(row.sealed_state,key);return {installation:row.installation_id,revision:row.revision_floor,activation:s.activationId,refresh:s.refreshCredential,entitlement:s.envelope,revoked:s.revoked,invalid:s.invalid};}))).digest('hex');";
if(text.split(before).length!==2)throw new Error('Recovery licensing patch base differs');
text=text.replace("import {unseal} from './nyxcloud-licensing/store.mjs';","import {recoveryLicenseIdentity} from './recovery-license-identity.mjs';").replace(before,'return recoveryLicenseIdentity(rows,key);');
const early='  assertSourceSchema(expected);';if(text.split(early).length!==2)throw new Error('Backup preflight patch base differs');
text=text.replace(early,early+'\n  const protectedLicenseIdentity=await licenseIdentity(database);');
const late='licenseIdentity:await licenseIdentity(database)';if(text.split(late).length!==2)throw new Error('Backup identity patch base differs');
text=text.replace(late,'licenseIdentity:protectedLicenseIdentity');fs.writeFileSync(file,text);
