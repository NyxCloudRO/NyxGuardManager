from pathlib import Path
import sys
root=Path(sys.argv[1])
def patch(name,old,new,count=1):
 p=root/name;s=p.read_text();actual=s.count(old)
 if actual != count: raise RuntimeError(f"{name}: expected {count} prerequisites, got {actual}")
 p.write_text(s.replace(old,new))
patch('app.js', 'registerReadiness(app);', "registerReadiness(app);\napp.use(jwt());\napp.use(monitoringBoundary);")
patch('app.js','import bodyParser from "body-parser";', 'import monitoringBoundary from "./internal/monitoring-boundary.mjs";\nimport bodyParser from "body-parser";')
patch('lib/access.js', 'import Ajv from "ajv/dist/2020.js";', 'import {isMonitoring,READ_PERMISSIONS} from "../internal/monitoring-policy.mjs";\nimport Ajv from "ajv/dist/2020.js";')
patch('lib/access.js','let permissions = {};','let permissions = {};\nlet monitoring = false;')
patch('lib/access.js','permissions = user.permissions;','permissions = user.permissions || {};\nmonitoring = isMonitoring(user);')
patch('lib/access.js','return await Token.load(tokenString);','await this.init();\nreturn tokenData;')
patch('lib/access.js','await this.init();\n\t\t\t\tconst objectSchema','''await this.init();
                if (monitoring) {
                  if (!READ_PERMISSIONS.has(permission) && !(["users:update","users:password"].includes(permission) && Number(data)===Token.getUserId(0))) throw new errs.PermissionError("Permission Denied");
                  const result = {data,scope:Token.get("scope"),roles:userRoles,permission_visibility:"all"};
                  for (const key of ["proxy_hosts","redirection_hosts","dead_hosts","streams","access_lists","certificates","nyxguard","web_controls","users","auditlog","settings"]) result["permission_"+key] = "view";
                  return result;
                }
                const objectSchema''')
patch('routes/event-center.js',"access.can('settings:update','default-site')","access.can('auditlog:list')")
patch('routes/event-center.js',"if (req.body?.confirm !== true)","await res.locals.access.can('settings:update','default-site');\n  if (req.body?.confirm !== true)")
for name in ['routes/notifications.js','routes/integrations.js']:
 p=root/name;s=p.read_text();i=s.index('.get(async');j=s.index('.post(async',i);before=s[:j];after=s[j:];before=before.replace('access.can("settings:manage")','access.can("settings:list")');p.write_text(before+after)
patch('routes/settings.js','access.can("settings:list");\n\t\t\tconst knex = db();','access.can("settings:manage");\n\t\t\tconst knex = db();')
patch('internal/web-threat-controls.js','async function getEffectivePolicyForApp(knex, appId) {\n\tconst globalId = await ensureGlobalPolicySet(knex);','''async function getEffectivePolicyForApp(knex, appId) {
    const globalRow = await knex("web_threat_policy_sets").where({scope:"global"}).first();
    const globalId = globalRow?.id ?? null;''')
patch('internal/web-threat-controls.js','const policySet = await getPolicySet(knex, policySetId);','const policySet = policySetId ? await getPolicySet(knex, policySetId) : null;')
patch('internal/web-threat-controls.js','const active = await getActivePolicyVersion(knex, policySetId);','const active = policySetId ? await getActivePolicyVersion(knex, policySetId) : null;')
patch('routes/version.js','const data = await internalRemoteVersion.get();','''const data = res.locals.readOnly ? {
 current: process.env.NPM_BUILD_VERSION, latest: internalRemoteVersion.last_result?.tag_name ?? null,
 update_available: false
} : await internalRemoteVersion.get();''')
patch('routes/professional-support.js', 'async function client() {', 'async function client(readOnly = false) {')
patch('routes/professional-support.js','await store.installationId();','if (!readOnly) await store.installationId();\nelse { const row=await db()("nyxcloud_license_state").where({id:1}).first("installation_id"); if (!row) return null; }')
patch('routes/professional-support.js','router.use(jwtdecode(), admin);','''router.use(jwtdecode(), (req,res,next)=>res.locals.readOnly && req.method==="GET" ? next() : admin(req,res,next));''')
patch('routes/professional-support.js','const c = await client();\n\tconst status = c ? await c.status()', 'const c = await client(res.locals.readOnly);\n\tconst status = c ? await c.status()')
patch('routes/professional-support.js','const c = await client();\n\tif (!c)', 'const c = await client(res.locals.readOnly);\n\tif (!c)')
patch('routes/professional-support.js','route("get", "/diagnostics", async (_req, res) => {','''route("get", "/diagnostics", async (_req, res) => {
 if (res.locals.readOnly) {
   const snapshot=await systemSnapshot([],false,true);
   return res.set("Cache-Control","no-store").json(redact({read_only:true,generated_at:new Date().toISOString(),operations:await currentOperations(snapshot),cached: latestDiagnostics ? {at:latestDiagnostics.at,system:latestDiagnostics.system,routing:latestDiagnostics.routing,tls:latestDiagnostics.tls} : null}));
 }''')

