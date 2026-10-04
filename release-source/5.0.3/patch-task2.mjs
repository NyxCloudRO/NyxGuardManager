import fs from 'node:fs';import path from 'node:path';
const root=process.argv[2];function patch(file,from,to,count=1){const p=path.join(root,file),s=fs.readFileSync(p,'utf8');if(s.split(from).length-1!==count)throw Error('Task2 prerequisite mismatch: '+file+' '+from.slice(0,65));fs.writeFileSync(p,s.replaceAll(from,to));}
const main='frontend/assets/index-CTHAIRmi-409dev-4012certfix4-threatpagination3.js';
patch(main,'className:kt(t,Aoe.page)','className:kt(t,Aoe.page,"nyx-app-frame")');
patch(main,'className:WE.shell','className:`${WE.shell} nyx-app-shell`');
patch(main,'`${WE.main} nyx-scroll-theme`','`${WE.main} nyx-dashboard-viewport nyx-scroll-theme`');
patch(main,'className:`${WE.main} nyx-dashboard-viewport nyx-scroll-theme`,children:e','className:`${WE.main} nyx-dashboard-viewport nyx-scroll-theme`,role:"region","aria-label":"Dashboard content",tabIndex:0,children:e');
patch(main,'className:"w-100 py-0 min-w-0 h-100 d-flex flex-column"','className:"w-100 py-0 min-w-0 h-100 d-flex flex-column nyx-route-content"');
const p=path.join(root,main);let s=fs.readFileSync(p,'utf8');const a=s.indexOf('m8=()=>{'),b=s.indexOf(',b8=e=>',a);if(a<0||b<a)throw Error('Theme initializer missing');s=s.slice(0,a)+'m8=()=>window.NyxThemePreferences.read()'+s.slice(b);
const c=s.indexOf('y8=({children:e})=>{'),d=s.indexOf(';function E8()',c);if(c<0||d<c)throw Error('Theme provider missing');s=s.slice(0,c)+`y8=({children:e})=>{const[t,n]=I.useState(()=>m8());I.useLayoutEffect(()=>{b8(fv(t))},[t]);I.useEffect(()=>{const restore=()=>n(m8());window.addEventListener("nyxguard:session-change",restore);window.addEventListener("storage",restore);return()=>{window.removeEventListener("nyxguard:session-change",restore);window.removeEventListener("storage",restore)}},[]);const a=I.useMemo(()=>{const i=fv(t);return{currentTheme:i,themeId:i.id,themes:Hl,setTheme:o=>{const saved=window.NyxThemePreferences.valid(o);window.NyxThemePreferences.write(saved);n(saved)},getTheme:()=>i.id}},[t]);return g.jsx(PD.Provider,{value:a,children:e})}`+s.slice(d);
fs.writeFileSync(p,s);
patch(main,'localStorage.setItem(rp,JSON.stringify([{token:t,expires:n}]))','localStorage.setItem(rp,JSON.stringify([{token:t,expires:n}])),window.NyxThemePreferences.changed()');
patch(main,'localStorage.setItem(rp,JSON.stringify(a))','localStorage.setItem(rp,JSON.stringify(a)),window.NyxThemePreferences.changed()');
patch(main,'localStorage.setItem(rp,JSON.stringify(t))','localStorage.setItem(rp,JSON.stringify(t)),window.NyxThemePreferences.changed()');
patch(main,'clear(){localStorage.removeItem(rp)}','clear(){localStorage.removeItem(rp),window.NyxThemePreferences.changed()}');
const html=path.join(root,'frontend/index.html');let h=fs.readFileSync(html,'utf8');const start=h.indexOf('\t\t<script>'),end=h.indexOf('</script>',start);if(start<0||end<0||!h.slice(start,end).includes('app_theme_ver'))throw Error('Legacy theme head missing');h=h.slice(0,start)+'\t\t<script src="/assets/theme-preferences.js?v=5.0.3-task2"></script>'+h.slice(end+9);h=h.replace('</head>','<link rel="stylesheet" href="/assets/application-shell.css?v=5.0.3-task2">\n</head>');fs.writeFileSync(html,h);
patch('routes/nyxguard/attack-log.js','import {scanLogFile as scanAccessLog} from "../../internal/log-scan.mjs";','import {scanHistoricalLog as scanAccessLog,clearHistoricalLogCache} from "../../internal/historical-log-cache.mjs";');
// Complete historical sources: memory/cache eviction must never trim the interval.
patch('routes/nyxguard/attack-log.js','if (totalScanBytes >= MAX_TOTAL_SCAN_BYTES) break;','',2);
patch('routes/nyxguard/attack-log.js','if (totalScanBytes >= maxTotalScanBytes) break;','');
patch('routes/nyxguard/attack-log.js','truncated: totalScanBytes >= MAX_TOTAL_SCAN_BYTES,','truncated: false,',2);
patch('routes/nyxguard/attack-log.js','truncated: totalScanBytes >= maxTotalScanBytes,','truncated: false,');
patch('routes/nyxguard/attack-log.js','\tlet filesCleared = 0;','\tclearHistoricalLogCache();\n\tlet filesCleared = 0;');
// Long historical pagination must include archived requests, not just current tails.
patch('routes/nyxguard/attack-log.js','\t\tif (!f.name.endsWith("_access.log")) continue;','\t\tif(f.mtimeMs<sinceMs&&!f.name.endsWith("_access.log"))continue;');
patch('routes/nyxguard/attack-log.js','\t\t\tconst lines = await readRecentLines(f.fp, MAX_BYTES_PER_FILE_LONG_RECENT);','\t\t\tconst lines=[];await scanLogFile({fp:f.fp,size:f.size,sinceMs,maxBytes:undefined,onEvent:ev=>pushRecent(ev)});\n\t\t\t// Selection uses a bounded heap; never materialize the complete history here.');
patch('routes/nyxguard/attack-log.js','\t\titems,\n\t\ttruncated: false,\n\t\tsource: "access_logs",','\t\titems,\n\t\ttotal: byIp.size,\n\t\tlimited: byIp.size > limit,\n\t\ttruncated: false,\n\t\tsource: "access_logs",');
// Keep the existing 100-row local UI pagination/export/filter contract. Fetch the
// API's complete bounded IP dataset and explicitly report a dataset limit.
patch('frontend/assets/index-BqF3trRq.js','ce(i,i>=10080?1e4:200,signal)','ce(i,5e4,signal)');
patch('frontend/assets/index-CP-DF6LG.js','Pe(i,i>=10080?1e4:200,signal)','Pe(i,5e4,signal)');
patch('frontend/assets/index-BqF3trRq.js','o.data?.truncated?e.jsx("div",{role:"status",className:"task2-scan-notice",children:"Log scan limit reached; this view includes only scanned traffic."}):null,','o.data?.limited?e.jsx("div",{role:"status",className:"task2-scan-notice",children:`Showing the top ${o.data.items.length.toLocaleString()} of ${o.data.total.toLocaleString()} IPs; each shown IP includes the complete selected interval.`}):null,');
// The API already supports 180D. Expose it beside the existing historical choices.
patch('frontend/assets/index-BqF3trRq.js','case 129600:return a.formatMessage({id:"nyxguard.ips.window.90d"});','case 129600:return a.formatMessage({id:"nyxguard.ips.window.90d"});case 259200:return "Last 180D";');
patch('frontend/assets/index-BqF3trRq.js','e.jsx("button",{type:"button",className:`${s.window} ${s.exportButton}`','e.jsx("button",{type:"button",className:i===259200?s.windowActive:s.window,onClick:()=>u(259200),children:"Last 180D"}),e.jsx("button",{type:"button",className:`${s.window} ${s.exportButton}`');
// Exact totals for shorter windows too: byte tails cannot prove completeness in
// bursts. Parsed snapshots keep repeat reads bounded without early aggregation limits.
patch('routes/nyxguard/attack-log.js','const scanAll = minutes > 24 * 60;','const scanAll = true;',2);
// Historical retrieval failures need an explicit recovery action. Retry the
// active query only; its existing key/signal owns interval and stale responses.
patch('frontend/assets/index-BqF3trRq.js','o.isError?e.jsx("div",{className:s.emptyState,children:e.jsx(n,{id:"nyxguard.ips.load-error"})})','o.isError?e.jsxs("div",{className:s.emptyState,children:[e.jsx(n,{id:"nyxguard.ips.load-error"}),e.jsx("button",{type:"button",className:s.window,onClick:()=>o.refetch(),children:"Retry"})]})');
patch('frontend/assets/index-B_A1pRP7.js','d.isError?t.jsx("div",{className:s.placeholder,children:t.jsx(a,{id:"nyxguard.traffic.load-error"})})','d.isError?t.jsxs("div",{className:s.placeholder,children:[t.jsx(a,{id:"nyxguard.traffic.load-error"}),t.jsx("button",{type:"button",className:s.window,onClick:()=>d.refetch(),children:"Retry"})]})');
patch('frontend/assets/index-CP-DF6LG.js','f.isError?e.jsx("div",{className:s.sparklinePlaceholder,children:a.formatMessage({id:"nyxguard.traffic-error"})})','f.isError?e.jsxs("div",{className:s.sparklinePlaceholder,children:[a.formatMessage({id:"nyxguard.traffic-error"}),e.jsx("button",{type:"button",className:s.ghostButton,onClick:()=>f.refetch(),children:"Retry"})]})');
patch('frontend/assets/index-CP-DF6LG.js','$.isError?e.jsx("div",{className:s.emptyState,children:a.formatMessage({id:"nyxguard.section.ip-intelligence.error"})})','$.isError?e.jsxs("div",{className:s.emptyState,children:[a.formatMessage({id:"nyxguard.section.ip-intelligence.error"}),e.jsx("button",{type:"button",className:s.ghostButton,onClick:()=>$.refetch(),children:"Retry"})]})');
