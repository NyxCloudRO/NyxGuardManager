// Destructive fixture mutations are guarded against the effective DB connection.
import {test,before,after} from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';import crypto from 'node:crypto';
import db from '/app/db.js';import {AVATAR_MAX_BYTES} from '/app/internal/avatar-policy.mjs';
import {pngAtSize,jpegImage,webpImage} from './avatar-fixtures.mjs';
const k=db();let server,base,dir,admin,ordinary,original;
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
before(async()=>{
  assert.equal(k.client.config.connection.host,'nyxguard-task1-db');assert.equal(k.client.config.connection.database,'task1_fixture');
  dir=await fs.mkdtemp(path.join(os.tmpdir(),'nyx-avatar-fixture-'));process.env.NYXGUARD_AVATAR_DIR=dir;
  original=(await k('user').where('id',1).first()).avatar;
  assert.equal(await k('user').where('id',990098).first(),undefined);
  await k('user').insert({id:990098,name:'Avatar fixture standard user',nickname:'Avatar fixture',email:'avatar-fixture@example.invalid',roles:'[]',avatar:'',is_deleted:0,created_on:k.fn.now(),modified_on:k.fn.now()});
  await (await import('/app/models/user_permission.js')).default.query().insert({user_id:990098,visibility:'user',proxy_hosts:'view',redirection_hosts:'view',dead_hosts:'view',streams:'view',access_lists:'view',certificates:'view',nyxguard:'view',web_controls:'view',users:'view',auditlog:'view',settings:'view'});
  await (await import('/app/schema/index.js')).getCompiledSchema();const tokens=(await import('/app/models/token.js')).default();
  admin=(await tokens.create({iss:'api',attrs:{id:1},scope:['user'],expiresIn:'1h'})).token;
  ordinary=(await tokens.create({iss:'api',attrs:{id:990098},scope:['user'],expiresIn:'1h'})).token;
  server=(await import('/app/app.js')).default.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));base=`http://127.0.0.1:${server.address().port}`;
});
after(async()=>{
  if(server)await new Promise(r=>server.close(r));
  if(original!==undefined)await k('user').where('id',1).update({avatar:original});
  await k('user_permission').where('user_id',990098).delete();await k('user').where('id',990098).delete();
  if(dir)await fs.rm(dir,{recursive:true,force:true});await k.destroy();
});
async function upload(data,type='image/png',token=admin,id=1,filename='synthetic.png',prefix='/api') {
  const form=new FormData();form.append('avatar',new Blob([data],{type}),filename);
  const response=await fetch(`${base}${prefix}/users/${id}/avatar`,{method:'POST',headers:token?{Authorization:'Bearer '+token}:{},body:form});
  const body=await response.json();return {status:response.status,body};
}
test('real multipart boundary accepts small, 2 MiB, 2–5 MiB and exactly 5 MiB; rejects one byte over and oversized',async()=>{
  for(const size of [0,2*1024*1024,3*1024*1024,AVATAR_MAX_BYTES]){
    const data=pngAtSize(size),r=await upload(data);assert.equal(r.status,200,JSON.stringify(r.body));
    assert.equal(hash(await fs.readFile(path.join(dir,'user-1.png'))),hash(data));
    assert.ok(r.body.avatar.startsWith('/api/avatar/1?v='));
  }
  const retained=hash(await fs.readFile(path.join(dir,'user-1.png')));
  for(const size of [AVATAR_MAX_BYTES+1,7*1024*1024]){
    const r=await upload(pngAtSize(size));assert.equal(r.status,413);assert.equal(r.body.error.message,'Avatar too large (max 5MB)');assert.equal(r.body.debug,undefined);
    assert.equal(hash(await fs.readFile(path.join(dir,'user-1.png'))),retained);
  }
  assert.equal((await upload(pngAtSize(AVATAR_MAX_BYTES),'image/png',admin,1,'synthetic.png','')).status,200);
});
test('supported PNG/JPEG/WebP, MIME/content checks and malformed/unsupported rejection remain authoritative',async()=>{
  for(const [data,type,ext] of [[pngAtSize(),'image/png','png'],[jpegImage,'image/jpeg','jpg'],[webpImage,'image/webp','webp']]){
    assert.equal((await upload(data,type)).status,200);assert.deepEqual(await fs.readdir(dir),['user-1.'+ext]);
    const served=await fetch(base+'/api/avatar/1');assert.equal(served.headers.get('content-type'),type);assert.equal(served.headers.get('x-content-type-options'),'nosniff');
  }
  for(const [data,type,name] of [[Buffer.from('not an image'),'image/png','renamed.png'],[Buffer.concat([Buffer.from([137,80,78,71]),Buffer.alloc(20)]),'image/png','fake.png'],[pngAtSize().subarray(0,20),'image/png','truncated.png'],[pngAtSize(),'image/jpeg','mismatch.jpg'],[Buffer.from('<svg></svg>'),'image/svg+xml','unsupported.svg'],[Buffer.from('GIF89a'),'image/gif','unsupported.gif']]){
    const r=await upload(data,type,admin,1,name);assert.equal(r.status,400);assert.equal(r.body.debug,undefined);
  }
});
test('authentication/other-user authorization, safe filenames, replacement and removal preserve existing storage semantics',async()=>{
  const data=pngAtSize();assert.equal((await upload(data,'image/png',null)).status,401);
  assert.equal((await upload(data,'image/png',ordinary,1)).status,403);
  assert.equal((await upload(data,'image/png',ordinary,990098)).status,200);
  assert.equal((await upload(data,'image/png',admin,1,'../../executable.php')).status,200);
  assert.deepEqual((await fs.readdir(dir)).sort(),['user-1.png','user-990098.png']);
  assert.equal((await upload(jpegImage,'image/jpeg')).status,200);assert.deepEqual((await fs.readdir(dir)).sort(),['user-1.jpg','user-990098.png']);
  const r=await fetch(base+'/api/users/1/avatar',{method:'DELETE',headers:{Authorization:'Bearer '+admin}});assert.equal(r.status,200);
  const body=await r.json();assert.ok(body.avatar.startsWith('data:image/svg+xml'));assert.deepEqual(await fs.readdir(dir),['user-990098.png']);
});
