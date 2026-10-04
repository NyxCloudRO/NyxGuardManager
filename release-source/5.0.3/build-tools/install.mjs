// Build-time parsers only. Pinned upstream archives are integrity-checked;
// no dependency lifecycle scripts run and these tools are removed from the image.
import fs from 'node:fs/promises';import path from 'node:path';import crypto from 'node:crypto';import {execFileSync} from 'node:child_process';
const target=process.argv[2];if(!target?.startsWith('/tmp/'))throw Error('Build tools must use temporary storage');
const locked=JSON.parse(await fs.readFile(new URL('./registry-lock.json',import.meta.url),'utf8'));
await fs.mkdir(target,{recursive:true});await fs.writeFile(path.join(target,'package.json'),'{}');
for(const item of locked){
 if(!/^[a-z][a-z0-9-]*$/.test(item.name)||new URL(item.url).hostname!=='registry.npmjs.org')throw Error('Invalid build lock');
 const response=await fetch(item.url);if(!response.ok)throw Error('Build dependency fetch failed: '+item.name);const bytes=Buffer.from(await response.arrayBuffer());if(bytes.length>5*1024*1024)throw Error('Unexpected build archive size');
 const [algorithm,expected]=item.integrity.split('-');if(algorithm!=='sha512'||crypto.createHash(algorithm).update(bytes).digest('base64')!==expected)throw Error('Build dependency integrity mismatch: '+item.name);
 const archive=path.join(target,item.name+'.tgz'),directory=path.join(target,'node_modules',item.name);await fs.writeFile(archive,bytes);await fs.mkdir(directory,{recursive:true});execFileSync('tar',['-xzf',archive,'-C',directory,'--strip-components=1']);await fs.unlink(archive);
}