patch('internal/user.js','data.roles = data.roles || [];','data.roles = data.roles || [];\nif (data.roles.includes("admin") && data.roles.includes("nyxagent")) throw new errs.ValidationError("Administrator and NyxAgent roles are mutually exclusive");')
patch('internal/user.js','update: (access, data) => {','update: async (access, data) => {\nif (data.roles !== undefined || data.is_disabled !== undefined) {\n await access.can("users:permissions",data.id);\n if (data.roles?.includes("admin") && data.roles?.includes("nyxagent")) throw new errs.ValidationError("Administrator and NyxAgent roles are mutually exclusive");\n}')
# A read must never initialize security configuration.
p=root/'internal/nyxguard/settings.js';s=p.read_text();start=s.index('\t\tawait db("nyxguard_settings").insert({');end=s.index('\n\t\treturn {',start);s=s[:start]+s[end:];p.write_text(s)

patch('lib/access.js','import Ajv from "ajv/dist/2020.js";','import {sessions} from "../internal/revoked-session.mjs";\nimport Ajv from "ajv/dist/2020.js";')
patch('lib/access.js','tokenData = await Token.load(tokenString);','tokenData = await Token.load(tokenString);\nif (await sessions.revoked(tokenString)) throw new errs.PermissionError("Permission Denied");')
patch('routes/tokens.js',"await audit.add(res.locals.access,{action:'logout'", "const {sessions}=await import('../internal/revoked-session.mjs');await sessions.revoke(res.locals.token,res.locals.access.token.get('exp'));await audit.add(res.locals.access,{action:'logout'")

patch('routes/professional-support.js','async function systemSnapshot(problems = [], logAvailable = false) {','async function systemSnapshot(problems = [], logAvailable = false, readOnly = false) {')
patch('routes/professional-support.js','try { await nginx.test(); snapshot.configurationValid = true; }','try { if (!readOnly) { await nginx.test(); snapshot.configurationValid = true; } }')
patch('routes/professional-support.js','snapshot.openrestyHealthy = processHealthy && snapshot.configurationValid;','snapshot.openrestyHealthy = processHealthy && (readOnly || snapshot.configurationValid);')
patch('routes/professional-support.js','const snapshot = await systemSnapshot();','const snapshot = await systemSnapshot([], false, res.locals.readOnly);')
patch('routes/professional-support.js','const snapshot=await systemSnapshot([],false,true);','const snapshot=await systemSnapshot([],false,true);')

patch('routes/update-manager.js','await ensureAdmin(res.locals.access);\n\t\tconst job =', 'await res.locals.access.can("settings:list");\n\t\tconst job =')
patch('routes/update-manager.js','res.status(200).send(job);','res.status(200).send(res.locals.readOnly ? {id:job.id,status:job.status,phase:job.phase,targetVersion:job.targetVersion,createdAt:job.createdAt} : job);')
patch('internal/user.js','return userModel.query().patchAndFetchById(user.id, data).then(utils.omitRow(omissions()));','''if (user.roles?.includes("admin") && (data.is_disabled || data.roles && !data.roles.includes("admin"))) {
                  return userModel.query().where("is_deleted",0).where("is_disabled",0).whereNot("id",user.id)
                    .select("id","roles").then(others=>{
                      if (!others.some(other=>other.roles?.includes("admin") && !other.roles?.includes("nyxagent"))) throw new errs.ValidationError("At least one enabled Administrator must remain");
                      return userModel.query().patchAndFetchById(user.id,data).then(utils.omitRow(omissions()));
                    });
                }
                return userModel.query().patchAndFetchById(user.id, data).then(utils.omitRow(omissions()));''')

