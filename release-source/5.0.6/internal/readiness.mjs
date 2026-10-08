import releasePolicy from './release-policy.mjs';
import fs from 'node:fs/promises';
import https from 'node:https';
import db from '../db.js';
import {execBounded} from './bounded-process.mjs';

let initialized=false;
const minimum=['migrations','migrations_lock','user','auth','user_permission','setting','proxy_host',
  'certificate','access_list','nyxguard_settings','nyxguard_traffic_stat','nyxguard_traffic_state','audit_log'];
const requiredMigrations=(await fs.readdir(new URL('../migrations/',import.meta.url))).filter(name=>name.endsWith('.js')).sort();
async function nginxInterface() {
  await new Promise((resolve,reject)=>{
    const request=https.get('https://127.0.0.1:8443/',{rejectUnauthorized:false,agent:false},response=>{
      response.resume();
      if(response.statusCode!==200)reject(new Error('Admin interface unavailable'));
      else response.on('end',resolve);
      response.on('error',reject);
    });
    const timer=setTimeout(()=>request.destroy(new Error('Admin interface deadline')),1000);
    request.on('close',()=>clearTimeout(timer));request.on('error',reject);
  });
}
export function markInitialized(){initialized=true;}
export function registerReadiness(app) {
  app.get('/_nyxguard/ready',async(req,res)=>{
    if(!['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress)) return res.sendStatus(403);
    try {
      if(!initialized) throw new Error('Initialization incomplete');
      const k=db();
      const migrations=await k('migrations').pluck('name').timeout(1500,{cancel:true});
      if(JSON.stringify(migrations.sort())!==JSON.stringify(requiredMigrations)||migrations.length!==releasePolicy.schema)
        throw new Error('Migration identity differs');
      const lock=await k('migrations_lock').max('is_locked as locked').first().timeout(1500,{cancel:true});
      if(Number(lock?.locked)!==0) throw new Error('Migration lock is held');
      // Explicit reads prove critical application columns are usable, including
      // legitimately empty business tables. No row values leave this endpoint.
      await Promise.all(minimum.map(table=>k(table).select('*').limit(0).timeout(1500,{cancel:true})));
      const setting=await k('setting').where({id:'default-site'}).count('* as count').first().timeout(1500,{cancel:true});
      if(Number(setting.count)!==1) throw new Error('Settings prerequisites missing');
      const [auth]=await k.raw(`SELECT (SELECT COUNT(*) FROM user) AS users,
        (SELECT COUNT(*) FROM user u WHERE u.is_deleted=0 AND JSON_CONTAINS(u.roles,'"admin"') AND EXISTS
          (SELECT 1 FROM auth a WHERE a.user_id=u.id AND a.type='password' AND LENGTH(a.secret)>0)) AS admins,
        (SELECT COUNT(*) FROM auth a LEFT JOIN user u ON u.id=a.user_id WHERE u.id IS NULL) AS orphan_auth,
        (SELECT COUNT(*) FROM user_permission p LEFT JOIN user u ON u.id=p.user_id WHERE u.id IS NULL) AS orphan_permissions`).timeout(1500,{cancel:true});
      if((Number(auth[0].users)>0&&Number(auth[0].admins)<1)||Number(auth[0].orphan_auth)||Number(auth[0].orphan_permissions))
        throw new Error('Authentication prerequisites missing');
      await execBounded('nginx -t',{timeoutMs:1500});
      await nginxInterface();
      res.json({ready:true,integrity:true,version:process.env.NPM_BUILD_VERSION,schema:migrations.length});
    } catch {res.status(503).json({ready:false,reason:'application_prerequisites_unavailable'});}
  });
}
