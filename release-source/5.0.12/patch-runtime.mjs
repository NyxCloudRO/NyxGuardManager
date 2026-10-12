import fs from 'node:fs';
const root=process.argv[2]||'/app';
function patch(file,old,replacement){
 const path=root+'/'+file,source=fs.readFileSync(path,'utf8');
 if(source.split(old).length!==2)throw Error('Expected qualified marker differs: '+file);
 fs.writeFileSync(path,source.replace(old,replacement));
}
patch('internal/certificate.js','import operationalDb',"import {validateCertificateDomains} from './certificate-domains.mjs';\nimport operationalDb");
patch('internal/certificate.js','data.nice_name = data.domain_names.join(", ");','validateCertificateDomains(data.domain_names);\n            data.nice_name = data.domain_names.join(", ");');
patch('routes/professional-support.js','import express from "express";',`import {licensingError,safeLicensingFailure} from '../internal/nyxcloud-licensing/errors.mjs';
import express from "express";`);
patch('routes/professional-support.js','catch (err) { const event=await recordFailure', 'catch (error) { const err=safeLicensingFailure(error); const event=await recordFailure');
patch('routes/professional-support.js','\tconst key = await loadVaultKey(process.env.NYXCLOUD_LICENSE_VAULT_KEY_PATH);\n\tconst store = new SqlStore(db(), key);', 'let key; try { key = await loadVaultKey(process.env.NYXCLOUD_LICENSE_VAULT_KEY_PATH); } catch { throw licensingError("vault_key_unavailable"); }\n\tconst store = new SqlStore(db(), key);');
patch('routes/professional-support.js','{ state: "NOT_CONFIGURED", enabled: false };','{ state: "NOT_CONFIGURED", enabled: false, authority:{configured:false,state:"NOT_CONFIGURED"} };');
const path=root+'/routes/professional-support.js';
let source=fs.readFileSync(path,'utf8');
const missing='const c = await client(); if (!c) return res.status(503).json({ category: "support_not_configured" });';
if(source.split(missing).length!==8)throw Error('Licensing operation markers differ');
source=source.replaceAll(missing,'const c = await client(); if (!c) throw licensingError("endpoint_unavailable");');
// Periodic refresh failures use the same sanitized operational record as actions.
source=source.replace('} catch {}\n}, 15 * 60 * 1000);','} catch (error) { await recordFailure(db(),safeLicensingFailure(error),{component:"Licensing / Support",operation:"Scheduled entitlement refresh"}); }\n}, 15 * 60 * 1000);');
fs.writeFileSync(path,source);
patch('frontend/assets/professional-support.js','field(grid, "Authority", status.state === "AUTHORITY_UNAVAILABLE" || status.state === "OFFLINE_GRACE" ? "Unavailable" : status.state === "REFRESH_REQUIRED" ? "Refresh required" : status.state === "NOT_CONFIGURED" ? "Not configured" : "Available");',`var authority = status.authority;
    field(grid, "Authority", authority ? !authority.configured ? "Not configured" : authority.state === "UNAVAILABLE" ? "Unavailable" : authority.state === "REACHABLE" ? "Reachable" : "Configured · not checked" : "Status unavailable");`);
patch('internal/certificate.js','const result = await runCertbot(utils.execFile, certbotCommand, args, adds.opts);\n\t\t\tlogger.info(result);\n\t\t\treturn result;\n\t\t} catch (err) {\n\t\t\t// Don\'t fail if file does not exist, so no need for action in the callback\n\t\t\tfs.unlink(credentialsLocation, () => {});', 'const result = await runCertbot(utils.execFile, certbotCommand, args, adds.opts, {domains:certificate.domain_names});\n\t\t\tlogger.info(result);\n\t\t\treturn result;\n\t\t} catch (err) {\n            await fs.promises.rm(credentialsLocation,{force:true});');
console.log('Unreleased DEV licensing and certificate diagnostic patch applied');
// DNS names can be 253 bytes. Host protection maps must support the same
// valid names as server_name, rather than failing at Nginx's 64-byte default.
patch('../etc/nginx/nginx.conf','server_names_hash_bucket_size 1024;', 'server_names_hash_bucket_size 1024;\n\tmap_hash_bucket_size 512;');