# Auth-row IDs and user IDs have independent sequences.
patch('internal/user.js','user = await authModel.query().insert({','await authModel.query().insert({')

patch('routes/nyxguard/settings.js','if (typeof data.wafEnabled !== "boolean") throw new errs.ValidationError("wafEnabled must be a boolean");','await res.locals.access.can("nyxguard:update");\n            if (typeof data.wafEnabled !== "boolean") throw new errs.ValidationError("wafEnabled must be a boolean");')

patch('lib/access.js','logger.error(permission, data, err.message);','logger.error(permission, monitoring ? undefined : data, err.message);')

patch('internal/user.js','throw new errs.ValidationError("Administrator and NyxAgent roles are mutually exclusive");','throw Object.assign(new errs.ValidationError("Administrator and NyxAgent roles are mutually exclusive"), {message_i18n:"nyxagent.roles-exclusive"});',2)
patch('internal/user.js','throw new errs.ValidationError("At least one enabled Administrator must remain");','throw Object.assign(new errs.ValidationError("At least one enabled Administrator must remain"), {message_i18n:"nyxagent.last-administrator"});')
patch('app.js','if(event){payload.error.diagnostic_id=','''if (err.public && ["nyxagent.roles-exclusive","nyxagent.last-administrator"].includes(err.message_i18n)) payload.error.message_i18n=err.message_i18n;
 if(event){payload.error.diagnostic_id=''')

# Public SSO metadata is a monitoring read, not an authentication attempt.
patch('routes/main.js','router.use("/auth/sso", authLimiter, ssoRoutes);','router.use("/auth/sso", (req,res,next)=>req.method==="GET" && req.path==="/config" ? next() : authLimiter(req,res,next), ssoRoutes);')

# Addendum: clearing audit history belongs to its own existing permission group.
patch('lib/access.js','"auditlog:list": auditlogList,','"auditlog:list": auditlogList,\n"auditlog:manage": {anyOf:[{$ref:"roles#/definitions/admin"},{type:"object",required:["permission_auditlog"],properties:{permission_auditlog:{$ref:"perms#/definitions/manage"}}}]},')
patch('routes/event-center.js',"await res.locals.access.can('settings:update','default-site');", "await res.locals.access.can('auditlog:manage');")
# Users management cannot assign roles or create privileged accounts without admin authority.
patch('internal/user.js','data.roles = data.roles || [];','data.roles = data.roles || [];\nif(data.roles.some(role=>role!=="user")) await access.can("users:permissions",data.id);')

# Permission rows have independent IDs, just like auth rows.
patch('internal/user.js','_.assign({ user_id: user.id }, data)','_.assign({ user_id: user.id }, _.omit(data,["id"]))',2)

# Own profile updates contain personal fields only, regardless of stored module manage values.
patch('internal/user.js','update: async (access, data) => {','update: async (access, data) => {\nconst actor=await userModel.query().where("id",access.token.getUserId(0)).first();\nconst privileged=actor?.roles?.includes("admin")&&!actor?.roles?.includes("nyxagent");\nif(!privileged && Number(data.id)===access.token.getUserId(0) && Object.keys(data).some(key=>!["id","name","nickname","email"].includes(key)))throw new errs.PermissionError("Permission Denied");\n')

# A delegated Users manager cannot alter privileged accounts.

patch('lib/access.js','const objectSchema = await this.getObjectSchema(permission);','if(permission.startsWith("users:") && !READ_PERMISSIONS.has(permission) && !userRoles.includes("admin") && Number(data)>0){\n  const target=await userModel.query().findById(Number(data));\n  if(target?.roles?.includes("admin")&&!target.roles.includes("nyxagent"))throw new errs.PermissionError("Permission Denied");\n}\nconst objectSchema = await this.getObjectSchema(permission);')

