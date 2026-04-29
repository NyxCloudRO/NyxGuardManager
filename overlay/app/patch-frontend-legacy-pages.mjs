import fs from "node:fs";
import path from "node:path";

const assetsDir = "/app/frontend/assets";

const modernCss = `
.nyx-dashboard{position:relative!important;isolation:isolate!important;width:100%!important;margin:0!important;display:flex!important;flex-direction:column!important;gap:18px!important;padding:16px!important;overflow:visible!important;border-radius:18px!important;background:radial-gradient(820px 520px at -8% 18%,color-mix(in srgb,var(--app-primary) 24%,transparent),transparent 64%),radial-gradient(900px 520px at 92% -12%,color-mix(in srgb,var(--app-secondary) 16%,transparent),transparent 62%),linear-gradient(180deg,color-mix(in srgb,var(--app-surface) 96%,#071522 4%),color-mix(in srgb,var(--app-surface) 90%,#050d17 10%))!important;border:1px solid color-mix(in srgb,var(--app-border) 90%,#88d7ff 10%)!important;box-shadow:0 26px 58px #00000066,0 0 0 1px color-mix(in srgb,var(--app-primary) 13%,transparent) inset,0 0 42px color-mix(in srgb,var(--app-primary) 10%,transparent)!important;color:var(--app-text-primary)!important}
.nyx-dashboard:before{content:""!important;display:block!important;position:absolute!important;inset:0!important;z-index:-1!important;pointer-events:none!important;border-radius:inherit!important;background:linear-gradient(135deg,rgba(221,243,255,.08),transparent 28%,transparent 74%,rgba(0,212,255,.05)),radial-gradient(650px 300px at 0% 42%,rgba(0,212,255,.09),transparent 70%)!important}
.nyx-dashboard:after{content:""!important;display:block!important;position:absolute!important;inset:1px!important;z-index:-1!important;pointer-events:none!important;border-radius:calc(18px - 1px)!important;box-shadow:inset 0 1px 0 rgba(221,244,255,.09),inset 0 -18px 46px rgba(0,0,0,.2)!important}
.nyx-dashboard-body{display:flex!important;flex-direction:column!important;gap:18px!important;padding:0!important;border:0!important;border-radius:0!important;background:transparent!important;box-shadow:none!important;overflow:visible!important}
.nyx-dashboard-header{display:flex!important;align-items:flex-start!important;justify-content:space-between!important;gap:14px!important;min-height:0!important;margin:0!important;padding:0!important;border:0!important;background:transparent!important}
.nyx-dashboard-header-row{display:flex!important;align-items:flex-start!important;justify-content:space-between!important;gap:16px!important;flex-wrap:wrap!important;width:100%!important;margin:0!important}
.nyx-dashboard-title-wrap{flex:1 1 280px!important;min-width:0!important;padding:0!important}
.nyx-dashboard-title-block{display:flex!important;flex-direction:column!important;gap:6px!important}
.nyx-dashboard-title{margin:0!important;font-family:inherit!important;font-size:1.55rem!important;line-height:1.16!important;font-weight:760!important;letter-spacing:0!important;color:color-mix(in srgb,var(--app-text-primary) 94%,#ffffff 6%)!important;text-shadow:none!important;-webkit-font-smoothing:antialiased!important;text-rendering:geometricPrecision!important}
.nyx-dashboard-subtitle{margin:0!important;font-family:inherit!important;font-size:13px!important;line-height:1.45!important;font-weight:600!important;letter-spacing:0!important;color:color-mix(in srgb,var(--app-text-secondary) 88%,var(--app-text-primary) 12%)!important;-webkit-font-smoothing:antialiased!important;text-rendering:geometricPrecision!important}
.nyx-dashboard-actions{flex:0 1 auto!important;min-width:min(100%,260px)!important;padding:0!important}
.nyx-dashboard-action-row{display:flex!important;align-items:center!important;justify-content:flex-end!important;gap:11px!important;flex-wrap:wrap!important;margin-left:auto!important}
.nyx-dashboard-stats{display:grid!important;grid-template-columns:repeat(4,minmax(0,1fr))!important;gap:12px!important}
.nyx-dashboard-stat{position:relative!important;isolation:isolate!important;border:1px solid color-mix(in srgb,var(--app-border) 88%,#82dfff 12%)!important;border-radius:12px!important;padding:13px 14px!important;background:radial-gradient(240px 120px at 0% 0%,color-mix(in srgb,var(--app-primary) 12%,transparent),transparent 62%),linear-gradient(180deg,color-mix(in srgb,var(--app-surface-2) 86%,#0a1724 14%),color-mix(in srgb,var(--app-surface) 78%,#050d17 22%))!important;min-height:76px!important;box-shadow:0 12px 26px #00000038,0 0 0 1px color-mix(in srgb,var(--app-primary) 10%,transparent) inset!important}
.nyx-dashboard-stat:after{content:""!important;position:absolute!important;inset:0!important;pointer-events:none!important;border-radius:inherit!important;box-shadow:inset 0 1px 0 rgba(221,244,255,.08),inset 0 -12px 26px rgba(0,0,0,.18)!important}
.nyx-dashboard-stat span{display:block!important;font-size:.78rem!important;font-weight:600!important;color:color-mix(in srgb,var(--app-text-secondary) 88%,transparent)!important}
.nyx-dashboard-stat strong{display:block!important;margin-top:5px!important;font-size:1.25rem!important;line-height:1.22!important;color:color-mix(in srgb,var(--app-text-primary) 96%,#ffffff 4%)!important;text-shadow:0 0 14px color-mix(in srgb,var(--app-primary) 20%,transparent)!important}
.nyx-dashboard-table{position:relative!important;z-index:1!important;border-radius:14px!important;border:1px solid color-mix(in srgb,var(--app-border) 88%,#7ddcff 12%)!important;background:radial-gradient(760px 260px at 0% -8%,color-mix(in srgb,var(--app-primary) 11%,transparent),transparent 62%),linear-gradient(180deg,color-mix(in srgb,var(--app-surface-2) 72%,#07131f 28%),color-mix(in srgb,var(--app-surface) 76%,#050b13 24%))!important;box-shadow:0 18px 42px #0000004d,0 0 0 1px color-mix(in srgb,var(--app-primary) 10%,transparent) inset!important;overflow:visible!important}
.nyx-dashboard-table:before{content:""!important;position:absolute!important;inset:0!important;pointer-events:none!important;border-radius:inherit!important;box-shadow:inset 0 1px 0 rgba(221,244,255,.08),inset 0 -18px 38px rgba(0,0,0,.16)!important}
.nyx-dashboard-table .table-responsive,.nyx-dashboard-table [class*="table-responsive"]{border:0!important;border-radius:0!important;background:transparent!important;overflow:visible!important}
.nyx-dashboard-table .dropdown{position:relative!important;display:inline-block!important}
.nyx-dashboard-table .dropdown-menu{z-index:10080!important;position:absolute!important;inset:auto 0 auto auto!important;top:calc(100% + 4px)!important;left:auto!important;right:0!important;transform:none!important;min-width:178px!important;padding:8px!important;border:1px solid color-mix(in srgb,var(--app-border) 92%,#7ddcff 8%)!important;border-radius:10px!important;background:#07131f!important;box-shadow:0 18px 42px #000000b8,0 0 0 1px color-mix(in srgb,var(--app-primary) 18%,transparent) inset!important;color:var(--app-text-primary)!important;opacity:1!important}
.nyx-dashboard-table .dropdown-menu.show{display:block!important;visibility:visible!important;opacity:1!important}
.nyx-dashboard-table .dropdown-item{display:flex!important;align-items:center!important;gap:8px!important;color:var(--app-text-primary)!important;border-radius:7px!important}
.nyx-dashboard-table .dropdown-item:hover,.nyx-dashboard-table .dropdown-item:focus{background:color-mix(in srgb,var(--app-primary) 22%,transparent)!important;color:var(--app-text-primary)!important}
.nyx-dashboard-table .dropdown-divider{border-color:color-mix(in srgb,var(--app-border) 72%,transparent)!important}
.app-page-container,.app-page-container-framed,.app-page-container-framed>.card,.app-page-container-framed [class*="card"]{overflow:visible!important}
.nyx-dashboard-table table{margin:0!important;color:var(--app-text-primary)!important;background:transparent!important;border-color:color-mix(in srgb,var(--app-border) 62%,transparent)!important}
.nyx-dashboard-table thead tr{background:color-mix(in srgb,var(--app-surface-2) 72%,transparent)!important}
.nyx-dashboard-table th{height:38px!important;padding:9px 16px!important;border-bottom:1px solid color-mix(in srgb,var(--app-border) 76%,transparent)!important;color:color-mix(in srgb,var(--app-text-secondary) 82%,var(--app-text-primary) 18%)!important;font-size:11px!important;letter-spacing:.04em!important;text-transform:uppercase!important}
.nyx-dashboard-table td{padding:14px 16px!important;border-bottom:1px solid color-mix(in srgb,var(--app-border) 42%,transparent)!important;vertical-align:middle!important;background:transparent!important}
.nyx-dashboard-table tbody tr:hover td{background:linear-gradient(90deg,color-mix(in srgb,var(--app-primary) 13%,var(--app-surface) 87%),color-mix(in srgb,var(--app-secondary) 8%,var(--app-surface) 92%))!important}
.nyx-dashboard-table .empty,.nyx-dashboard-table .empty-state,.nyx-dashboard-table [class*="empty"]{min-height:170px!important;border:0!important;border-radius:0!important;background:transparent!important}
.nyx-dashboard-table .badge,.nyx-dashboard-table .status,.nyx-modern-badges .badge{border-radius:8px!important;border:1px solid color-mix(in srgb,var(--app-primary) 50%,var(--app-border) 50%)!important;background:linear-gradient(180deg,color-mix(in srgb,var(--app-primary) 28%,#092233 72%),color-mix(in srgb,var(--app-secondary) 16%,#071827 84%))!important;color:color-mix(in srgb,var(--app-text-primary) 94%,#ffffff 6%)!important;box-shadow:0 0 0 1px color-mix(in srgb,var(--app-primary) 20%,transparent) inset,0 0 14px color-mix(in srgb,var(--app-primary) 18%,transparent)!important}
.nyx-dashboard-table .btn-action{width:36px!important;height:36px!important;min-width:36px!important;border-radius:10px!important;border:1px solid color-mix(in srgb,var(--app-primary) 45%,var(--app-border) 55%)!important;background:linear-gradient(180deg,color-mix(in srgb,var(--app-surface-2) 84%,var(--app-primary) 16%),color-mix(in srgb,var(--app-surface) 86%,#06111e 14%))!important;box-shadow:0 8px 18px #0000004d,0 0 0 1px color-mix(in srgb,var(--app-primary) 15%,transparent) inset,0 0 14px color-mix(in srgb,var(--app-primary) 12%,transparent)!important;transition:transform .12s ease,filter .16s ease,box-shadow .16s ease,border-color .16s ease!important}
.nyx-dashboard-table .btn-action:hover,.nyx-dashboard-table .btn-action:focus-visible{transform:translateY(-1px)!important;filter:brightness(1.08)!important;border-color:color-mix(in srgb,var(--app-primary) 70%,#ffffff 30%)!important;box-shadow:0 11px 22px #00000066,0 0 0 1px color-mix(in srgb,var(--app-primary) 28%,transparent) inset,0 0 22px color-mix(in srgb,var(--app-primary) 22%,transparent)!important}
.nyx-dashboard-action-row .btn,.nyx-dashboard-action-row .nyx-app-action-pill{height:32px!important;min-height:32px!important;border-radius:9px!important;padding:0 14px!important;font-size:11px!important;border:1px solid color-mix(in srgb,var(--app-primary) 52%,var(--app-border) 48%)!important;background:linear-gradient(180deg,color-mix(in srgb,var(--app-surface-2) 78%,var(--app-primary) 22%),color-mix(in srgb,var(--app-surface) 84%,#06111e 16%))!important;box-shadow:0 8px 18px #00000052,0 0 0 1px color-mix(in srgb,var(--app-primary) 18%,transparent) inset,0 0 16px color-mix(in srgb,var(--app-primary) 14%,transparent)!important;transition:transform .12s ease,filter .16s ease,box-shadow .16s ease,border-color .16s ease!important}
.nyx-dashboard-action-row .btn:hover,.nyx-dashboard-action-row .btn:focus-visible,.nyx-dashboard-action-row .nyx-app-action-pill:hover,.nyx-dashboard-action-row .nyx-app-action-pill:focus-visible{transform:translateY(-1px)!important;filter:brightness(1.08)!important;border-color:color-mix(in srgb,var(--app-primary) 72%,#ffffff 28%)!important;box-shadow:0 12px 24px #00000066,0 0 0 1px color-mix(in srgb,var(--app-primary) 30%,transparent) inset,0 0 24px color-mix(in srgb,var(--app-primary) 24%,transparent)!important}
.nyx-modern-table{width:100%!important;border-collapse:collapse!important;margin:0!important}
.nyx-modern-table th{height:38px!important;padding:9px 16px!important;border-bottom:1px solid color-mix(in srgb,var(--app-border) 76%,transparent)!important;color:color-mix(in srgb,var(--app-text-secondary) 82%,var(--app-text-primary) 18%)!important;font-size:11px!important;letter-spacing:.04em!important;text-transform:uppercase!important}
.nyx-modern-table td{padding:14px 16px!important;border-bottom:1px solid color-mix(in srgb,var(--app-border) 42%,transparent)!important;vertical-align:middle!important;background:transparent!important}
.nyx-modern-table tr:hover td{background:linear-gradient(90deg,color-mix(in srgb,var(--app-primary) 13%,var(--app-surface) 87%),color-mix(in srgb,var(--app-secondary) 8%,var(--app-surface) 92%))!important}
.nyx-modern-primary{display:flex!important;align-items:center!important;gap:12px!important;min-width:0!important}
.nyx-modern-stack{display:flex!important;flex-direction:column!important;gap:4px!important;min-width:0!important}
.nyx-modern-title{font-weight:760!important;color:var(--app-text-primary)!important;line-height:1.2!important}
.nyx-modern-subtle{font-size:12px!important;color:var(--app-text-secondary)!important;line-height:1.35!important}
.nyx-modern-badges{display:flex!important;align-items:center!important;gap:6px!important;flex-wrap:wrap!important}
.nyx-modern-actions{text-align:right!important;width:1%!important;white-space:nowrap!important}
.nyx-modern-empty{min-height:216px!important;display:flex!important;align-items:center!important;justify-content:center!important;text-align:center!important;padding:28px!important}
.nyx-modern-empty h3{margin:0 0 8px!important;font-size:1.1rem!important;font-weight:760!important;color:color-mix(in srgb,var(--app-text-primary) 96%,#ffffff 4%)!important;text-shadow:0 0 12px color-mix(in srgb,var(--app-primary) 14%,transparent)!important}
.nyx-modern-empty p{margin:0 0 22px!important;color:color-mix(in srgb,var(--app-text-secondary) 88%,transparent)!important}
html[data-app-theme=premium-nyx] .nyx-dashboard{border-radius:var(--pn-radius-panel)!important;border:1px solid var(--pn-edge)!important;background:radial-gradient(860px 460px at -9% 16%,rgba(0,212,255,.13),transparent 66%),radial-gradient(860px 420px at 94% -12%,rgba(77,166,255,.08),transparent 62%),linear-gradient(180deg,#0a1420f5,#08101bf8)!important;box-shadow:var(--pn-elev-shadow),0 0 46px rgba(0,212,255,.08)!important}
html[data-app-theme=premium-nyx] .nyx-dashboard-stat{border-color:#60a9d866!important;background:radial-gradient(220px 120px at 0% 0%,rgba(0,212,255,.09),transparent 62%),linear-gradient(180deg,#081421f0,#07101af5)!important;border-radius:8px!important;box-shadow:0 12px 28px #0000004f,0 0 0 1px #00d4ff1c inset!important}
html[data-app-theme=premium-nyx] .nyx-dashboard-table{border-color:#5fa2cd66!important;border-radius:10px!important;background:radial-gradient(760px 260px at 0% -8%,rgba(0,212,255,.08),transparent 62%),linear-gradient(180deg,#060f19fd,#060d16fd)!important;box-shadow:0 18px 42px #00000066,0 0 0 1px #00d4ff18 inset!important}
html[data-app-theme=premium-nyx] .nyx-dashboard-table thead tr,html[data-app-theme=premium-nyx] .nyx-dashboard-table th{background:linear-gradient(180deg,#08111bf5,#070e18f5)!important}
html[data-app-theme=premium-nyx] .nyx-dashboard-table tbody tr:hover td{background:linear-gradient(90deg,#00d4ff1a,#4da6ff0d)!important}
@media(max-width:1200px){.nyx-dashboard-stats{grid-template-columns:repeat(2,minmax(0,1fr))!important}}
@media(max-width:767.98px){.nyx-dashboard{padding:10px!important;border-radius:16px!important}.nyx-dashboard-title{font-size:1.55rem!important}.nyx-dashboard-action-row{justify-content:flex-start!important}.nyx-dashboard-actions{width:100%!important}.nyx-dashboard-stats{grid-template-columns:1fr!important}}
`;

