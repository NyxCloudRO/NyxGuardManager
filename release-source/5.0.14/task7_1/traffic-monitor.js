import db from '../db.js';
import {global as logger} from '../logger.js';
import {recordFailure} from './operational-diagnostics.mjs';
import {createTrafficCollector} from './traffic-ingestion.mjs';
let timer,collector;
export default {initTimer(pollMs=Math.max(1000,Math.min(60000,Number(process.env.NYXGUARD_POLL_INTERVAL_MS)||15000))){
 if(timer)return;collector=createTrafficCollector(db());
 const poll=()=>collector.poll().catch(async error=>{logger.error('Traffic ingestion failed: '+error.message);await recordFailure(db(),error,{component:'Traffic Monitor',operation:'Transactional ingestion',path:'/traffic'});});
 timer=setInterval(poll,pollMs);setTimeout(poll,3000);
}};
