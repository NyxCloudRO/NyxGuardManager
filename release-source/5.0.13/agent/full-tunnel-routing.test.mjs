import test from 'node:test';import assert from 'node:assert/strict';
import {validateAndNormalizeConfig,assertNoProfileConflicts} from './agent.js';
import {defaultFamilies,fullTunnelConflict,activateDefaultRoutes,removeDefaultRoutes} from './full-tunnel-routing.mjs';
const key='AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';
const raw=routes=>`[Interface]\nPrivateKey = ${key}\nAddress = 192.0.2.2/32\nDNS = 1.1.1.1\n[Peer]\nPublicKey = ${key}\nEndpoint = 198.51.100.1:51820\nAllowedIPs = ${routes}\n`;
const identity={id:'site-12345678',name:'Fixture',interface:'nyxvpn12345678'};
test('unmodified IPv4 and IPv6 full tunnels import with managed routing and ignored DNS',()=>{
 const r=validateAndNormalizeConfig(raw('0.0.0.0/0, ::/0'),'fixture.conf','',identity);assert.deepEqual(defaultFamilies(r.metadata),[4,6]);assert.match(r.config,/Table = off/);assert.match(r.config,/AllowedIPs = 0.0.0.0\/0, ::\/0/);assert.doesNotMatch(r.config,/DNS/);assert.equal(r.metadata.routingMode,'full-tunnel');
});
test('explicit remote networks still replace defaults and keep split routing',()=>{
 const r=validateAndNormalizeConfig(raw('0.0.0.0/0'),'fixture.conf','198.51.100.0/24',identity);assert.deepEqual(r.metadata.allowedIps,['198.51.100.0/24']);assert.doesNotMatch(r.config,/Table = off/);
});
test('defaults coexist with specific site routes but two active defaults conflict',()=>{
 const a={...identity,allowedIps:['0.0.0.0/0'],addresses:['192.0.2.2/32']};const b={id:'other',allowedIps:['198.51.100.0/24'],addresses:['192.0.2.3/32']};assert.doesNotThrow(()=>assertNoProfileConflicts(a,[b]));assert.equal(fullTunnelConflict(a,[b]),false);assert.equal(fullTunnelConflict(a,[{...b,allowedIps:['0.0.0.0/0']}]),true);assert.equal(fullTunnelConflict(a,[{...b,allowedIps:['::/0']}]),false);
});
test('command hooks remain rejected; malformed keys never become acceptable',()=>{
 assert.throws(()=>validateAndNormalizeConfig(raw('0.0.0.0/0')+'PostUp = echo fixture\n','fixture.conf','',identity),/cannot execute/);assert.throws(()=>validateAndNormalizeConfig(raw('0.0.0.0/0').replace('PrivateKey = '+key,'PrivateKey = invalid'),'fixture.conf','',identity),/valid WireGuard/);
});
test('activation excludes marked endpoint packets and retains local routes; removal mirrors both families',async()=>{
 const calls=[];const run=async(file,args)=>{calls.push([file,args]);return {stdout:''}};const r=validateAndNormalizeConfig(raw('0.0.0.0/0, ::/0'),'fixture.conf','',identity);await activateDefaultRoutes(run,r.metadata);assert.equal(calls.filter(([f,a])=>f==='ip'&&a.includes('not')&&a.includes('fwmark')).length,2);assert.equal(calls.filter(([f,a])=>f==='ip'&&a.includes('suppress_prefixlength')).length,2);await removeDefaultRoutes(run,r.metadata);assert.equal(calls.filter(([f,a])=>f==='ip'&&a.includes('route')&&a.includes('del')&&a.includes(identity.interface)).length,2);
});
test('explicit Table=off and custom table keep manual routing semantics',()=>{
 for(const table of ['off','1234']){
  const profile=raw('0.0.0.0/0').replace('[Interface]','[Interface]\nTable = '+table);const r=validateAndNormalizeConfig(profile,'fixture.conf','',identity);assert.equal(r.metadata.routingMode,'manual');assert.deepEqual(defaultFamilies(r.metadata),[]);assert.match(r.config,new RegExp('Table = '+table));
 }
});
