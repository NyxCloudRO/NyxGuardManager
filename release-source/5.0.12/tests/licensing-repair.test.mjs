import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,generateKeyPairSync,sign} from 'node:crypto';
import {LicensingClient} from '../licensing/client.mjs';
import {PRODUCT,CAPABILITY,PREMIUM_PRODUCT,PREMIUM_CAPABILITIES,verifyNyxGuardEnvelope} from '../licensing/verify.mjs';
import {certificateFailure} from '../internal/certificate-errors.mjs';
import {validateCertificateDomains} from '../internal/certificate-domains.mjs';
const installation='11111111-1111-4111-8111-111111111111';
const activation='22222222-2222-4222-8222-222222222222';
const now=Date.parse('2026-10-11T12:00:00Z');
const {publicKey,privateKey}=generateKeyPairSync('ed25519');
const raw=publicKey.export({type:'spki',format:'der'}).subarray(-32);
const trust={test:{publicKey:raw.toString('base64'),fingerprint:createHash('sha256').update(raw).digest('base64url'),status:'active'}};
function envelope(id=installation,product=PRODUCT,revision=1,expires=now+86400000){
 const payload={activation_id:activation,capabilities:product===PRODUCT?[CAPABILITY]:[...PREMIUM_CAPABILITIES],entitlement_id:'33333333-3333-4333-8333-333333333333',expires_at:new Date(expires).toISOString().replace('.000Z','Z'),installation_id:id,issued_at:'2026-10-09T00:00:00Z',kid:'test',not_before:'2026-10-09T00:00:00Z',offline_grace_seconds:604800,policy_version:1,product,revision,schema_version:1,status:'active',subject:'synthetic_subject_1234'};
 const bytes=Buffer.from(JSON.stringify(payload));return {envelope_version:1,alg:'Ed25519',kid:'test',payload:bytes.toString('base64url'),signature:sign(null,bytes,privateKey).toString('base64url')};
}
class Store {
 constructor(active=false){this.data={installationId:installation,revisionFloor:active?5:0,state:active?{activationId:activation,refreshCredential:'x'.repeat(43),envelope:envelope(installation,PRODUCT,5),lastVerified:now}:null};}
 async read(){return structuredClone(this.data);}
 async write(state,floor){this.data.state=structuredClone(state);this.data.revisionFloor=floor;}
 async replaceInstallation(id,state,floor){this.data={installationId:id,state:structuredClone(state),revisionFloor:floor};}
}
const response=(status,data)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json'}});
const client=(store,fetchImpl)=>new LicensingClient({store,authorityOrigin:'https://authority.example.invalid',trust,now:()=>now,fetchImpl});
test('configured authority and missing entitlement are independent',async()=>{
 const c=client(new Store(),()=>{throw Error('must not contact authority');});
 const s=await c.status();assert.equal(s.state,'NOT_CONFIGURED');assert.deepEqual(s.authority,{configured:true,state:'NOT_CHECKED'});
});
test('HTML Cloudflare 525 retains status and safe reference, never body',async()=>{
 const c=client(new Store(true),async()=>new Response('<html>secret=synthetic-leak</html>',{status:525,headers:{'content-type':'text/html','cf-ray':'0123456789abcdef-OTP'}}));
 await assert.rejects(c.refresh(),e=>e.code==='LICENSING_AUTHORITY_TLS'&&e.details.upstream_http_status===525&&e.details.dependency_reference==='0123456789abcdef-OTP'&&!JSON.stringify(e).includes('synthetic-leak'));
 assert.equal((await c.status()).state,'OFFLINE_GRACE');assert.equal(c.store.data.revisionFloor,5);assert.equal(c.store.data.state.refreshCredential,'x'.repeat(43));
});
test('DNS, TLS and timeout failures remain distinct',async()=>{
 for(const [reason,expected] of [['ENOTFOUND','LICENSING_AUTHORITY_DNS'],['CERT_HAS_EXPIRED','LICENSING_AUTHORITY_TLS'],['TimeoutError','LICENSING_AUTHORITY_TIMEOUT']]){
  const c=client(new Store(),async()=>{throw Object.assign(new Error('secret=synthetic-leak'),{cause:{code:reason}});});
  await assert.rejects(c.requestRecovery('synthetic@example.invalid'),e=>e.code===expected&&!JSON.stringify(e).includes('synthetic-leak'));
 }
});
test('request validation and authority denial are not blanket 503',async()=>{
 const c=client(new Store(),async()=>response(400,{category:'malformed_request'}));
 await assert.rejects(c.claim('bad'),e=>e.status===400);
 await assert.rejects(c.requestRecovery('synthetic@example.invalid'),e=>e.status===400&&e.details.authority_category==='malformed_request');
});
test('recovery retry after timeout keeps binding and existing active entitlement',async()=>{
 const store=new Store(true),sent=[];
 const c=client(store,async(_url,options)=>{sent.push(JSON.parse(options.body).installation_id);if(sent.length===1)throw Object.assign(new Error('temporary'),{name:'TimeoutError'});return response(200,{result:'request_accepted'});});
 await assert.rejects(c.requestRecovery('synthetic@example.invalid'));
 await c.requestRecovery('synthetic@example.invalid');assert.equal(sent[0],sent[1]);assert.equal(store.data.installationId,installation);assert.equal(store.data.revisionFloor,5);assert.equal((await c.status()).state,'ACTIVE');
});
test('repeated accepted recovery requests preserve the target of the first emailed code',async()=>{
 const store=new Store(),targets=[];
 const c=client(store,async(url,options)=>{
  const id=JSON.parse(options.body).installation_id;
  if(url.endsWith('/request')){targets.push(id);return response(200,{result:'request_accepted'});}
  assert.equal(id,targets[0],'emailed code must remain bound to the original target');
  if(url.endsWith('/exchange'))return response(200,{activation_proof:'p'.repeat(43)});
  return response(200,{signed_entitlement:envelope(id),activation_id:activation,refresh_credential:'r'.repeat(43),authoritative_revision:1});
 });
 await c.requestRecovery('synthetic@example.invalid');await c.requestRecovery('synthetic@example.invalid');
 assert.equal(targets[0],targets[1]);await c.confirmRecovery('c'.repeat(43));assert.equal((await c.status()).state,'ACTIVE');
});
test('confirmation retry reuses encrypted-store proof instead of consuming code again',async()=>{
 const store=new Store(true);let exchanges=0,confirmations=0;
 const c=client(store,async(url,options)=>{
  const id=JSON.parse(options.body).installation_id;
  if(url.endsWith('/request'))return response(200,{result:'request_accepted'});
  if(url.endsWith('/exchange')){exchanges++;return response(200,{activation_proof:'p'.repeat(43)});}
  confirmations++;if(confirmations===1)throw Object.assign(new Error('temporary'),{name:'TimeoutError'});
  return response(200,{signed_entitlement:envelope(id,PRODUCT,6),activation_id:activation,refresh_credential:'r'.repeat(43),authoritative_revision:6});
 });
 await c.requestRecovery('synthetic@example.invalid');await assert.rejects(c.confirmRecovery('c'.repeat(43)));await c.confirmRecovery('c'.repeat(43));
 assert.equal(exchanges,1);assert.equal(confirmations,2);assert.equal((await c.status()).state,'ACTIVE');assert.equal(store.data.state.pendingRecoveryProof,undefined);
});
test('recovery from another product scopes revision floor to new signed installation',async()=>{
 const store=new Store(true);
 const c=client(store,async(url,options)=>{
  if(url.endsWith('/request'))return response(200,{result:'request_accepted'});
  if(url.endsWith('/exchange'))return response(200,{activation_proof:'p'.repeat(43)});
  const id=JSON.parse(options.body).installation_id;
  return response(200,{signed_entitlement:envelope(id,PREMIUM_PRODUCT,1),activation_id:activation,refresh_credential:'r'.repeat(43),authoritative_revision:1});
 });
 await c.requestRecovery('synthetic@example.invalid',PREMIUM_PRODUCT);await c.confirmRecovery('c'.repeat(43));assert.equal(store.data.revisionFloor,1);assert.equal((await c.status()).product,PREMIUM_PRODUCT);
});
test('expired cached entitlement can refresh a renewal without enabling expired support',async()=>{
 const store=new Store(true);store.data.state.envelope=envelope(installation,PRODUCT,5,now-1000);
 const c=client(store,async()=>response(200,{signed_entitlement:envelope(installation,PRODUCT,6),authoritative_revision:6}));
 assert.equal((await c.status()).state,'EXPIRED');assert.equal((await c.status()).enabled,false);
 assert.throws(()=>verifyNyxGuardEnvelope(Buffer.from(JSON.stringify(store.data.state.envelope)),{trust,now}),/expired_entitlement/);
 assert.equal((await c.refresh()).state,'ACTIVE');
});
test('DNS zone lookup exposes only the requested domain and fixed guidance',()=>{
 const e=certificateFailure(new Error("Unable to determine zone_id for nycloud.ro using zone names: ['nycloud.ro','ro']. token=synthetic-leak"),{domains:['*.nyxcloud.ro','nycloud.ro']});
 assert.equal(e.code,'CERTIFICATE_DNS_ZONE_NOT_FOUND');assert.equal(e.details.dns_zone,'nycloud.ro');assert.match(e.message,/before propagation/);assert.ok(!JSON.stringify(e).includes('synthetic-leak'));
 const foreign=certificateFailure(new Error('Unable to determine zone_id for unrelated.example using zone names:'),{domains:['nyxcloud.ro']});assert.equal(foreign.details,undefined);
});
test('certificate input rejects malformed names without guessing domain ownership',()=>{
 for(const names of [['*.nyxcloud.ro','nyxcloud.ro'],['*.nyxcloud.ro','nycloud.ro'],['example.com','other.example']])assert.doesNotThrow(()=>validateCertificateDomains(names));
 for(const name of ['foo*bar.example','*.*.example','bad_label.example','-bad.example','bad-.example','example..com','localhost',' https://example.com','123.123.123.123'])assert.throws(()=>validateCertificateDomains([name]),e=>e.status===400);
});