patch('internal/user.js','// Get perms row, patch if it exists','if(user.roles?.includes("nyxagent") && (data.visibility && data.visibility!=="all" || ["proxy_hosts","access_lists","certificates","nyxguard","web_controls","users","auditlog","settings"].some(key=>data[key] && data[key]!=="view")))throw Object.assign(new errs.ValidationError("NyxAgent requires View Only for every active module"),{message_i18n:"nyxagent.monitoring-permissions"});\n// Get perms row, patch if it exists')
patch('app.js','"nyxagent.last-administrator"].includes(err.message_i18n)','"nyxagent.last-administrator","nyxagent.monitoring-permissions"].includes(err.message_i18n)')

# Preserve masked configuration on authorized updates instead of storing placeholders.
patch('internal/proxy-host.js','update: (access, data) => {\n\t\tlet thisData = data;', 'update: (access, data, {systemDefaults=false}={}) => {\n\t\tlet thisData = {...data};\nif(thisData.advanced_config==="[REDACTED]")delete thisData.advanced_config;')
patch('internal/access-list.js','if (item.password) {','if(item.password==="[REDACTED]")item.password="";\n\t\t\t\tif (item.password) {')
patch('internal/notifications.js','let config = parseConfig(data.config !== undefined ? data.config : existing.config);','let config = parseConfig(data.config !== undefined ? data.config : existing.config);\nconst rawConfig= parseConfig((await knex("notification_channel").where({id}).first())?.config_json);\nconst preserve=(next,previous)=>next==="[REDACTED]"?previous:Array.isArray(next)?next.map((value,index)=>preserve(value,previous?.[index])):next&&typeof next==="object"?Object.fromEntries(Object.entries(next).map(([key,value])=>[key,preserve(value,previous?.[key])])):next;\nconfig=preserve(config,rawConfig);')

# Proxy CRUD cannot be used to bypass the separate security capability.
patch('internal/proxy-host.js','\t\t\t\t\t\t\tnyxguardAuthBypassEnabled: authBypass,\n\t\t\t\t\t\t},\n\t\t\t\t\t})','\t\t\t\t\t\t\tnyxguardAuthBypassEnabled: authBypass,\n\t\t\t\t\t\t},\n\t\t\t\t\t},{systemDefaults:true})')
patch('internal/proxy-host.js','// At this point the domains should have been checked','if(thisData.advanced_config || thisData.locations?.some(location=>Boolean(location.advanced_config)) || nyxguardMetaBool(thisData.meta||{},"nyxguardAuthBypassEnabled","nyxguard_auth_bypass_enabled")) await access.can("nyxguard:update");\n// At this point the domains should have been checked')
# The preceding create callback needs async for its pre-insert authorization.
patch('internal/proxy-host.js','.then(() => {\n\t\t\t\tif(thisData.advanced_config', '.then(async () => {\n\t\t\t\tif(thisData.advanced_config')
patch('internal/proxy-host.js','// If NyxGuard toggles are present, apply them to advanced_config.','if(!systemDefaults && typeof thisData.advanced_config==="string" && thisData.advanced_config!==row.advanced_config) await access.can("nyxguard:update");\nif(Array.isArray(thisData.locations)){\n  const previous=new Map((row.locations||[]).map(location=>[location.path,location]));\n  for(const location of thisData.locations){\n    const prior=previous.get(location.path);\n    if(location.advanced_config==="[REDACTED]")location.advanced_config=prior?.advanced_config||"";\n    else if(location.advanced_config && location.advanced_config!==prior?.advanced_config && !systemDefaults)await access.can("nyxguard:update");\n    validateAdvancedConfig(location.advanced_config);\n  }\n}\n// If NyxGuard toggles are present, apply them to advanced_config.')
patch('internal/proxy-host.js','const baseAdvanced =\n\t\t\t\t\t\ttypeof thisData.advanced_config', 'if(!systemDefaults && (wafNext!==!!prevWaf || botNext!==!!prevBot || ddosNext!==!!prevDdos || sqliNext!==!!prevSqli || authBypassNext!==!!prevAuthBypass))await access.can("nyxguard:update");\nconst baseAdvanced =\n\t\t\t\t\t\ttypeof thisData.advanced_config')

# Authorization precedes quick-certificate provisioning and all create side effects.
patch('internal/proxy-host.js','create: (access, data) => {','create: async (access, data) => {\nawait access.can("proxy_hosts:create",data);\nif(data.advanced_config || data.locations?.some(location=>Boolean(location.advanced_config)) || nyxguardMetaBool(data.meta||{},"nyxguardAuthBypassEnabled","nyxguard_auth_bypass_enabled"))await access.can("nyxguard:update");')

