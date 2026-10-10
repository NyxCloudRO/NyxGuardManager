import fs from 'node:fs';
const root=process.argv[2]||'/app';
const policy=JSON.parse(fs.readFileSync(root+'/internal/release-policy.json','utf8'));
if(policy.version!=='5.0.11'||policy.sources['5.0.10']!==45)throw Error('Release policy differs');
for(const file of ['migrate.js','internal/observed-migrations.mjs','internal/startup-progress.mjs']) {
 if(!fs.statSync(root+'/'+file).isFile())throw Error('Migration observability source missing');
}
