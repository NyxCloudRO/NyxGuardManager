import fs from 'node:fs';
const root=process.argv[2]||'/app';const file=root+'/internal/certificate.js';
let source=fs.readFileSync(file,'utf8');
const calls='await utils.execFile(certbotCommand, args, adds.opts)';
if(source.split(calls).length!==6)throw new Error('Certified certificate subprocess markers differ');
source="import {runCertbot,certificateOperation} from './certificate-errors.mjs';\n"+source;
source=source.replaceAll(calls,'await runCertbot(utils.execFile, certbotCommand, args, adds.opts)');
const plugin='await installPlugin(certificate.meta.dns_provider);';
if(source.split(plugin).length!==2)throw new Error('Certified DNS plugin marker differs');
source=source.replace(plugin,"await certificateOperation(()=>installPlugin(certificate.meta.dns_provider), {phase:'plugin'});");

const customLog='logger.info("Writing Custom Certificate:", certificate);';
if(source.split(customLog).length!==2)throw new Error('Certified custom certificate log marker differs');
source=source.replace(customLog, 'logger.info("Writing custom certificate material (content omitted)");');
const uploadResponse='return _.pick(row.meta, internalCertificate.allowedSslFiles);';
if(source.split(uploadResponse).length!==2)throw new Error('Certified certificate upload response marker differs');
source=source.replace(uploadResponse,'return internalCertificate.cleanMeta(_.pick(row.meta, internalCertificate.allowedSslFiles));');
fs.writeFileSync(file,source);