# Administrator effective access is independent of stored module/visibility presets.
patch('lib/access.js','permission_visibility: permissions.visibility,','permission_visibility: userRoles.includes("admin")?"all":permissions.visibility,')
patch('lib/access.js','permission_proxy_hosts: permissions.proxy_hosts,','permission_proxy_hosts: userRoles.includes("admin")?"manage":permissions.proxy_hosts,')
patch('lib/access.js','permission_redirection_hosts: permissions.redirection_hosts,','permission_redirection_hosts: userRoles.includes("admin")?"manage":permissions.redirection_hosts,')
patch('lib/access.js','permission_dead_hosts: permissions.dead_hosts,','permission_dead_hosts: userRoles.includes("admin")?"manage":permissions.dead_hosts,')
patch('lib/access.js','permission_streams: permissions.streams,','permission_streams: userRoles.includes("admin")?"manage":permissions.streams,')
patch('lib/access.js','permission_access_lists: permissions.access_lists,','permission_access_lists: userRoles.includes("admin")?"manage":permissions.access_lists,')
patch('lib/access.js','permission_certificates: permissions.certificates,','permission_certificates: userRoles.includes("admin")?"manage":permissions.certificates,')
patch('lib/access.js','permission_users: permissions.users,','permission_users: userRoles.includes("admin")?"manage":permissions.users,')
patch('lib/access.js','permission_auditlog: permissions.auditlog,','permission_auditlog: userRoles.includes("admin")?"manage":permissions.auditlog,')
patch('lib/access.js','permission_settings: permissions.settings,','permission_settings: userRoles.includes("admin")?"manage":permissions.settings,')
patch('lib/access.js','permission_nyxguard: permissions.nyxguard ?? permissions.proxy_hosts,','permission_nyxguard: userRoles.includes("admin")?"manage":(permissions.nyxguard||"hidden"),')
patch('lib/access.js','permission_web_controls: permissions.web_controls ?? permissions.settings,','permission_web_controls: userRoles.includes("admin")?"manage":(permissions.web_controls||"hidden"),')

# These existing handlers update proxy-backed protection; check both capabilities
# before settings, files or per-host state can be changed.
p=root/'routes/nyxguard/settings.js';s=p.read_text();needle='await res.locals.access.can("nyxguard:update");';assert s.count(needle)==6,s.count(needle);s=s.replace(needle,needle+'\nawait res.locals.access.can("proxy_hosts:manage");');p.write_text(s)

patch('internal/user.js','import crypto from "node:crypto";','import {isMonitoring} from "./monitoring-policy.mjs";\nimport crypto from "node:crypto";')
patch('internal/user.js','const res = await query;\n\t\treturn utils.omitRows(omissions())(res);','const res = await query;\nconst permissionRows=res.length?await userPermissionModel.query().whereIn("user_id",res.map(user=>user.id)):[];\nconst byUser=new Map(permissionRows.map(permission=>[permission.user_id,permission]));\nreturn utils.omitRows(omissions())(res).map(user=>({...user,monitoring_only:isMonitoring({...user,permissions:user.permissions||byUser.get(user.id)})}));')

# Listing settings is a view capability; safe serialization applies to every
# non-administrator at the common response boundary.
(root/'lib/access/settings-list.json').write_text((root/'lib/access/settings-get.json').read_text())

# Security app status has its own read permission and retains existing ownership scope.
patch('internal/proxy-host.js','getAll: async (access, expand, searchQuery) => {\n\t\tconst accessData = await access.can("proxy_hosts:list");','getAll: async (access, expand, searchQuery, {securityView=false}={}) => {\n\t\tconst accessData = await access.can(securityView?"nyxguard:list":"proxy_hosts:list");')
p=root/'routes/nyxguard/attack-log.js';s=p.read_text();i=s.index('.route("/apps")');j=s.index('.route("/apps/summary")',i);part=s[i:j];old='internalProxyHost.getAll(res.locals.access, null, null)';assert part.count(old)==1;p.write_text(s[:i]+part.replace(old,'internalProxyHost.getAll(res.locals.access, null, null, {securityView:true})')+s[j:])
