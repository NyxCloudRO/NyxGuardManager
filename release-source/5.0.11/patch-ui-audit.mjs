import fs from 'node:fs';
const root = process.argv[2] || '/app';
const file = root + '/frontend/index.html';
let html = fs.readFileSync(file, 'utf8');
const tag = '<link rel="stylesheet" href="/assets/dashboard-alignment.css?v=5.0.11">';
if (!html.includes('/assets/dashboard-alignment.css')) {
  if (!html.includes('</head>')) throw Error('Frontend head missing');
  html = html.replace('</head>', tag + '\n</head>');
  fs.writeFileSync(file, html);
}
for (const name of ['frontend/assets/dashboard-alignment.css', 'internal/admin-audit.js']) {
  if (!fs.statSync(root + '/' + name).isFile()) throw Error('UI/audit patch file missing: ' + name);
}