function replaceAll(source, search, replacement) {
	return source.split(search).join(replacement);
}

function replaceOne(source, search, replacement, name) {
	if (!source.includes(search)) {
		throw new Error(`Could not patch ${name}: missing ${search.slice(0, 80)}`);
	}
	return source.replace(search, replacement);
}

function legacyTitlePattern(id) {
	return new RegExp(
		'([A-Za-z_$][\\w$]*)\\.jsx\\("h2",\\{className:"mt-1 mb-0",children:\\1\\.jsx\\(([A-Za-z_$][\\w$]*),\\{id:"' +
			id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") +
			'"\\}\\)\\}\\)',
	);
}

function hasLegacyTitle(source, id) {
	return legacyTitlePattern(id).test(source);
}

function replaceLegacyTitle(source, id, subtitle, name) {
	const pattern = legacyTitlePattern(id);
	const match = source.match(pattern);
	if (!match) {
		throw new Error(`Could not patch ${name}: missing legacy title for ${id}`);
	}
	const renderer = match[1];
	const message = match[2];
	const replacement = `${renderer}.jsxs("div",{className:"nyx-dashboard-title-block",children:[${renderer}.jsx("h2",{className:"nyx-dashboard-title",children:${renderer}.jsx(${message},{id:"${id}"})}),${renderer}.jsx("p",{className:"nyx-dashboard-subtitle",children:"${subtitle}"})]})`;
	return source.replace(pattern, replacement);
}

