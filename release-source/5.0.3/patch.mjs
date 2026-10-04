import fs from 'node:fs';
import path from 'node:path';
const root=process.argv[2];
function patch(name,from,to,count=1) {
 const p=path.join(root,name),s=fs.readFileSync(p,'utf8');
 if(s.split(from).length-1!==count)throw Error('5.0.3 prerequisite mismatch: '+name+' '+from.slice(0,70));
 fs.writeFileSync(p,s.replaceAll(from,to));
}
const accessFile=path.join(root,'routes/nginx/access_portal.js');
let access=fs.readFileSync(accessFile,'utf8');
access='import {recordAccessDecision} from "../../internal/access-audit.mjs";\n'+access;
const start=access.indexOf('\t\tdb()("audit_log")',access.indexOf('function logCheckDeny('));
const end=access.indexOf('\n\t} catch {',start);
if(start<0||end<0)throw Error('Access decision persistence block missing');
access=access.slice(0,start)+'\t\tvoid recordAccessDecision(db(), req, reason, ctx).catch(() => console.error("Access decision audit persistence failed"));'+access.slice(end);
// Retain credential submission outcomes; include only minimized safe context.
access=access.replace('host: String(host || ""),','name: String(host || ""),\n                source_ip: String(externalIp || ""),\n                reason_code: String(reason || ""),\n                resource: "/nginx/access-portal/session",');
fs.writeFileSync(accessFile,access);
patch('internal/token.js','token: (Token.getUserId() > 0 ? (await auditLog.add({token:Token},{action:"token_refreshed",object_type:"authentication",object_id:Token.getUserId(),meta:{}}), signed.token) : signed.token),',
 'token: (thisData.scope && access.token.hasScope("admin") ? (await auditLog.add(access,{action:"token_issued",object_type:"authentication",object_id:access.token.getUserId(),meta:{reason_code:"scoped_token_issued"}}), signed.token) : signed.token),');
patch('internal/security-lifecycle.mjs', 'export async function expireSecurityState', 'import {retainAuditHistory} from "./audit-retention.mjs";\nexport async function expireSecurityState');
const lifecycle=path.join(root,'internal/security-lifecycle.mjs');
let maintenance=fs.readFileSync(lifecycle,'utf8');
const cutoff=maintenance.indexOf('  const setting = await k(\'setting\')');
if(cutoff<0)throw Error('Existing audit retention block missing');
maintenance=maintenance.slice(0,cutoff)+'  await retainAuditHistory(k);\n}\n';
fs.writeFileSync(lifecycle,maintenance);
patch('routes/tokens.js','export default router;', "router.post('/logout',jwtdecode(),async(_req,res,next)=>{try{if(!res.locals.access?.token?.getUserId())return res.sendStatus(401);const {default:audit}=await import('../internal/audit-log.js');await audit.add(res.locals.access,{action:'logout',object_type:'authentication',object_id:res.locals.access.token.getUserId(),meta:{}});res.sendStatus(204);}catch(e){next(e);}});\nexport default router;");
patch('routes/event-center.js', '  res.send(await clearEvents(db(),req.body));', "  try{normalizeScope(req.body);}catch{throw new errs.ValidationError('Invalid Event Center scope');}\n  res.send(await clearEvents(db(),req.body));");
patch('package.json','"version": "5.0.2"','"version": "5.0.3-dev"');
const main='frontend/assets/index-CTHAIRmi-409dev-4012certfix4-threatpagination3.js';
patch(main,'$C="5.0.2"','$C="5.0.3-dev"');
patch(main,'y=()=>{if(Ei.count()>=2)', 'y=async()=>{try{await zn({url:"/tokens/logout",timeout:2000})}catch{}if(Ei.count()>=2)');
patch(main,'Coe="5.0.2"','Coe="5.0.3-dev"');
patch('frontend/assets/index-DTnhxNQ_.js','K="5.0.2",Bt=','K="5.0.3-dev",Bt=');
patch('frontend/assets/notification-visibility-4010.js','desiredVersion = "5.0.2"','desiredVersion = "5.0.3-dev"');
patch('frontend/index.html','event-center.css?v=5.0.2','event-center.css?v=5.0.3-dev');
fs.copyFileSync(path.join(root,'frontend/assets/event-center-source.js'),path.join(root,'frontend/assets/index-DJfFx4nu.js'));
patch('internal/admin-audit.js','meta:{status:res.statusCode}','meta:{status:res.statusCode,resource:req.path}');
