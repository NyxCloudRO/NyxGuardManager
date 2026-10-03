import fs from 'node:fs';
import path from 'node:path';
const root = process.argv[2];
function file(name, fn) {const p=path.join(root,name);fs.writeFileSync(p,fn(fs.readFileSync(p,'utf8')));}
function replace(s,from,to,count=1){if(s.split(from).length-1!==count)throw new Error(`Patch assertion failed: ${from.slice(0,90)}`);return s.replaceAll(from,to);}
function cut(s,start,end,replacement){const a=s.indexOf(start),b=s.indexOf(end,a);if(a<0||b<0)throw new Error('Patch block missing');return s.slice(0,a)+replacement+s.slice(b);}
file('internal/audit-log.js',s=>{
  s='import {auditFields, systemAuditFields} from "./audit-policy.mjs";\n'+s;
  return cut(s,'\t\tif (typeof data.user_id', '\n\t},\n};', '\t\treturn await auditLogModel.query().insert(auditFields(access, data));\n\t},\n\taddSystem: async (_access,data) => {\n\t\treturn await auditLogModel.query().insert(systemAuditFields(data));');
});
file('internal/user.js',s=>{
 const from='\t\tawait internalAuditLog.add(access, {\n\t\t\taction: "created",';
 s=replace(s,'return internalToken.getTokenFromUser(user);','return internalAuditLog.add(access,{action:"impersonated",object_type:"user",object_id:user.id,meta:{}}).then(()=>internalToken.getTokenFromUser(user));');
 return replace(s,from,'\t\tawait internalAuditLog[options.emitRecoveryKey ? "addSystem" : "add"](access, {\n\t\t\taction: "created",');
});
file('internal/certificate.js',s=>{
 s=replace(s,'token: tokenModel(),','token: tokenModel(),\n\t\t\t\t\t\t\t\t\t\tauditSystem: true,');
 return replace(s,'await internalAuditLog.add(access, {\n\t\t\t\taction: "renewed",','await internalAuditLog[access.auditSystem ? "addSystem" : "add"](access, {\n\t\t\t\taction: "renewed",');
});
file('routes/main.js',s=>replace(replace(s,'import eventCenterRoutes','import adminAudit from "../internal/admin-audit.js";\nimport eventCenterRoutes'),'router.use("/schema", schemaRoutes);','router.use(adminAudit);\nrouter.use("/schema", schemaRoutes);'));
file('internal/nyxguard/rules.js',s=>{
  s='import {expireSecurityState} from "../security-lifecycle.mjs";\n'+s;
  s=cut(s,'\tpruneExpiredAutoBans:', '\tlist: async', '\tpruneExpiredAutoBans: expireSecurityState,\n\tpruneInactiveAttackDerivedRules: expireSecurityState,\n');
  s=replace(s,'\t\tawait ipRules.pruneInactiveAttackDerivedRules(db);\n','');
  if(s.split('\t\tconst patch = {};').length-1!==2)throw new Error('Rule patch assertion');
  s=s.replace('\t\tconst patch = {};','\t\tconst patch = {rule_origin: "manual"};');
  // list remains the enforcement view; management listing uses its existing all-state query.
  return s;
});
file('routes/nyxguard/rules.js',s=>replace(s,'\tawait internalNyxGuard.ipRules.pruneInactiveAttackDerivedRules(db());\n',''));
file('internal/attack-monitor.js',s=>{
  s='import {expireSecurityState, retainHistory} from "./security-lifecycle.mjs";\n'+s;
  s=cut(s,'function webThreatRuleForAttack(', 'function normalizeHostForRule(', '');
  s=replace(s,'\t\tawait insertWebThreatEventForAttack(knex, { ...ev, type: eventType });\n','');
  s=replace(s,'let pendingReload = false;', 'let pendingReload = true;\nlet lastMaintenanceMs = 0;');
  s=replace(s,'\t\t\tnote: nextNote,','\t\t\tnote: nextNote,\n\t\t\trule_origin: "automatic_ban",');
  s=replace(s,'\t\t\tnote,\n\t\t\texpires_on: allowUntil,','\t\t\tnote,\n\t\t\trule_origin: "verified_crawler",\n\t\t\texpires_on: allowUntil,');
  // Automatic producers never re-enable or extend manual configuration.
  s=replace(s,'\t// Permanent deny: keep as-is.', '\tif (deny.rule_origin !== "automatic_ban") return {changed:false, id:deny.id};\n\t// Permanent deny: keep as-is.');
  s=replace(s,'\tconst curMs = Date.parse(String(allow.expires_on ?? ""));', '\tif (allow.rule_origin !== "verified_crawler") return {changed:false, id:allow.id};\n\tconst curMs = Date.parse(String(allow.expires_on ?? ""));');
  s=replace(s,'const allow = await knex("nyxguard_ip_rule").where({ ip_cidr: ip, action: "allow", enabled: 1 }).first();', 'const allow = await knex("nyxguard_ip_rule").where({ ip_cidr: ip, action: "allow", enabled: 1 }).andWhere(q=>q.whereNull("expires_on").orWhere("expires_on",">",knex.fn.now())).first();');
  s=cut(s,'\t// Cleanup (best effort)', '\t// Reload nginx when bans changed', '');
  s=replace(s,'\t\tawait pollOnce();','\t\tconst knex = db();\n\t\tif (await expireSecurityState(knex)) pendingReload = true;\n\t\tawait applyPendingReload(knex);\n\t\tif (Date.now() - lastMaintenanceMs > 60000) {\n\t\t\tawait retainHistory(knex);\n\t\t\tlastMaintenanceMs = Date.now();\n\t\t}\n\t\tawait pollOnce();');
  s=replace(s,'\t\t// Preserve the existing best-effort polling behavior.', '\t\tlogger.warn("Security maintenance or attack polling failed; will retry");');
  s+='\nexport {runPollOnce, upsertAutoBanRule, upsertVerifiedCrawlerAllowRule};\n';
  return s;
});
file('routes/nyxguard/attack-log.js',s=>{
 s=replace(s,'enum: [1, 7, 30, 60, 90]','enum: [0, 1, 7, 30, 60, 90]');
 s=replace(s,'enum: [1, 7, 30]','enum: [0, 1, 7, 30, 180, 365]');
 s=replace(s,'const since = new Date(Date.now() - data.days * 24 * 60 * 60 * 1000);','const since = data.days === 0 ? new Date(0) : new Date(Date.now() - data.days * 24 * 60 * 60 * 1000);');
 s=replace(s,'note: "Manual ban (Attacks)",','note: "Manual ban (Attacks)",\n\t\t\t\t\t\trule_origin: "manual",',2);
 return s;
});
file('routes/nginx/access_portal.js',s=>{
 s='import {sanitizeContext} from "../../internal/audit-policy.mjs";\n'+s;
 s=replace(s,'user_id: 1,','user_id: 0,\n\t\t\t\tcategory: "access",\n\t\t\t\tactor_kind: "unauthenticated",',2);
 // Both direct access-event producers use a minimized scalar context.
 for (const marker of ['object_type: "access-check"','object_type: "access-login"']) {
  const start=s.indexOf('meta: {',s.indexOf(marker)),closing=s.slice(start).match(/\n[ \t]*},(?=\n[ \t]*created_on:)/),end=closing ? start+closing.index : -1;
  if(start<0||end<0)throw new Error('Access audit context assertion failed');
  const body=s.slice(start+'meta: {'.length,end);
  const result=marker.includes('access-check')?'denied':'result === "success" ? "success" : "failed"';
  s=s.slice(0,start)+`result: ${JSON.stringify(result)==='"denied"'?'"denied"':result},\n\t\t\t\tmeta: JSON.stringify(sanitizeContext({${body}\n\t\t\t\t})),`+s.slice(end+closing[0].length);
 }
 return s;
});
file('internal/token.js',s=>{
 s='import auditLog from "./audit-log.js";\n'+s;
 const audit='token: (Token.getUserId() > 0 ? (await auditLog.add({token:Token},{action:"login_success",object_type:"authentication",object_id:Token.getUserId(),meta:{}}), signed.token) : signed.token),';
 s=replace(s,'token: signed.token,',audit,4);
 const refresh=s.indexOf('getFreshToken:'),verify=s.indexOf('verify2FA:',refresh);
 if(refresh<0||verify<0)throw new Error('Authentication patch assertion');
 s=s.slice(0,refresh)+s.slice(refresh,verify).replace('action:"login_success"','action:"token_refreshed"')+s.slice(verify);
 const impersonate=s.indexOf('getTokenFromUser:');
 s=s.slice(0,impersonate)+replace(s.slice(impersonate),audit,'token: signed.token,');
 return s;
});
file('routes/tokens.js',s=>{
 s=replace(s,'notifyFailedLogin(req, req.body?.identity, err);','notifyFailedLogin(req, req.body?.identity, err);\n\t\t\t\t\tawait db()("audit_log").insert({user_id:0,object_type:"authentication",object_id:0,action:"login_failed",actor_kind:"unauthenticated",category:"users",result:"failed",meta:"{}",created_on:db().fn.now(),modified_on:db().fn.now()});');
 return s;
});
file('routes/web-threat.js',s=>{
 s=replace(s,'const createdBy = req.user?.email ?? req.user?.name ?? "user";', 'const createdBy = `user:${res.locals.access.token.getUserId()}`;');
 s=replace(s,'.limit(12);','.modify(q=>{if(appId)q.limit(12);});');
 s=replace(s,'const topRules = (topRulesRaw ?? []).map','let topRules = (topRulesRaw ?? []).map');
 const marker='\n\t\tres.status(200).send({\n\t\t\thours: Number.parseInt(String(req.query.hours ?? "24"), 10) || 24,\n\t\t\tbyCategory,';
 s=replace(s,marker,`\n\t\t// Attack-monitor detections now have one canonical store. Keep global security statistics truthful.\n\t\tif (!appId) {\n\t\t\tconst attacks = await knex("nyxguard_attack_event").select("attack_type").count({count:"*"}).where("created_on",">=",cutoff).groupBy("attack_type");\n\t\t\tconst merged = new Map(topRules.map(r=>[r.ruleId,r.count]));\n\t\t\tfor (const r of attacks) {const count=Number(r.count);byCategory.inbound+=count;const id="inbound."+r.attack_type;merged.set(id,(merged.get(id)||0)+count);}\n\t\t\ttopRules=[...merged].map(([ruleId,count])=>({ruleId,count})).sort((a,b)=>b.count-a.count).slice(0,12);\n\t\t}\n`+marker);
 return s;
});
