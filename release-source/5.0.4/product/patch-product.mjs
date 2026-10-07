import fs from 'node:fs';import path from 'node:path';
const root=process.argv[2];
function patch(file,from,to,count=1){const p=path.join(root,file),s=fs.readFileSync(p,'utf8');if(s.split(from).length-1!==count)throw new Error('Product prerequisite mismatch: '+file+' '+from.slice(0,70));fs.writeFileSync(p,s.replaceAll(from,to));}
const support='frontend/assets/professional-support.js';
patch(support,'(function () {\n  "use strict";',"import {mountAppPage} from './AppPage-CHaZeb42.js';\n(function () {\n  \"use strict\";");
patch(support,'page = element("div", "nyx-support-page");', 'var canonical = mountAppPage(mainNode, {framed:true,bounded:true});\n    page = canonical.shell; page.classList.add("nyx-support-page");');
patch(support,'mainNode.append(page);','');
// Settings and Event Center place their content inside this existing shared card.
// Keep its established theme, border, padding and shadow; the outer AppPage owns scrolling.
patch(support,'if (next === "license") licenseContent(page);\n    else supportContent(page, next.split(":")[1]);','var surface = element("section", "_card_1gz5u_1");\n    canonical.content.append(surface);\n    if (next === "license") licenseContent(surface);\n    else supportContent(surface, next.split(":")[1]);');
patch('frontend/index.html','<script defer src="/assets/professional-support.js','<script type="module" src="/assets/professional-support.js');
patch('frontend/assets/application-shell.js',"const support = main.querySelector(':scope > .nyx-support-page');","const support = main.querySelector(':scope > .nyx-support-page > .app-page-container');");
patch('frontend/assets/professional-support.css','.nyx-support-page{box-sizing:border-box;width:100%;height:100%;min-height:0;overflow-x:hidden;overflow-y:auto;overscroll-behavior:contain;padding:clamp(20px,2.1vw,30px);color:var(--app-text-primary,#eaf5ff);font:inherit}', '.nyx-support-page{box-sizing:border-box;width:100%;height:100%;min-height:0;color:var(--app-text-primary,#eaf5ff);font:inherit}\n.nyx-support-page>.app-page-container{position:relative}\n.nyx-support-page>.app-page-container>*{position:relative;z-index:1}\n.nyx-support-page-content{max-width:none!important}');
patch('frontend/assets/application-shell.css','html[data-app-theme] .nyx-dashboard-viewport.nyx-support-main-active>.nyx-support-page{height:100%;min-height:0;max-width:1440px;margin-inline:auto}', 'html[data-app-theme] .nyx-dashboard-viewport.nyx-support-main-active>.nyx-support-page{height:100%;min-height:0;max-width:none}');
patch('internal/nyxguard/rules.js','import {expireSecurityState}', 'import {assertRuleUpdate} from "../rule-state.mjs";\nimport {expireSecurityState}');
patch('internal/nyxguard/rules.js','const patch = {rule_origin: "manual"};','const existing = await db("nyxguard_ip_rule").where({id}).first();\n\t\tif (!existing) throw new Error("Rule no longer exists");\n\t\tassertRuleUpdate(existing,data);\n\t\tconst patch = {rule_origin: "manual"};');
patch('routes/nyxguard/rules.js','import fs from "node:fs/promises";', 'import {ruleState} from "../../internal/rule-state.mjs";\nimport fs from "node:fs/promises";');
patch('routes/nyxguard/rules.js','return rows.map((r) => ({ id: r.id, enabled: !!r.enabled, action: r.action,','return rows.map((r) => ({ id: r.id, ...ruleState(r), action: r.action,');
const rules='frontend/assets/index-DHuZiE1T-task2.js';
patch(rules,'type:"checkbox",checked:t.enabled,onChange:l=>ae.mutate', 'type:"checkbox",checked:t.enabled&&!t.expired&&!Boolean(t.expiresOn&&Date.parse(t.expiresOn)<=Date.now()),disabled:t.expired||Boolean(t.expiresOn&&Date.parse(t.expiresOn)<=Date.now()),title:t.expired||Boolean(t.expiresOn&&Date.parse(t.expiresOn)<=Date.now())?"Expired — renew a manual rule or wait for fresh crawler verification":"Enable or disable this active rule",onChange:l=>ae.mutate');
patch(rules,'className:r.ghost,onClick:()=>{setEditing({id:t.id,type:"ip"})','className:r.ghost,disabled:Boolean((t.expired||Boolean(t.expiresOn&&Date.parse(t.expiresOn)<=Date.now()))&&t.ruleOrigin==="verified_crawler"),title:(t.expired||Boolean(t.expiresOn&&Date.parse(t.expiresOn)<=Date.now()))&&t.ruleOrigin==="verified_crawler"?"Expired crawler verification cannot be renewed manually":"Edit rule",onClick:()=>{setEditing({id:t.id,type:"ip"})');

const shellCss=path.join(root,'frontend/assets/application-shell.css');
fs.appendFileSync(shellCss, '\nhtml[data-app-theme] .app-page-shell.app-page-shell-bounded{height:100%;min-height:0;overflow:hidden!important}\nhtml[data-app-theme] .app-page-shell.app-page-shell-bounded>.app-page-container{height:100%!important;min-height:0;box-sizing:border-box}\n@media(min-width:768px){html[data-app-theme] .app-page-shell.app-page-shell-bounded{padding-bottom:0}}\n');

patch('frontend/assets/professional-support.css','.nyx-support-page{padding:24px}','');
patch('frontend/assets/professional-support.css','.nyx-support-page{padding:16px}','');
// Release display metadata only; keep the existing theme serialization marker.
patch('frontend/assets/index-CTHAIRmi-409dev-4012certfix4-threatpagination3.js','Coe="5.0.3"','Coe="5.0.4"');
patch('frontend/assets/index-DTnhxNQ_.js','K="5.0.3",Bt=','K="5.0.4",Bt=');
patch('frontend/assets/index-DJfFx4nu.js',"'Version 5.0.3'","'Version 5.0.4'");
patch('frontend/assets/notification-visibility-4010.js','var desiredVersion = "5.0.3";','var desiredVersion = "5.0.4";');
