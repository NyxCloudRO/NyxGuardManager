import http from 'node:http';
// Fixed broker contract. Session roles and permissions are checked on every call.
export function storageRequest(body){return new Promise((resolve,reject)=>{
 const payload=JSON.stringify(body);const req=http.request({socketPath:'/run/nyxguard-storage/storage.sock',path:'/storage',method:'POST',headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(payload)}},res=>{
  let data='';res.setEncoding('utf8');res.on('data',chunk=>{data+=chunk;if(data.length>2*1024*1024)req.destroy(Error('Storage response exceeds limit'))});res.on('error',reject);res.on('end',()=>{try{const result=JSON.parse(data);if(res.statusCode!==200){const e=Error(result.error||'Storage operation refused');e.status=409;reject(e)}else resolve(result)}catch(e){reject(e)}});
 });req.setTimeout(120000,()=>req.destroy(Error('Storage verification timed out')));req.on('error',reject);req.end(payload);
});}
export function storageOriginAllowed(req){
 const site=req.headers['sec-fetch-site'];
 if(site&&!['same-origin','none'].includes(site))return false;
 if(!req.headers.origin)return true;
 try{
  const origin=new URL(req.headers.origin),external=new URL(`${req.protocol}://${req.get('host')}`);
  if(origin.username||origin.password||origin.hostname!==external.hostname||origin.protocol!==external.protocol)return false;
  // The existing Nginx proxy preserves the hostname but can omit the external
  // port. Browsers supply this forbidden-to-script header for actual origins.
  return origin.port===external.port||site==='same-origin';
 }catch{return false;}
}
export function registerStorage(router,{jwtdecode,audit,userModel,PermissionError}){
 for(const [method,path,action] of [['get','/storage/inventory','inventory'],['post','/storage/preview','preview'],['post','/storage/delete','delete']]){
  router[method](path,jwtdecode(),async(req,res,next)=>{let actor=0;try{
   const access=res.locals.access;actor=Number(access.token.getUserId(0));await access.can('settings:manage');
   const user=await userModel.query().where({id:actor,is_deleted:0,is_disabled:0}).first();
   if(!user?.roles?.includes('admin')||user.roles.includes('nyxagent')||res.locals.readOnly)throw new PermissionError('Permission Denied');
   if(action!=='inventory'){
    // Existing auth uses explicit Bearer headers. Cross-site ambient-cookie
    // requests cannot mutate; keep browser origin checking as a second boundary.
    if(!/^Bearer [^\s]+$/i.test(req.headers.authorization||''))throw new PermissionError('Permission Denied');
    if(!storageOriginAllowed(req))throw new PermissionError('Permission Denied');
   }
   const data=action==='inventory'?{action,actor}:action==='preview'?{action,actor,ids:req.body?.ids}:{action,actor,plan:req.body?.plan};
   const out=await storageRequest(data);
   if(action==='delete')for(const result of out.outcomes)await audit.add(access,{action:'delete',object_type:'storage-cleanup',object_id:0,result:result.result==='deleted'?'success':'failed',meta:{resource:'/storage/'+result.resource,result:result.result,reason_code:result.error||'cleanup_complete',...(Number.isSafeInteger(result.filesystemFreeDeltaBytes)?{reclaimed_bytes:result.filesystemFreeDeltaBytes}:{})}});
   res.json(out);
  }catch(error){if(action!=='inventory'&&actor){try{await audit.add(res.locals.access,{action:'failed',object_type:'storage-cleanup',object_id:0,result:'denied',meta:{reason_code:'storage_'+action+'_refused',result:'refused'}})}catch{}}
   if(['ENOENT','ECONNREFUSED'].includes(error.code)&&action==='inventory')return res.json({backups:[],images:[],available:false,reason:'host_maintenance_unavailable'});
   next(error);
  }});
 }
}
