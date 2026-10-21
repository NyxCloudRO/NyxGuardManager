import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';import https from 'node:https';import{X509Certificate}from'node:crypto';import{execFileSync,spawn}from'node:child_process';
const compromised='86:A1:EC:BA:08:9C:4A:8D:3B:BE:27:34:C6:12:BA:34:1D:81:3E:04:3C:F9:E8:A8:62:CD:5C:57:A3:6B:BE:6B';
const roots=body=>[...body.matchAll(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g)].map(m=>new X509Certificate(m[0]));
test('patched system, Certbot and startup seed trust stores exclude the compromised root',async()=>{
 assert.equal(execFileSync('dpkg-query',['-W','-f=${Version}','ca-certificates'],{encoding:'utf8'}),'20250419~deb12u2');assert.equal(execFileSync('/opt/certbot/bin/python',['-c','import certifi;print(certifi.__version__)'],{encoding:'utf8'}).trim(),'2026.10.19');
 const files=['/etc/ssl/certs/ca-certificates.crt','/opt/certbot/lib/python3.11/site-packages/certifi/cacert.pem','/opt/certbot-site-packages-seed/certifi/cacert.pem'];
 for(const file of files){const certs=roots(await fs.readFile(file,'utf8'));assert(certs.length>100);assert(!certs.some(c=>c.fingerprint256===compromised),file)}
 assert.equal(await fs.readFile(files[1],'utf8'),await fs.readFile(files[2],'utf8'));
});
test('Node uses the selected system bundle, rejects untrusted TLS and preserves explicit extra CAs',async()=>{
 assert.match(process.env.NODE_OPTIONS||'',/--use-openssl-ca/);const dir=await fs.mkdtemp(path.join(os.tmpdir(),'nyxguard-ca-fixture-'));const quiet={stdio:'ignore'};let server;
 try{
  for(const name of ['a','b'])execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-days','1','-subj','/CN=NyxGuard disposable '+name,'-keyout',dir+'/'+name+'.key','-out',dir+'/'+name+'.pem','-addext','subjectAltName=IP:127.0.0.1'],quiet);
  server=https.createServer({key:await fs.readFile(dir+'/a.key'),cert:await fs.readFile(dir+'/a.pem')},(_,r)=>r.end('fixture'));await new Promise(r=>server.listen(0,'127.0.0.1',r));const url='https://127.0.0.1:'+server.address().port;
  async function probe(cafile,extra){return new Promise((resolve,reject)=>{const env={...process.env,SSL_CERT_FILE:cafile,SSL_CERT_DIR:dir+'/empty'};delete env.NODE_EXTRA_CA_CERTS;if(extra)env.NODE_EXTRA_CA_CERTS=extra;const child=spawn(process.execPath,['--input-type=module','-e','try {const r=await fetch('+JSON.stringify(url)+');console.log(await r.text());}catch{process.exitCode=2}'],{env,stdio:['ignore','pipe','pipe']});let out='';child.stdout.on('data',b=>out+=b);child.on('error',reject);child.on('exit',code=>resolve({code,out}));});}
  assert.deepEqual(await probe(dir+'/a.pem'),{code:0,out:'fixture\n'});assert.equal((await probe(dir+'/b.pem')).code,2);assert.equal((await probe('/etc/ssl/certs/ca-certificates.crt')).code,2);assert.deepEqual(await probe('/etc/ssl/certs/ca-certificates.crt',dir+'/a.pem'),{code:0,out:'fixture\n'});
 }finally{if(server)await new Promise(r=>server.close(r));await fs.rm(dir,{recursive:true,force:true})}
});
