import test from 'node:test';import assert from 'node:assert/strict';import crypto from 'node:crypto';
import {encryptBackup,decryptBackup}from '../backup-crypto.mjs';
test('unchanged scrypt/AES-GCM format round-trips without blocking the event loop',async()=>{
 const payload={version:'5.0.17',tables:{example:[{id:1}]}},passphrase='synthetic fixture passphrase';let ticks=0;
 const timer=setInterval(()=>ticks++,10);let encrypted;
 try{encrypted=await encryptBackup(JSON.stringify(payload),passphrase)}finally{clearInterval(timer)}
 assert(ticks>0);const data=JSON.parse(encrypted);assert.deepEqual(Object.keys(data).sort(),['data','enc','iv','salt','tag']);assert.equal(data.enc,1);
 const key=crypto.scryptSync(passphrase,Buffer.from(data.salt,'hex'),32,{N:131072,r:8,p:1,maxmem:160*1024*1024});
 const decipher=crypto.createDecipheriv('aes-256-gcm',key,Buffer.from(data.iv,'hex'));decipher.setAuthTag(Buffer.from(data.tag,'hex'));
 assert.deepEqual(JSON.parse(Buffer.concat([decipher.update(Buffer.from(data.data,'hex')),decipher.final()])),payload);
 assert.deepEqual((await decryptBackup(encrypted,passphrase)).parsed,payload);
 await assert.rejects(decryptBackup(encrypted,'incorrect fixture'),/decryption failed/);
 const changed={...data,data:(data.data.startsWith('00')?'01':'00')+data.data.slice(2)};await assert.rejects(decryptBackup(JSON.stringify(changed),passphrase),/decryption failed/);
});
test('concurrent KDF work is refused and the gate recovers after completion',async()=>{
 const pending=encryptBackup('{}','synthetic fixture');await assert.rejects(encryptBackup('{}','synthetic fixture'),error=>error.status===409);await pending;assert.equal((await decryptBackup('{"version":"5.0.17"}','')).plain,true);assert.equal(typeof await encryptBackup('{}','synthetic fixture'),'string');
});
