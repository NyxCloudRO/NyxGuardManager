import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
import {securitySourceReady as ready} from '../security-source-health.mjs';
const generated=1792501902492,heartbeat=1792501902738,readAt=1792501903060;
let checks=0;const eq=(a,b)=>{assert.equal(a,b);checks++};
const state={health:{status:'ready',lastSuccess:heartbeat},pending:false};
eq(ready(state,generated),false);eq(ready(state,readAt),true);
for(const delta of [0,1,14999,15000])eq(ready({...state,health:{status:'ready',lastSuccess:readAt-delta}},readAt),true);
for(const delta of [-1,15001,90000])eq(ready({...state,health:{status:'ready',lastSuccess:readAt-delta}},readAt),false);
for(const x of [null,undefined,NaN,Infinity,'1792501902738'])eq(ready({...state,health:{status:'ready',lastSuccess:x}},readAt),false);
for(const x of [null,{}, {health:{status:'error',lastSuccess:heartbeat}}, {...state,pending:true}, {...state,pending:'1'}])eq(ready(x,readAt),false);
eq(ready({health:JSON.stringify(state.health),pending:false},readAt),true);
assert.throws(()=>ready({health:'{broken'},readAt));checks++;
const source=await readFile(new URL('../integrations.js',import.meta.url),'utf8');assert(source.includes('const state=await knex(\'nyxguard_blocked_state\').where({id:1}).first();\n  // Read the validation clock'));assert(source.includes('securitySourceReady(state,Date.now())'));assert(source.includes("if(!ready)throw Error('Enforcement observation source unavailable')"));checks+=3;
console.log(JSON.stringify({result:'PASS',checks,race:{generated,heartbeat,readAt,oldAge:generated-heartbeat,newAge:readAt-heartbeat},scope:'freshness helper and actual integration call-site; no claim of full image qualification'}));
// Execute the actual integration block with controlled SQL and clocks, rather
// than only testing the helper. All normal push/failure behavior is preserved.
const baselineSource=await readFile(new URL('../../5.0.14/final/integrations.js',import.meta.url),'utf8');
function block(s){return s.slice(s.indexOf(' // Event counts are retained enforcement observations'),s.indexOf(' const portalHealth=portalAuditHealth();'));}
const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
async function evaluate(s,state,{sqlError=false,observationError=false}={}){
 const rows=[];const knex=()=>({where:()=>({first:async()=>{if(sqlError)throw Error('SQL unavailable');return state;}})});knex.raw=async()=>{if(observationError)throw Error('observation SQL failure');return [[{n:0}]]};
 const run=new AsyncFunction('knex','push','securitySourceReady','Date',`let failures=0;const now=${generated};\n${block(s)}\nreturn failures;`);
 const failures=await run(knex,(name,help,type,samples)=>rows.push({name,samples}),ready,{now:()=>readAt});return {failures,rows};
}
let original=await evaluate(baselineSource,state),fixed=await evaluate(source,state);eq(original.failures,1);eq(fixed.failures,0);eq(fixed.rows.filter(x=>x.name==='nyxguard_waf_rule_blocks_observed').length,4);
for(const st of [null,{...state,pending:true},{health:{status:'ready',lastSuccess:readAt-15001}},{health:{status:'ready',lastSuccess:readAt+1}},{health:'{broken'}])eq((await evaluate(source,st)).failures,1);
eq((await evaluate(source,state,{sqlError:true})).failures,1);eq((await evaluate(source,state,{observationError:true})).failures,1);
console.log(JSON.stringify({result:'PASS',checks,scope:'actual original and corrected exporter security-observation blocks; healthy concurrent heartbeat, missing, pending, stale, future, malformed, state SQL failure, observation SQL failure; strict source gate retained'}));
