import test from 'node:test';
import assert from 'node:assert/strict';
import {certificateFailure,certificateOperation,runCertbot,safeCertificateResponse} from '../internal/certificate-errors.mjs';
const secret='SYNTHETIC_PRIVATE_VALUE';
for(const [detail,code] of [
 ['Invalid API token','CERTIFICATE_DNS_CREDENTIALS'],['Cloudflare authentication error','CERTIFICATE_DNS_CREDENTIALS'],
 ['DNS problem: NXDOMAIN','CERTIFICATE_DNS_FAILED'],['Connection refused','CERTIFICATE_NETWORK_FAILED'],
 ['too many certificates: rate limit','CERTIFICATE_RATE_LIMIT'],['unauthorized: Invalid response 404','CERTIFICATE_CHALLENGE_FAILED'],
 ["ModuleNotFoundError: No module named certbot",'CERTIFICATE_RUNTIME_UNAVAILABLE'],['arbitrary provider failure','CERTIFICATE_OPERATION_FAILED']
])test(`sanitized actionable ${code}`,()=>{
 const error=certificateFailure(new Error(detail+' '+secret));
 assert.equal(error.code,code);assert.equal(error.public,true);assert.equal(error.status,400);
 assert.ok(!String(error).includes(secret));assert.ok(!error.stack.includes(secret));
 assert.ok(!JSON.stringify(error).includes(secret));assert.equal(error.cause,undefined);
});
test('success does not forward provider output to certificate logging',async()=>{
 const args=['certonly','--webroot'];const options={};
 const result=await runCertbot(async(c,a,o)=>{assert.equal(c,'certbot');assert.equal(a,args);assert.equal(o,options);return secret;},'certbot',args,options);
 assert.ok(!result.includes(secret));
});
test('plugin and subprocess failures drop original messages and nested causes',async()=>{
 const original=Object.assign(new Error('Invalid API token '+secret),{previous:new Error(secret)});
 for(const operation of [()=>certificateOperation(()=>Promise.reject(original)),()=>runCertbot(()=>Promise.reject(original),'certbot',[],{})])
  await assert.rejects(operation,error=>error.code==='CERTIFICATE_DNS_CREDENTIALS'&&!JSON.stringify(error).includes(secret)&&error.previous===undefined);
});

test('plugin and storage failures describe the confirmed failing dependency',()=>{
 assert.equal(certificateFailure(new Error('packaging failed '+secret),{phase:'plugin'}).code,'CERTIFICATE_PLUGIN_FAILED');
 assert.equal(certificateFailure(new Error('EACCES '+secret)).code,'CERTIFICATE_STORAGE_FAILED');
});

test('certificate API metadata is sanitized without changing internal material',()=>{
 const row={id:1,provider:'other',expires_on:new Date('2030-01-01T00:00:00Z'),meta:{certificate:'PUBLIC_PEM',certificate_key:secret,intermediate_certificate:'CHAIN_PEM',dns_provider_credentials:secret,other_setting:'preserved'}};
 const response=safeCertificateResponse(row);
 assert.deepEqual(response.meta,{certificate:true,certificate_key:true,intermediate_certificate:true,other_setting:'preserved'});
 assert.equal(response.expires_on,'2030-01-01T00:00:00.000Z');
 assert.equal(row.meta.certificate_key,secret);assert.equal(row.meta.dns_provider_credentials,secret);
 assert.ok(!JSON.stringify(response).includes(secret));
});
test('certificate collection and expanded records retain safe presence indicators',()=>{
 const rows=[{id:2,meta:{certificate_key:secret}},{id:3,certificate:{id:4,meta:{certificate_key:secret,certificate:''}}}];
 const response=safeCertificateResponse(rows);
 assert.equal(response[0].meta.certificate_key,true);assert.equal(response[1].certificate.meta.certificate_key,true);
 assert.equal(response[1].certificate.meta.certificate,false);
 assert.ok(!JSON.stringify(response).includes(secret));assert.equal(rows[0].meta.certificate_key,secret);
});
