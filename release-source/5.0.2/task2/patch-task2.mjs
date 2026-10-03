import fs from 'node:fs';import path from 'node:path';
const root=process.argv[2];
function patch(name,from,to,count=1){const p=path.join(root,name),s=fs.readFileSync(p,'utf8');if(s.split(from).length-1!==count)throw new Error(`Task 2 patch contract changed: ${name}: ${from.slice(0,70)}`);fs.writeFileSync(p,s.replaceAll(from,to));}
const route='routes/nyxguard/attack-log.js';
patch(route,'import { createReadStream }','import {keepRecent,newestFirst} from "../../internal/traffic-selection.mjs";\nimport { createReadStream }');
for(const maximum of [5000,1000])patch(route,`Math.min(${maximum}, Math.max(200, (offset + limit) * 3))`,'Math.max(1, offset + limit)');
const filename=path.join(root,route);let source=fs.readFileSync(filename,'utf8');
const collector=/const pushRecent = \(ev\) => \{\n\t\trecent\.push\(ev\);[\s\S]*?\n\t\};/g;
if([...source.matchAll(collector)].length!==2)throw new Error('Recent event collector contract changed');
source=source.replace(collector,'const pushRecent = (ev) => keepRecent(recent,ev,recentKeepLimit);');fs.writeFileSync(filename,source);
patch(route,'recent.sort((a, b) => b.ts - a.ts);','recent.sort(newestFirst);',2);
const support='frontend/assets/professional-support.js';
patch(support,'  "use strict";', '  "use strict";\n  '+fs.readFileSync(path.join(root,'frontend/assets/manager-duration-source.mjs'),'utf8').replace('export ',''));
patch(support,'Number.isSafeInteger(manager.uptimeSeconds) ? Math.floor(manager.uptimeSeconds / 60) + " minutes" : "Unavailable"','managerProcessDuration(manager.uptimeSeconds)',2);
patch('frontend/index.html','</head>','<link rel="stylesheet" href="/assets/task2-ui-polish.css?v=5.0.2-dev">\n</head>');
const summary='frontend/assets/getNyxGuardAttacksSummary-C48hTUOS.js';
patch(summary,'m(a=15,t=50,n=0)','m(a=15,t=50,n=0,signal)');
patch(summary,'params:{minutes:a,limit:t,offset:n}})','params:{minutes:a,limit:t,offset:n}},{signal})');
patch(summary,'s(a){return r({','s(a,signal){return r({');
patch(summary,'encodeURIComponent(String(a))}`})','encodeURIComponent(String(a))}`},{signal})');
const geo='frontend/assets/getNyxGuardGeoip-BFi2NwFK.js';
patch(geo,'u(a=1440,n=200)','u(a=1440,n=200,signal)');
patch(geo,'params:{minutes:a,limit:n}})','params:{minutes:a,limit:n}},{signal})');
const dashboard='frontend/assets/index-CP-DF6LG.js';
for(const [before,after] of [['queryFn:()=>re(i,50)','queryFn:({signal})=>re(i,50,0,signal)'],['queryFn:()=>re(c,S,A)','queryFn:({signal})=>re(c,S,A,signal)'],['queryFn:()=>Te(i)','queryFn:({signal})=>Te(i,signal)'],['queryFn:()=>Pe(i,i>=10080?1e4:200)','queryFn:({signal})=>Pe(i,i>=10080?1e4:200,signal)']])patch(dashboard,before,after);
const ips='frontend/assets/index-BqF3trRq.js';
patch(ips,'queryFn:()=>ce(i,i>=10080?1e4:200)','queryFn:({signal})=>ce(i,i>=10080?1e4:200,signal)');
patch(ips,'[k,P]=r.useState("desc"),W=', '[k,P]=r.useState("desc"),[ipPage,setIpPage]=r.useState(0),W=');
patch(ips,'[o.data?.items,v,N,C,f,_,M,k]),te=', '[o.data?.items,v,N,C,f,_,M,k]);r.useEffect(()=>setIpPage(0),[i,v,N,C,f,_,M,k]);const currentIpPage=Math.min(ipPage,Math.max(0,Math.ceil(F.length/100)-1)),te=');
patch(ips,'children:F.map(t=>','children:F.slice(currentIpPage*100,(currentIpPage+1)*100).map(t=>');
patch(ips,'children:e.jsxs("table",{className:"table table-sm table-vcenter",','children:e.jsxs(r.Fragment,{children:[e.jsxs("div",{className:"task2-ip-pagination",children:[e.jsx("button",{type:"button",className:s.window,disabled:currentIpPage===0,onClick:()=>setIpPage(currentIpPage-1),children:"Previous"}),e.jsx("span",{children:`Showing ${currentIpPage*100+1}–${Math.min((currentIpPage+1)*100,F.length)} of ${F.length} matching loaded IPs`}),e.jsx("button",{type:"button",className:s.window,disabled:(currentIpPage+1)*100>=F.length,onClick:()=>setIpPage(currentIpPage+1),children:"Next"})]}),e.jsxs("table",{className:"table table-sm table-vcenter",');
patch(ips,']},t.ip))})]})})]})})})};export',']},t.ip))})]})]})})]})})})};export');
const traffic='frontend/assets/index-B_A1pRP7.js';
// The live traffic request must consume TanStack Query's cancellation signal.
patch(traffic,'queryFn:()=>st(r,f,p)','queryFn:({signal})=>st(r,f,p,signal)');
patch('frontend/assets/index-DHuZiE1T-task2.js','className:r.page,','className:r.page,"data-task2-rules":true,');
patch(dashboard,'y.protectedCount>=y.totalApps?s.pillOn:s.pillPartial','y.protectedCount>=y.totalApps?s.pillOn:`${s.pillPartial} nyx-waf-partial`');
patch('frontend/assets/index-BiykMfhJ.js','className:a.badgePartial,canToggle:!0','className:`${a.badgePartial} nyx-waf-partial`,canToggle:!0');