function sharedLegacyPagePatch(source) {
	let patched = source;
	patched = replaceAll(patched, 'className:"card mt-4"', 'className:"nyx-settings-page-card"');
	patched = replaceAll(patched, 'className:"card nyx-legacy-card"', 'className:"nyx-settings-page-card"');
	patched = replaceAll(patched, 'className:"card-status-top bg-orange"', 'className:"nyx-legacy-status-strip"');
	patched = replaceAll(patched, 'className:"card-status-top bg-cyan"', 'className:"nyx-legacy-status-strip"');
	patched = replaceAll(patched, 'className:"card-status-top bg-lime"', 'className:"nyx-legacy-status-strip"');
	patched = replaceAll(patched, 'className:"card-status-top bg-blue"', 'className:"nyx-legacy-status-strip"');
	patched = replaceAll(patched, 'className:"card-status-top bg-pink"', 'className:"nyx-legacy-status-strip"');
	patched = replaceAll(patched, 'className:"card-table"', 'className:"nyx-settings-list-panel"');
	patched = replaceAll(patched, 'className:"card-header"', 'className:"nyx-settings-list-header"');
	patched = replaceAll(patched, 'className:"row w-full"', 'className:"nyx-settings-list-header-row"');
	patched = replaceAll(patched, 'className:"col"', 'className:"nyx-settings-list-title-wrap"');
	patched = replaceAll(patched, 'className:"col-md-auto col-sm-12"', 'className:"nyx-settings-list-actions"');
	patched = replaceAll(patched, 'className:"ms-auto d-flex flex-wrap btn-list"', 'className:"nyx-settings-list-action-row"');
	patched = patched.replace(/,style:\{overflow:"visible"\}/g, "");
	patched = replaceAll(patched, 'className:"nyx-settings-page-card"', 'className:"nyx-dashboard"');
	patched = replaceAll(patched, 'className:"nyx-legacy-status-strip"', 'className:"d-none"');
	patched = replaceAll(patched, 'className:"nyx-settings-list-panel"', 'className:"nyx-dashboard-body"');
	patched = replaceAll(patched, 'className:"nyx-settings-list-header"', 'className:"nyx-dashboard-header"');
	patched = replaceAll(patched, 'className:"nyx-settings-list-header-row"', 'className:"nyx-dashboard-header-row"');
	patched = replaceAll(patched, 'className:"nyx-settings-list-title-wrap"', 'className:"nyx-dashboard-title-wrap"');
	patched = replaceAll(patched, 'className:"nyx-settings-title-block"', 'className:"nyx-dashboard-title-block"');
	patched = replaceAll(patched, 'className:"nyx-settings-list-title"', 'className:"nyx-dashboard-title"');
	patched = replaceAll(patched, 'className:"nyx-settings-list-subtitle"', 'className:"nyx-dashboard-subtitle"');
	patched = replaceAll(patched, 'className:"nyx-settings-list-actions"', 'className:"nyx-dashboard-actions"');
	patched = replaceAll(patched, 'className:"nyx-settings-list-action-row"', 'className:"nyx-dashboard-action-row"');
	return patched;
}

