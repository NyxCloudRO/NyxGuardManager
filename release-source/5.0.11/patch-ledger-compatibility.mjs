import fs from 'node:fs';
const root=process.argv[2]||'/app';
const file=root+'/internal/handover-transaction.mjs';
const before="['5.0.4','5.0.5','5.0.6','5.0.7','5.0.8',policy.version]";
const after="['5.0.4','5.0.5','5.0.6','5.0.7','5.0.8','5.0.9','5.0.10',policy.version]";
const source=fs.readFileSync(file,'utf8');
if(source.split(before).length!==2)throw new Error('Certified historical ledger compatibility marker differs');
fs.writeFileSync(file,source.replace(before,after));