patch(traffic,"queryFn:()=>at(r)","queryFn:({signal})=>at(r,signal)");
patch("frontend/assets/index-Dd_E7hOB.js",'className:"nyx-dashboard",','className:"nyx-dashboard","data-task2-proxy":true,');

// Preserve benign rotation races, but propagate other failures to the API error handler.
let scanSource=fs.readFileSync(filename,'utf8');
const scanner=/async function scanLogFile\(\{ fp, size, sinceMs, maxBytes, onEvent \}\) \{[\s\S]*?\n\}\n\nasync function buildSummary/;
if(!scanner.test(scanSource))throw new Error('Log scan contract changed');
scanSource=scanSource.replace(scanner,'function scanLogFile(options) { return scanAccessLog(options,parseAccessLine); }\n\nasync function buildSummary');
scanSource='import {scanLogFile as scanAccessLog} from "../../internal/log-scan.mjs";\n'+scanSource;
fs.writeFileSync(filename,scanSource);
patch(route,'debug(logger, `nyxguard: failed reading ${f.fp}: ${err}`);','if(err.code!=="ENOENT")throw err;\n\t\t\tdebug(logger, `nyxguard: log rotated during scan`);',2);
patch(route,'debug(logger, `nyxguard: failed reading unique IPs from ${f.fp}: ${err}`);','if(err.code!=="ENOENT")throw err;\n\t\t\tdebug(logger, `nyxguard: log rotated during scan`);');

patch(route,'debug(logger, `nyxguard: failed reading recent rows from ${f.fp}: ${err}`);','if(err.code!=="ENOENT")throw err;\n\t\t\tdebug(logger, `nyxguard: log rotated during scan`);');

patch(ips,'o.isLoading?e.jsx("div",{className:s.emptyState','o.data?.truncated?e.jsx("div",{role:"status",className:"task2-scan-notice",children:"Log scan limit reached; this view includes only scanned traffic."}):null,o.isLoading?e.jsx("div",{className:s.emptyState');
patch(traffic,'d.isLoading?t.jsx("div",{className:s.placeholder','d.data?.truncated?t.jsx("div",{role:"status",className:"task2-scan-notice",children:"Log scan limit reached; this view includes only scanned traffic."}):null,d.isLoading?t.jsx("div",{className:s.placeholder');
patch(dashboard,'E=t=>typeof t=="number"?t.toLocaleString():"Waiting for data…"','E=t=>typeof t=="number"?t.toLocaleString():C.isError?"Unavailable":"Waiting for data…"');
patch(dashboard,'Z=t=>typeof t=="number"?w(t):"Waiting for data…"','Z=t=>typeof t=="number"?w(t):C.isError?"Unavailable":"Waiting for data…"');
patch(dashboard,'e.jsx("div",{className:s.hostBoard,','C.isError?e.jsx("div",{role:"alert",className:"task2-scan-notice",children:"Unable to load traffic summary."}):null,C.data?.truncated?e.jsx("div",{role:"status",className:"task2-scan-notice",children:i>10080?"Log scan limit reached; historical request totals are complete, but IP counts include scanned logs only.":"Log scan limit reached; this view includes only scanned traffic."}):null,e.jsx("div",{className:s.hostBoard,');
patch(dashboard,'$.isLoading?e.jsx("div",{className:s.emptyState','$.data?.truncated?e.jsx("div",{role:"status",className:"task2-scan-notice",children:"Log scan limit reached; IP insights include only scanned traffic."}):null,$.isLoading?e.jsx("div",{className:s.emptyState');