function statGrid(renderer, stats) {
	return `${renderer}.jsxs("div",{className:"nyx-dashboard-stats",children:[${stats
		.map(([label, value]) => `${renderer}.jsxs("div",{className:"nyx-dashboard-stat",children:[${renderer}.jsx("span",{children:"${label}"}),${renderer}.jsx("strong",{children:${value}})]})`)
		.join(",")}]})`;
}

function insertStats(source, renderer, componentName, stats) {
	const tableCall = `${renderer}.jsx(${componentName},{data:`;
	if (!source.includes(tableCall)) return source;
	return source.replace(tableCall, `${statGrid(renderer, stats)},${tableCall}`);
}

function closeWrappedTable(source) {
	return source;
}

function tableShell(renderer, heads, rowsExpr, emptyExpr) {
	return `${renderer}.jsx("div",{className:"nyx-dashboard-table",children:(${rowsExpr}).length?${renderer}.jsxs("table",{className:"nyx-modern-table",children:[${renderer}.jsx("thead",{children:${renderer}.jsxs("tr",{children:[${heads
		.map((head) => `${renderer}.jsx("th",{children:"${head}"})`)
		.join(",")} ,${renderer}.jsx("th",{})]})}),${renderer}.jsx("tbody",{children:(${rowsExpr}).map(row=>${emptyExpr.row})})]}):${emptyExpr.empty}})`;
}

