import fs from 'node:fs';
const root=process.argv[2]||'/app';
const policy=JSON.parse(fs.readFileSync(root+'/internal/release-policy.json','utf8'));
if(policy.version!=='5.0.10'||policy.sources['5.0.9']!==45)throw Error('Release policy differs');
// Application containers no longer create privileged upgrade helpers. Discovery
// remains available; installation and recovery are owned by the host command.
const file=root+'/internal/update-manager.js';
let code=fs.readFileSync(file,'utf8');
for(const method of ['applyPendingUpdate','startDownloadJob']) {
 const pattern=new RegExp('(async '+method+'\\([^\\n]*\\) \\{)');
 if(!pattern.test(code))throw Error('Published updater method missing: '+method);
 code=code.replace(pattern,'$1\n\t\tthrow new Error("Run the supported host updater as root: curl -fsSL https://raw.githubusercontent.com/NyxCloudRO/NyxGuardManager/main/update.sh | bash");');
}
fs.writeFileSync(file,code);
