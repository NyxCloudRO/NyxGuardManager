import fs from 'node:fs';
import path from 'node:path';
const root=process.argv[2];
if(!root)throw new Error('Application root required');
function patch(file,before,after) {
  const target=path.join(root,file),source=fs.readFileSync(target,'utf8');
  if(source.split(before).length!==2)throw new Error(`Unexpected safety patch prerequisite: ${file}`);
  fs.writeFileSync(target,source.replace(before,after));
}
patch('setup.js','export default () => setupDefaultUser().then(setupDefaultSettings).then(setupCertbotPlugins).then(setupLogrotation);',
  'export const setupExternal = setupCertbotPlugins;\nexport default () => setupDefaultUser().then(setupDefaultSettings).then(setupLogrotation);');
patch('setup.js','await utils.exec("logrotate /etc/logrotate.d/nyxguard-manager")',
  'await execBounded("logrotate /etc/logrotate.d/nyxguard-manager", {timeoutMs: 10000})');
patch('setup.js','import fs from "fs";','import fs from "fs";\nimport {execBounded} from "./internal/bounded-process.mjs";');
patch('lib/certbot.js','import batchflow from "batchflow";',
  'import batchflow from "batchflow";\nimport {execBounded} from "../internal/bounded-process.mjs";');
patch('lib/certbot.js','await utils.exec(checkCmd)','await execBounded(checkCmd,{timeoutMs:10000})');
patch('lib/certbot.js','utils\n\t\t.exec(cmd, { env })',
  '({exec: command => execBounded(command,{timeoutMs:120000,env:{...env,PIP_DEFAULT_TIMEOUT:"5",PIP_RETRIES:"0"}})})\n\t\t.exec(cmd)');
patch('app.js','const app = express();','const app = express();\nregisterReadiness(app);');
patch('app.js','import bodyParser from "body-parser";',
  'import bodyParser from "body-parser";\nimport {registerReadiness} from "./internal/readiness.mjs";');
patch('index.js','import setup from "./setup.js";',
  'import setup, {setupExternal} from "./setup.js";\nimport {markInitialized} from "./internal/readiness.mjs";\nimport {policy} from "./internal/readiness-policy.mjs";\nconst startupDeadline=setTimeout(()=>{logger.fatal("Local initialization deadline exceeded");process.exit(1);},policy.startupDeadlineMs);');
patch('index.js','const server = app.listen(3000, () => {',
  'const server = app.listen(3000, () => {\n\t\t\t\tclearTimeout(startupDeadline);markInitialized();\n\t\t\t\tvoid setupExternal().catch(err=>logger.warn("Optional certificate plugin initialization failed:",err.message));');
patch('internal/trusted-ips.js','import https from "node:https";',
  'import https from "node:https";\nimport {fetchText} from "./bounded-https.mjs";');
const trusted=path.join(root,'internal/trusted-ips.js');let text=fs.readFileSync(trusted,'utf8');
const start=text.indexOf('function requestPublicIp(url) {'),end=text.indexOf('\nasync function detectPublicIps()',start);
if(start<0||end<start)throw new Error('Trusted-IP fetch prerequisite missing');
text=text.slice(0,start)+`function requestPublicIp(url) {
  return fetchText(url,{agent:new https.Agent(),policy:{connectMs:1500,totalMs:2000,maxBytes:256}})
    .then(normalizeIp).catch(()=>null);
}
`+text.slice(end);fs.writeFileSync(trusted,text);
patch('internal/trusted-ips.js','for (const ip of await detectPublicIps()) merged.add(ip);',
  'void detectPublicIps().then(ips=>{for(const ip of ips)merged.add(ip);cached.values=[...merged];}).catch(()=>{});');
// Nginx configuration tests/reloads invoked before listener readiness are local
// commands with explicit deadlines. Other certificate operations keep their
// existing domain-specific behavior.
const nginx=path.join(root,'internal/nginx.js');let ngx=fs.readFileSync(nginx,'utf8');
ngx=ngx.replace(/utils\.exec\("nginx -t"\)/g,'utils.exec("nginx -t",{timeout:10000})')
  .replace(/utils\.exec\("nginx -s reload"\)/g,'utils.exec("nginx -s reload",{timeout:10000})')
  .replace('utils.execFile("/usr/sbin/nginx", ["-t", "-g", "error_log off;"])','utils.execFile("/usr/sbin/nginx", ["-t", "-g", "error_log off;"], {timeout:10000})')
  .replace('utils.execFile("/usr/sbin/nginx", ["-s", "reload"])','utils.execFile("/usr/sbin/nginx", ["-s", "reload"], {timeout:10000})');
fs.writeFileSync(nginx,ngx);
const packageFile=path.join(root,'package.json');const json=JSON.parse(fs.readFileSync(packageFile,'utf8'));json.version='5.0.4';fs.writeFileSync(packageFile,JSON.stringify(json,null,2)+'\n');