function injectEarlyReturn(source, functionName, signature, body) {
	const marker = `function ${functionName}(${signature}){`;
	if (!source.includes(marker)) return source;
	return source.replace(marker, `${marker}return ${body};`);
}

function injectEarlyReturnByRegex(source, pattern, body) {
	const match = source.match(pattern);
	if (!match) return source;
	return source.replace(match[0], `${match[0]}return ${body};`);
}

function patchUsersTable(source) {
	const row = `e.jsxs("tr",{children:[e.jsx("td",{children:e.jsxs("div",{className:"nyx-modern-primary",children:[e.jsx(I,{url:row.avatar,name:row.name}),e.jsxs("div",{className:"nyx-modern-stack",children:[e.jsx("span",{className:"nyx-modern-title",children:row.name}),e.jsxs("span",{className:"nyx-modern-subtle",children:["Created: ",row.createdOn]})]})]})}),e.jsx("td",{children:e.jsx(le,{email:row.email})}),e.jsx("td",{children:e.jsx(de,{roles:row.roles})}),e.jsx("td",{children:e.jsx(Y,{value:!row.isDisabled})}),e.jsx("td",{className:"nyx-modern-actions",children:e.jsxs("span",{className:"dropdown",children:[e.jsx("button",{type:"button",className:"btn dropdown-toggle btn-action btn-sm px-1","data-bs-boundary":"viewport","data-bs-toggle":"dropdown",children:e.jsx(_,{})}),e.jsxs("div",{className:"dropdown-menu dropdown-menu-end",children:[e.jsxs("a",{className:"dropdown-item",href:"#",onClick:a=>{a.preventDefault(),u?.(row.id)},children:[e.jsx(ee,{size:16}),e.jsx(o,{id:"action.edit"})]}),d!==row.id?e.jsxs(e.Fragment,{children:[e.jsxs("a",{className:"dropdown-item",href:"#",onClick:a=>{a.preventDefault(),m?.(row.id)},children:[e.jsx(L,{size:16}),e.jsx(o,{id:"action.permissions"})]}),e.jsxs("a",{className:"dropdown-item",href:"#",onClick:a=>{a.preventDefault(),j?.(row.id)},children:[e.jsx(U,{size:16}),e.jsx(o,{id:"user.set-password"})]}),e.jsxs("a",{className:"dropdown-item",href:"#",onClick:a=>{a.preventDefault(),l?.(row.id,row.isDisabled)},children:[e.jsx(se,{size:16}),e.jsx(o,{id:row.isDisabled?"action.enable":"action.disable"})]}),row.isDisabled?null:e.jsxs("a",{className:"dropdown-item",href:"#",onClick:a=>{a.preventDefault(),g?.(row.id)},children:[e.jsx(v,{size:16}),e.jsx(o,{id:"user.login-as",data:{name:row.name}})]}),e.jsx("div",{className:"dropdown-divider"}),e.jsxs("a",{className:"dropdown-item",href:"#",onClick:a=>{a.preventDefault(),x?.(row.id)},children:[e.jsx(G,{size:16}),e.jsx(o,{id:"action.delete"})]})]}):null]})]})})]},row.id)`;
	const empty = `e.jsx("div",{className:"nyx-modern-empty",children:e.jsxs("div",{children:[e.jsx("h3",{children:"There are no Users"}),e.jsx("p",{children:"Why don't you create one?"}),e.jsx("button",{type:"button",className:"btn btn-orange",onClick:()=>p?.(),children:e.jsx(o,{id:"object.add",tData:{object:"user"}})})]})})`;
	return injectEarlyReturn(source, "ce", "{data:r,isFiltered:t,isFetching:n,currentUserId:d,onEditUser:u,onEditPermissions:m,onSetPassword:j,onDeleteUser:x,onDisableToggle:l,onNewUser:p,onLoginAs:g}", tableShell("e", ["Name", "Email", "Roles", "Status"], "r??[]", { row, empty }));
}

