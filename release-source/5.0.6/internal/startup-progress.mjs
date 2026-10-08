import {assertProgress} from './startup-progress-check.mjs';
import fs from 'node:fs';
import crypto from 'node:crypto';
import policy from './release-policy.mjs';
export const progressFile='/tmp/nyxguard-startup.json';
const attempt=crypto.randomUUID();
let state={format:1,attempt,pid:process.pid,startedAt:Date.now(),progressAt:Date.now(),phase:'startup',units:0,total:0,complete:false,failed:false};
function write(){const tmp=progressFile+'.'+process.pid;fs.writeFileSync(tmp,JSON.stringify(state),{mode:0o644});fs.renameSync(tmp,progressFile);}
export function advance(phase,units=state.units,total=state.total){
  if(!Number.isSafeInteger(units)||units<state.units||!Number.isSafeInteger(total)||total<0)throw new Error('Invalid migration progress');
  // Repeating a heartbeat cannot extend a deadline. Only completed work or a
  // one-way phase transition records progress.
  if(phase!==state.phase||units>state.units){state.progressAt=Date.now();state.phase=phase;state.units=units;state.total=total;write();}
}
export function complete(){state.complete=true;state.completedAt=Date.now();state.phase='ready';write();clearInterval(watchdog);}
export function fail(){state.failed=true;state.phase='failed';write();}
write();
const watchdog=setInterval(()=>{if(state.complete)return;try{assertProgress(state);}catch(error){fail();console.error(error.message);process.exit(1);}},1000);
watchdog.unref();
