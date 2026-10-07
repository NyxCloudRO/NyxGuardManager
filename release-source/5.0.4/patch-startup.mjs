import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const root = process.argv[2];
if (!root) throw new Error('Application root required');
const inputs = {
  'index.js': 'a132ab300fd14b69988a0f64dfc4c5c18cd2aa083a28b64a54712a253a697c81',
  'internal/ip_ranges.js': '1bc84d343ca08c763c8c0a0a6f115c59eda0de23ddcb4d1273d595b0b9b3cf81',
};
const sources = {};
for (const [file, expected] of Object.entries(inputs)) {
  const data = fs.readFileSync(path.join(root, file));
  if (crypto.createHash('sha256').update(data).digest('hex') !== expected)
    throw new Error(`Unexpected public startup prerequisite: ${file}`);
  sources[file] = data.toString('utf8');
}

let ranges = sources['internal/ip_ranges.js'];
ranges = ranges.replace('import https from "node:https";', 'import { fetchText } from "./bounded-https.mjs";');
const start = ranges.indexOf('\tfetchUrl: (url) => {');
const end = ranges.indexOf('\n\t/**', start);
if (start < 0 || end < start) throw new Error('IP range fetch boundary missing');
ranges = ranges.slice(0, start) +
  '\tfetchUrl: (url) => fetchText(url, { agentFactory: signal => new ProxyAgent({ signal }) }),\n\n' +
  '\tprepareOffline: () => internalIpRanges.generateConfig(CLOUDFLARE_FALLBACK_RANGES),\n' + ranges.slice(end);
// Honor the documented setting for subsequent refreshes as well.
ranges = ranges.replace('\tinitTimer: () => {', '\tinitTimer: () => {\n\t\tif (process.env.IP_RANGES_FETCH_ENABLED === "false") return;');

let index = sources['index.js'];
const oldFetch = 'return internalIpRanges.fetch().catch((err) => {\n\t\t\t\tlogger.error("IP Ranges fetch failed, continuing anyway:", err.message);\n\t\t\t});';
if (!index.includes(oldFetch)) throw new Error('Startup fetch missing');
// Install safe trusted-proxy defaults before listening; fetching online ranges
// is optional and starts only after the server has opened its socket.
index = index.replace(oldFetch, 'return internalIpRanges.prepareOffline();');
const listen = 'const server = app.listen(3000, () => {';
index = index.replace(listen, listen + '\n\t\t\t\tif (IP_RANGES_FETCH_ENABLED) {\n\t\t\t\t\tvoid internalIpRanges.fetch().catch(err => logger.warn("IP range refresh failed:", err.message));\n\t\t\t\t}');

fs.writeFileSync(path.join(root, 'internal/ip_ranges.js'), ranges);
fs.writeFileSync(path.join(root, 'index.js'), index);