function patchProxyTable(source) {
	const row = `e.jsxs("tr",{children:[e.jsx("td",{children:e.jsxs("div",{className:"nyx-modern-primary",children:[e.jsx(P,{url:row.owner?row.owner.avatar:"",name:row.owner?row.owner.name:""}),e.jsx(K,{domains:row.domainNames,createdOn:row.createdOn})]})}),e.jsx("td",{children:\`\${row.forwardScheme}://\${row.forwardHost}:\${row.forwardPort}\`}),e.jsx("td",{children:e.jsx(Q,{certificate:row.certificate})}),e.jsx("td",{children:e.jsx(ee,{access:row.accessList})}),e.jsx("td",{children:e.jsx(B,{value:row.enabled,trueLabel:"online",falseLabel:"offline"})}),e.jsx("td",{className:"nyx-modern-actions",children:e.jsxs("span",{className:"dropdown",children:[e.jsx("button",{type:"button",className:"btn dropdown-toggle btn-action btn-sm px-1","data-bs-boundary":"viewport","data-bs-toggle":"dropdown",children:e.jsx(A,{})}),e.jsxs("div",{className:"dropdown-menu dropdown-menu-end",children:[e.jsxs("a",{className:"dropdown-item",href:"#",onClick:a=>{a.preventDefault(),i?.(row.id)},children:[e.jsx(G,{size:16}),e.jsx(n,{id:"action.edit"})]}),e.jsxs(g,{section:x,permission:v,hideError:!0,children:[e.jsxs("a",{className:"dropdown-item",href:"#",onClick:a=>{a.preventDefault(),d?.(row.id,!row.enabled)},children:[e.jsx(W,{size:16}),e.jsx(n,{id:row.enabled?"action.disable":"action.enable"})]}),e.jsx("div",{className:"dropdown-divider"}),e.jsxs("a",{className:"dropdown-item",href:"#",onClick:a=>{a.preventDefault(),c?.(row.id)},children:[e.jsx(R,{size:16}),e.jsx(n,{id:"action.delete"})]})]})]})]})})]},row.id)`;
	const empty = `e.jsx("div",{className:"nyx-modern-empty",children:e.jsxs("div",{children:[e.jsx("h3",{children:"There are no Proxy Hosts"}),e.jsx("p",{children:"Why don't you create one?"}),e.jsx("button",{type:"button",className:"btn btn-lime",onClick:()=>p?.(),children:e.jsx(n,{id:"object.add",tData:{object:"proxy-host"}})})]})})`;
	return injectEarlyReturn(source, "se", "{data:t,isFetching:o,onEdit:i,onDelete:c,onDisableToggle:d,onNew:p,isFiltered:h}", tableShell("e", ["Source", "Destination", "SSL", "Access", "Status"], "t??[]", { row, empty }));
}

function patchStreamsTable(source) {
	const row = `e.jsxs("tr",{children:[e.jsx("td",{children:e.jsxs("div",{className:"nyx-modern-primary",children:[e.jsx(F,{url:row.owner?row.owner.avatar:"",name:row.owner?row.owner.name:""}),e.jsx(B,{value:row.incomingPort,createdOn:row.createdOn})]})}),e.jsx("td",{children:\`\${row.forwardingHost}:\${row.forwardingPort}\`}),e.jsx("td",{children:e.jsxs("div",{className:"nyx-modern-badges",children:[row.tcpForwarding?e.jsx("span",{className:"badge badge-lg domain-name",children:e.jsx(i,{id:"streams.tcp"})}):null,row.udpForwarding?e.jsx("span",{className:"badge badge-lg domain-name",children:e.jsx(i,{id:"streams.udp"})}):null]})}),e.jsx("td",{children:e.jsx(O,{certificate:row.certificate})}),e.jsx("td",{children:e.jsx(W,{value:row.enabled,trueLabel:"online",falseLabel:"offline"})}),e.jsx("td",{className:"nyx-modern-actions",children:e.jsxs("span",{className:"dropdown",children:[e.jsx("button",{type:"button",className:"btn dropdown-toggle btn-action btn-sm px-1","data-bs-boundary":"viewport","data-bs-toggle":"dropdown",children:e.jsx(q,{})}),e.jsxs("div",{className:"dropdown-menu dropdown-menu-end",children:[e.jsxs("a",{className:"dropdown-item",href:"#",onClick:s=>{s.preventDefault(),g?.(row.id)},children:[e.jsx(G,{size:16}),e.jsx(i,{id:"action.edit"})]}),e.jsxs(b,{section:u,permission:C,hideError:!0,children:[e.jsxs("a",{className:"dropdown-item",href:"#",onClick:s=>{s.preventDefault(),m?.(row.id,!row.enabled)},children:[e.jsx(_,{size:16}),e.jsx(i,{id:"action.disable"})]}),e.jsx("div",{className:"dropdown-divider"}),e.jsxs("a",{className:"dropdown-item",href:"#",onClick:s=>{s.preventDefault(),p?.(row.id)},children:[e.jsx(A,{size:16}),e.jsx(i,{id:"action.delete"})]})]})]})]})})]},row.id)`;
	const empty = `e.jsx("div",{className:"nyx-modern-empty",children:e.jsxs("div",{children:[e.jsx("h3",{children:"There are no Streams"}),e.jsx("p",{children:"Why don't you create one?"}),e.jsx("button",{type:"button",className:"btn btn-blue",onClick:()=>x?.(),children:e.jsx(i,{id:"object.add",tData:{object:"stream"}})})]})})`;
	return injectEarlyReturn(source, "ae", "{data:t,isFetching:n,isFiltered:d,onEdit:g,onDelete:p,onDisableToggle:m,onNew:x}", tableShell("e", ["Incoming port", "Destination", "Protocol", "SSL", "Status"], "t??[]", { row, empty }));
}

