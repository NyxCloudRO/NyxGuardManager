import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

export function sessionRevocations(file = '/data/nyxguard/revoked-sessions.json') {
  let queue = Promise.resolve();
  const hash = token => createHash('sha256').update(token).digest('hex');
  const read = async () => {
    try { const data=JSON.parse(await fs.readFile(file,'utf8')); if (!data || Array.isArray(data) || typeof data !== 'object') throw new Error('Invalid session revocation ledger'); return data; }
    catch (error) { if (error.code === 'ENOENT') return {}; throw error; }
  };
  return {
    async revoked(token) { const data=await read();return Number(data[hash(token)]) > Date.now()/1000; },
    async revoke(token,expiry) {
      if (!Number.isFinite(expiry)) throw new Error('Session expiry required');
      const action=queue.then(async()=>{
        const data=await read();
        for (const [key,value] of Object.entries(data)) if (Number(value) <= Date.now()/1000) delete data[key];
        data[hash(token)]=expiry;
        await fs.mkdir(path.dirname(file),{recursive:true,mode:0o700});
        const temp=file+'.tmp';await fs.writeFile(temp,JSON.stringify(data),{mode:0o600});await fs.rename(temp,file);
      });
      queue=action.catch(()=>{});return action;
    },
  };
}
export const sessions = sessionRevocations();
