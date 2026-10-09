import fs from 'node:fs';
const root=process.argv[2]||'/app';
const file=root+'/package.json';const s=fs.readFileSync(file,'utf8');const p=JSON.parse(s);
if(p.version!=='5.0.7')throw new Error('Certified base package version differs');
const changed=s.replace(/("version"\s*:\s*")5\.0\.7(")/,'$15.0.8$2');
if(JSON.parse(changed).version!=='5.0.8')throw new Error('Release package version patch failed');
fs.writeFileSync(file,changed);
for(const name of ['index-DJfFx4nu.js','index-DTnhxNQ_.js','notification-visibility-4010.js','index-CTHAIRmi-409dev-4012certfix4-threatpagination3.js']) {
 const path=root+'/frontend/assets/'+name;const old=fs.readFileSync(path,'utf8');
 if(old.split('5.0.7').length!==2)throw new Error('Certified UI version marker differs: '+name);
 fs.writeFileSync(path,old.replace('5.0.7','5.0.8'));
}