function patchAccessTable(source) {
	const row = `e.jsxs("tr",{children:[e.jsx("td",{children:e.jsxs("div",{className:"nyx-modern-primary",children:[e.jsx(y,{url:row.owner?row.owner.avatar:"",name:row.owner?row.owner.name:""}),e.jsx(F,{value:row.name,createdOn:row.createdOn})]})}),e.jsx("td",{children:e.jsx(t,{id:"access-list.auth-count",data:{count:(row.items||[]).length}})}),e.jsx("td",{children:e.jsx(t,{id:"access-list.access-count",data:{count:(row.clients||[]).length}})}),e.jsx("td",{children:e.jsx(t,{id:row.satisfyAny?"column.satisfy-any":"column.satisfy-all"})}),e.jsx("td",{children:e.jsx(t,{id:"proxy-hosts.count",data:{count:row.proxyHostCount}})}),e.jsx("td",{className:"nyx-modern-actions",children:e.jsxs("span",{className:"dropdown",children:[e.jsx("button",{type:"button",className:"btn dropdown-toggle btn-action btn-sm px-1","data-bs-boundary":"viewport","data-bs-toggle":"dropdown",children:e.jsx(v,{})}),e.jsxs("div",{className:"dropdown-menu dropdown-menu-end",children:[e.jsxs("a",{className:"dropdown-item",href:"#",onClick:o=>{o.preventDefault(),i?.(row.id)},children:[e.jsx(O,{size:16}),e.jsx(t,{id:"action.edit"})]}),e.jsxs(h,{section:m,permission:w,hideError:!0,children:[e.jsx("div",{className:"dropdown-divider"}),e.jsxs("a",{className:"dropdown-item",href:"#",onClick:o=>{o.preventDefault(),d?.(row.id)},children:[e.jsx(S,{size:16}),e.jsx(t,{id:"action.delete"})]})]})]})]})})]},row.id)`;
	const empty = `e.jsx("div",{className:"nyx-modern-empty",children:e.jsxs("div",{children:[e.jsx("h3",{children:"There are no Access Lists"}),e.jsx("p",{children:"Why don't you create one?"})]})})`;
	return injectEarlyReturn(source, "B", "{data:c,isFetching:n,isFiltered:u,onEdit:i,onDelete:d,onNew:x}", tableShell("e", ["Name", "Authorization", "Access", "Satisfy", "Proxy Hosts"], "c??[]", { row, empty }));
}

