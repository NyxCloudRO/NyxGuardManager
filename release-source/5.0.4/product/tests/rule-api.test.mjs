import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';
// Use a separate in-memory database; never seed the operator's installation.
const configDir=await fs.mkdtemp('/tmp/nyx-rule-api-');
process.env.NODE_CONFIG_DIR=configDir;
await fs.writeFile(configDir+'/'+(process.env.NODE_ENV||'default')+'.json',JSON.stringify({database:{engine:'knex-native',knex:{client:'better-sqlite3',connection:{filename:':memory:'},useNullAsDefault:true}}}));
const {default:db}=await import('../db.js');const {default:router}=await import('../routes/nyxguard/rules.js');const k=db();
test('real management API maps expiry to inactive and rejects stale checkbox updates without changing storage',async()=>{
 try {
 await k.schema.createTable('nyxguard_ip_rule',t=>{t.increments('id');t.integer('enabled');t.string('action');t.string('ip_cidr');t.string('note');t.string('rule_origin');t.datetime('expires_on');t.datetime('created_on');t.datetime('modified_on');});
 const [id]=await k('nyxguard_ip_rule').insert({enabled:1,action:'allow',ip_cidr:'66.249.66.1',rule_origin:'verified_crawler',expires_on:new Date(Date.now()-60000)});
 const list=router.stack.find(x=>x.route?.path==='/rules/ip').route.stack.find(x=>x.method==='get').handle;
 let body;await list({}, {status:n=>{assert.equal(n,200);return {send:x=>{body=x}}}},e=>{throw e});
 assert.equal(body.items[0].enabled,false);assert.equal(body.items[0].configuredEnabled,true);assert.equal(body.items[0].expired,true);assert.equal(body.items[0].ruleOrigin,'verified_crawler');
 const itemRoute=router.stack.find(x=>x.route?.path==='/rules/ip/:rule_id');assert.ok(itemRoute);
 const update=itemRoute.route.stack.find(x=>x.method==='put').handle;
 let failure;await update({params:{rule_id:id},body:{enabled:true}},{locals:{access:{can:async()=>true}},status:()=>({send:()=>assert.fail('Expired update succeeded')})},e=>{failure=e});
 assert.ok(failure);assert.match(failure.message,/fresh verification/);assert.equal((await k('nyxguard_ip_rule').where({id}).first()).rule_origin,'verified_crawler');
 } finally {await k.destroy();await fs.rm(configDir,{recursive:true});}
});
