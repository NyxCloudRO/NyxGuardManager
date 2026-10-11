import fs from 'node:fs';
const root = process.argv[2] || '/app';
const file = root + '/internal/nginx.js';
let source = fs.readFileSync(file, 'utf8');
const marker = 'return utils.execFile("/usr/sbin/nginx", ["-s", "reload"], {timeout:10000});';
if (source.split(marker).length !== 2) throw new Error('Certified Nginx reload marker differs');
source = "import {acknowledgedReload} from './nginx-reload.mjs';\n" + source.replace(marker, 'return acknowledgedReload(() => utils.execFile("/usr/sbin/nginx", ["-s", "reload"], {timeout:10000}));');
const metaMarker = 'let combined_meta = {};';
const failureMarker = 'debug(logger, "Nginx test failed:", valid_lines.join("\\n"));';
const returnMarker = 'return combined_meta;';
for (const text of [metaMarker, failureMarker, returnMarker]) {
  if (source.split(text).length !== 2) throw new Error('Certified Nginx configure marker differs');
}
source = source.replace(metaMarker, metaMarker + '\n\t\tlet configurationError;');
source = source.replace(failureMarker, `configurationError = new Error("Nginx configuration validation failed; the host configuration was removed. Review the host configuration in Diagnostics & Support.");
                        configurationError.code = "NGINX_CONFIGURATION_FAILED";
                        configurationError.outcome = "partially_completed";`);
// Preserve existing removal, metadata persistence and reload before rejecting.
source = source.replace(returnMarker, 'if (configurationError) throw configurationError;\n\t\t\t\t' + returnMarker);
fs.writeFileSync(file, source);