function patchCertificatesTable(source) {
	const row = `l.jsxs("tr",{children:[l.jsx("td",{children:l.jsxs("div",{className:"nyx-modern-primary",children:[l.jsx(Dr,{url:row.owner?row.owner.avatar:"",name:row.owner?row.owner.name:""}),l.jsx(qr,{domains:row.domainNames,createdOn:row.createdOn,niceName:row.niceName,provider:row.provider||""})]})}),l.jsx("td",{children:row.provider==="letsencrypt"?row.meta?.dnsChallenge&&row.meta?.dnsProvider?l.jsxs(l.Fragment,{children:[l.jsx(N,{id:"lets-encrypt"})," - ",row.meta?.dnsProvider]}):l.jsx(N,{id:"lets-encrypt"}):row.provider==="other"?l.jsx(N,{id:"certificates.custom"}):l.jsx(N,{id:row.provider})}),l.jsx("td",{children:row.expiresOn||""}),l.jsx("td",{children:l.jsx(Sa,{proxyHosts:row.proxyHosts,redirectionHosts:row.redirectionHosts,deadHosts:row.deadHosts,streams:row.streams})}),l.jsx("td",{className:"nyx-modern-actions",children:l.jsxs("span",{className:"dropdown",children:[l.jsx("button",{type:"button",className:"btn dropdown-toggle btn-action btn-sm px-1","data-bs-boundary":"viewport","data-bs-toggle":"dropdown",children:l.jsx(Rr,{})}),l.jsxs("div",{className:"dropdown-menu dropdown-menu-end",children:[l.jsxs("a",{className:"dropdown-item",href:"#",onClick:f=>{f.preventDefault(),n?.(row.id)},children:[l.jsx(Mr,{size:16}),l.jsx(N,{id:"action.renew"})]}),l.jsxs(Ue,{section:De,permission:kt,hideError:!0,children:[l.jsxs("a",{className:"dropdown-item",href:"#",onClick:f=>{f.preventDefault(),a?.(row.id)},children:[l.jsx(tn,{size:16}),l.jsx(N,{id:"action.download"})]}),l.jsx("div",{className:"dropdown-divider"}),l.jsxs("a",{className:"dropdown-item",href:"#",onClick:f=>{f.preventDefault(),r?.(row.id)},children:[l.jsx(Wr,{size:16}),l.jsx(N,{id:"action.delete"})]})]})]})]})})]},row.id)`;
	const empty = `l.jsx("div",{className:"nyx-modern-empty",children:l.jsxs("div",{children:[l.jsx("h3",{children:"There are no Certificates"}),l.jsx("p",{children:"Why don't you create one?"})]})})`;
	const body = tableShell("l", ["Name", "Provider", "Expires", "Status"], "e??[]", { row, empty });
	return injectEarlyReturnByRegex(source, /function [A-Za-z_$][\w$]*\(\{data:e,isFetching:t,onDelete:r,onRenew:n,onDownload:a,isFiltered:i\}\)\{/, body);
}

function patchUsers(source, name) {
	let patched = sharedLegacyPagePatch(source);
	patched = replaceLegacyTitle(patched, "users", "Manage local accounts, roles, permissions, and access status.", name);
	patched = patchUsersTable(patched);
	patched = insertStats(patched, "e", "ce", [
		["User access", "`${(l??[]).length}`"],
		["Enabled", "`${(l??[]).filter(s=>!s.isDisabled).length}`"],
		["Administrators", "`${(l??[]).filter(s=>(s.roles||[]).includes(\"admin\")).length}`"],
		["Filtered", "`${(c??l??[]).length}`"],
	]);
	patched = closeWrappedTable(patched);
	return patched;
}

function patchAccessLists(source, name) {
	let patched = sharedLegacyPagePatch(source);
	patched = replaceLegacyTitle(patched, "access-lists", "Manage allow and deny access policies for protected applications.", name);
	patched = patched.replace(
		/children:a\?\.length\?(e\.jsx\(g,\{size:"sm",className:"btn-cyan",onClick:\(\)=>j\("new"\),children:e\.jsx\(t,\{id:"object\.add",tData:\{object:"access-list"\}\}\)\}\)):null/,
		"children:$1",
	);
	patched = patchAccessTable(patched);
	const renderer = source.includes("e.jsx") ? "e" : "l";
	const componentName = source.includes("e.jsx(B,{data:") ? "B" : "B";
	patched = insertStats(patched, renderer, componentName, [
		["Access control", "`${(a??[]).length}`"],
		["Auth users", "`${(a??[]).reduce((s,o)=>s+(o.items?.length||0),0)}`"],
		["Client rules", "`${(a??[]).reduce((s,o)=>s+(o.clients?.length||0),0)}`"],
		["Filtered", "`${(l??n??a??[]).length}`"],
	]);
	patched = closeWrappedTable(patched);
	return patched;
}

function patchProxyHosts(source, name) {
	let patched = sharedLegacyPagePatch(source);
	patched = replaceLegacyTitle(patched, "proxy-hosts", "Manage NyxGuard protected proxy hosts and application routing.", name);
	patched = patchProxyTable(patched);
	patched = insertStats(patched, "e", "se", [
		["Protected apps", "`${(r??[]).length}`"],
		["Online", "`${(r??[]).filter(s=>s.enabled).length}`"],
		["Public", "`${(r??[]).filter(s=>!s.accessList).length}`"],
		["Filtered", "`${(s??r??[]).length}`"],
	]);
	patched = closeWrappedTable(patched);
	return patched;
}

function patchStreams(source, name) {
	let patched = sharedLegacyPagePatch(source);
	patched = replaceLegacyTitle(patched, "streams", "Manage TCP and UDP stream forwarding rules.", name);
	patched = patchStreamsTable(patched);
	patched = insertStats(patched, "e", "ae", [
		["Streams", "`${(l??[]).length}`"],
		["Online", "`${(l??[]).filter(r=>r.enabled).length}`"],
		["TCP", "`${(l??[]).filter(r=>r.tcpForwarding).length}`"],
		["UDP", "`${(l??[]).filter(r=>r.udpForwarding).length}`"],
	]);
	patched = closeWrappedTable(patched);
	return patched;
}

function patchCertificates(source, name) {
	let patched = sharedLegacyPagePatch(source);
	patched = replaceLegacyTitle(patched, "certificates", "Manage certificates used by protected proxy hosts.", name);
	patched = patched.replace(
		/children:c\?\.length\?(l\.jsxs\("div",\{className:"dropdown",children:\[l\.jsx\("button",\{type:"button",className:"btn btn-sm dropdown-toggle btn-pink mt-1"[\s\S]*?id:"certificates\.custom"[\s\S]*?\]\}\)):null/,
		"children:$1",
	);
	patched = patchCertificatesTable(patched);
	const tableComponent = patched.match(/l\.jsx\(([A-Za-z_$][\w$]*),\{data:/)?.[1] || "$a";
	patched = insertStats(patched, "l", tableComponent, [
		["TLS assets", "`${(c??[]).length}`"],
		["Let's Encrypt", "`${(c??[]).filter(o=>o.provider===\"letsencrypt\").length}`"],
		["Custom", "`${(c??[]).filter(o=>o.provider===\"other\").length}`"],
		["Filtered", "`${(d??c??[]).length}`"],
	]);
	patched = closeWrappedTable(patched);
	return patched;
}

for (const name of fs.readdirSync(assetsDir)) {
	const file = path.join(assetsDir, name);
	if (!/^index-.*\.js$/.test(name) && !/^index-.*\.css$/.test(name)) continue;
	const source = fs.readFileSync(file, "utf8");

	let patched = source;
	if (hasLegacyTitle(source, "users") && source.includes("card-table")) {
		patched = patchUsers(source, name);
	} else if (hasLegacyTitle(source, "access-lists") && source.includes("card-table")) {
		patched = patchAccessLists(source, name);
	} else if (hasLegacyTitle(source, "proxy-hosts") && source.includes("card-table")) {
		patched = patchProxyHosts(source, name);
	} else if (hasLegacyTitle(source, "streams") && source.includes("card-table")) {
		patched = patchStreams(source, name);
	} else if (hasLegacyTitle(source, "certificates") && source.includes("card-table")) {
		patched = patchCertificates(source, name);
	} else if (/^index-.*\.css$/.test(name) && !source.includes(".nyx-settings-page-card")) {
		patched = `${source}\n${modernCss}\n`;
	}

	if (patched !== source) {
		fs.writeFileSync(file, patched);
	}
}
