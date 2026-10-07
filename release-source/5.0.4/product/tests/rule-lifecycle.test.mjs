import test from 'node:test';
import assert from 'node:assert/strict';
import knex from 'knex';
import {upsertVerifiedCrawlerAllowRule} from '../internal/attack-monitor.js';
import {ipRules} from '../internal/nyxguard/rules.js';
import {expireSecurityState} from '../internal/security-lifecycle.mjs';
import {ruleState} from '../internal/rule-state.mjs';

test('verified crawler lifecycle: finite creation, expiry, rejection, cleanup, fresh recreation and manual ownership', async()=>{
 const k=knex({client:'sqlite3',connection:{filename:':memory:'},useNullAsDefault:true});
 try {
  await k.schema.createTable('nyxguard_ip_rule',t=>{t.increments('id');t.integer('enabled');t.string('action');t.string('ip_cidr');t.string('note');t.string('rule_origin').defaultTo('manual');t.datetime('expires_on');t.datetime('created_on');t.datetime('modified_on');});
  const ip='66.249.66.1', future=new Date(Date.now()+3600000);
  let result=await upsertVerifiedCrawlerAllowRule(k,ip,'google',future);
  let row=await k('nyxguard_ip_rule').where({id:result.id}).first();
  assert.equal(row.rule_origin,'verified_crawler');assert.equal(ruleState(row).enabled,true);assert.ok(row.expires_on);
  await k('nyxguard_ip_rule').where({id:row.id}).update({expires_on:new Date(Date.now()-60000)});
  row=await k('nyxguard_ip_rule').where({id:row.id}).first();assert.equal(ruleState(row).enabled,false);
  await assert.rejects(ipRules.update(k,row.id,{enabled:true}),/fresh verification/);
  assert.equal((await k('nyxguard_ip_rule').where({id:row.id}).first()).rule_origin,'verified_crawler');
  assert.equal(await expireSecurityState(k),1);assert.equal(await k('nyxguard_ip_rule').first(),undefined);
  result=await upsertVerifiedCrawlerAllowRule(k,ip,'google',future);assert.notEqual(result.id,row.id);
  await ipRules.update(k,result.id,{enabled:false});
  row=await k('nyxguard_ip_rule').where({id:result.id}).first();assert.equal(row.rule_origin,'manual');assert.equal(row.enabled,0);
  assert.equal((await upsertVerifiedCrawlerAllowRule(k,ip,'google',new Date(Date.now()+7200000))).changed,false);
  row=await k('nyxguard_ip_rule').where({id:result.id}).first();assert.equal(row.enabled,0);
  await ipRules.update(k,row.id,{enabled:true});assert.equal(ruleState(await k('nyxguard_ip_rule').where({id:row.id}).first()).enabled,true);
  await k('nyxguard_ip_rule').where({id:row.id}).update({expires_on:new Date(Date.now()-60000)});
  assert.equal(await expireSecurityState(k),0);await assert.rejects(ipRules.update(k,row.id,{enabled:true}),/Expired rules/);
  await ipRules.update(k,row.id,{enabled:true,expiresInDays:1});assert.equal(ruleState(await k('nyxguard_ip_rule').where({id:row.id}).first()).enabled,true);
 } finally {await k.destroy();}
});
