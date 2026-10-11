import fs from 'node:fs';
const root=process.argv[2]||'/app';
const policy=JSON.parse(fs.readFileSync(root+'/internal/release-policy.json','utf8'));
if(policy.version!=='5.0.11'||policy.schema!==46||policy.sources['5.0.10']!==45)throw Error('Release policy differs');
const probe=root+'/internal/readiness-probe.mjs';
const before=fs.readFileSync(probe,'utf8');
if(before.split('body.schema!==45').length!==2)throw Error('Certified readiness schema marker differs');
fs.writeFileSync(probe,"import releasePolicy from './release-policy.mjs';\n"+before.replace('body.schema!==45','body.schema!==releasePolicy.schema'));
for(const file of ['migrate.js','internal/observed-migrations.mjs','internal/startup-progress.mjs']) {
 if(!fs.statSync(root+'/'+file).isFile())throw Error('Migration observability source missing');
}
