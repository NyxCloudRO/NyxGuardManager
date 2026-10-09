import fs from 'node:fs/promises';
import path from 'node:path';

// The root handover writer emits this decision after validated durable ledger
// writes. Application users can read it without reading private recovery data.
export async function retentionAllowed(dataRoot='/data') {
  const dir=path.join(dataRoot,'.nyx-handover');
  let raw;
  try {raw=await fs.readFile(path.join(dir,'retention.json'),'utf8');}
  catch(error){
    if(error.code!=='ENOENT')return false;
    try{await fs.stat(dir);return false;}catch(missing){return missing.code==='ENOENT';}
  }
  try {
    if(raw.length>1024)return false;
    const state=JSON.parse(raw);
    return state.format==='nyxguard-retention-v1' && ['COMMITTED','ROLLBACK_COMPLETE'].includes(state.phase);
  } catch {return false;}
}
