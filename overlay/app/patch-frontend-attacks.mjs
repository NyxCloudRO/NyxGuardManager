import fs from "node:fs";
import path from "node:path";

const assetsDir = "/app/frontend/assets";
const actionControl = `function xt({item:l,onBan:r,disabled:u}){const d=[["24h","24h","nyx-ban-24h"],["7d","7d","nyx-ban-7d"],["30d","30d","nyx-ban-30d"],["permanent","Permanent","nyx-ban-permanent"]];return t.jsx("div",{className:a.banWrap,children:d.map(([b,m,_])=>t.jsx("button",{type:"button",className:N(a.banOption,_),disabled:u,onClick:()=>r(l.ip,b),title:\`Set ban to \${m}\`,children:m},b))})}`;
const css = `._banWrap_1snf1_180{position:relative!important;display:inline-grid!important;grid-template-columns:repeat(4,minmax(40px,1fr))!important;gap:4px!important;min-width:210px!important;vertical-align:middle!important}._banOption_1snf1_237{min-height:28px!important;padding:5px 8px!important;border-radius:7px!important;border:1px solid color-mix(in srgb,var(--app-border) 72%,transparent)!important;background:linear-gradient(180deg,color-mix(in srgb,var(--app-surface-2) 76%,transparent),color-mix(in srgb,var(--app-surface) 80%,transparent))!important;color:var(--app-text-primary)!important;font-size:12px!important;font-weight:650!important;text-align:center!important;white-space:nowrap!important;cursor:pointer!important;box-shadow:inset 0 1px color-mix(in srgb,var(--app-text-primary) 7%,transparent)!important;transition:background .14s,border-color .14s,box-shadow .14s,transform .14s!important}._banOption_1snf1_237:hover:not(:disabled){transform:translateY(-1px)!important}._banOption_1snf1_237:focus-visible{outline:2px solid color-mix(in srgb,var(--app-primary) 72%,white 28%)!important;outline-offset:2px!important}._banOption_1snf1_237:disabled{opacity:.5!important;cursor:not-allowed!important}.nyx-ban-24h:hover:not(:disabled),.nyx-ban-24h:focus-visible{background:linear-gradient(180deg,color-mix(in srgb,var(--app-primary) 24%,var(--app-surface-2) 76%),color-mix(in srgb,var(--app-primary) 14%,var(--app-surface) 86%))!important;border-color:color-mix(in srgb,var(--app-primary) 72%,white 8%)!important;box-shadow:0 7px 16px color-mix(in srgb,var(--app-primary) 18%,transparent),inset 0 1px color-mix(in srgb,var(--app-text-primary) 10%,transparent)!important}.nyx-ban-7d:hover:not(:disabled),.nyx-ban-7d:focus-visible{background:linear-gradient(180deg,color-mix(in srgb,var(--app-secondary) 26%,var(--app-surface-2) 74%),color-mix(in srgb,var(--app-secondary) 16%,var(--app-surface) 84%))!important;border-color:color-mix(in srgb,var(--app-secondary) 72%,white 8%)!important;box-shadow:0 7px 16px color-mix(in srgb,var(--app-secondary) 18%,transparent),inset 0 1px color-mix(in srgb,var(--app-text-primary) 10%,transparent)!important}.nyx-ban-30d:hover:not(:disabled),.nyx-ban-30d:focus-visible{background:linear-gradient(180deg,color-mix(in srgb,var(--app-warning) 34%,var(--app-surface-2) 66%),color-mix(in srgb,var(--app-warning) 20%,var(--app-surface) 80%))!important;border-color:color-mix(in srgb,var(--app-warning) 76%,white 10%)!important;box-shadow:0 7px 16px color-mix(in srgb,var(--app-warning) 20%,transparent),inset 0 1px color-mix(in srgb,var(--app-text-primary) 10%,transparent)!important}.nyx-ban-permanent:hover:not(:disabled),.nyx-ban-permanent:focus-visible{background:linear-gradient(180deg,color-mix(in srgb,var(--app-error) 34%,var(--app-surface-2) 66%),color-mix(in srgb,var(--app-error) 20%,var(--app-surface) 80%))!important;border-color:color-mix(in srgb,var(--app-error) 76%,white 10%)!important;box-shadow:0 7px 16px color-mix(in srgb,var(--app-error) 22%,transparent),inset 0 1px color-mix(in srgb,var(--app-text-primary) 10%,transparent)!important}`;

function patchSidebarPermissions(source, name) {
	let patched = source;
	const nyxguardMenus = [
		"/nyxguard/traffic",
		"/nyxguard/ips",
		"/nyxguard/rules",
		"/nyxguard/apps",
		"/nyxguard/attacks",
		"/nyxguard/globalgate",
	];

	for (const route of nyxguardMenus) {
		const matcher = new RegExp(`(\\{to:"${route.replaceAll("/", "\\/")}",icon:[^,}]+,label:"[^"]+")\\}`, "g");
		patched = patched.replace(matcher, (match, item) => {
			if (match.includes("permissionSection:")) return match;
			return `${item},permissionSection:"nyxguard",permission:hc}`;
		});
	}

	const replacements = [
		[/(\{to:"\/nyxguard\/proxy",icon:[^,}]+,label:"proxy-hosts"),permissionSection:tL,permission:hc\}/g, '$1,permissionSection:"nyxguard",permission:hc}'],
		[/(\{to:"\/web-controls",icon:[^,}]+,label:"web-controls"),permissionSection:Eh\}/g, '$1,permissionSection:"webControls",permission:hc}'],
		[/(\{to:"\/users",icon:[^,}]+,label:"users"),permissionSection:Eh\}/g, '$1,permissionSection:"users",permission:hc}'],
		[/(\{to:"\/event-center",icon:[^,}]+,label:"auditlogs"),permissionSection:Eh\}/g, '$1,permissionSection:"auditlog",permission:hc}'],
		[/(\{to:"\/settings",icon:[^,}]+,label:"settings"),permissionSection:Eh\}/g, '$1,permissionSection:"settings",permission:hc}'],
	];
	for (const [matcher, replacement] of replacements) {
		patched = patched.replace(matcher, replacement);
	}

	if (patched === source) {
		throw new Error(`Could not patch sidebar permissions in ${name}`);
	}

	return patched;
}

function permissionRow(label, fieldName) {
	return `g.jsxs("div",{className:"mb-3",children:[g.jsx("label",{htmlFor:"ignored",className:"form-label",children:"${label}"}),g.jsx(Xe,{name:"${fieldName}",children:({field:_,form:w})=>A(_,w)})]})`;
}

function patchPermissionEditor(source, name) {
	let patched = source.replace(
		/initialValues:\{visibility:l\.permissions\?\.visibility,accessLists:l\.permissions\?\.accessLists,certificates:l\.permissions\?\.certificates,deadHosts:l\.permissions\?\.deadHosts,proxyHosts:l\.permissions\?\.proxyHosts,redirectionHosts:l\.permissions\?\.redirectionHosts,streams:l\.permissions\?\.streams\}/,
		"initialValues:{visibility:l.permissions?.visibility,nyxguard:l.permissions?.nyxguard,webControls:l.permissions?.webControls,users:l.permissions?.users,auditlog:l.permissions?.auditlog,settings:l.permissions?.settings,accessLists:l.permissions?.accessLists,certificates:l.permissions?.certificates,deadHosts:l.permissions?.deadHosts,proxyHosts:l.permissions?.proxyHosts,redirectionHosts:l.permissions?.redirectionHosts,streams:l.permissions?.streams}",
	);

	const rows = [
		permissionRow("NyxGuard Security", "nyxguard"),
		permissionRow("Web Controls", "webControls"),
		permissionRow("Users", "users"),
		permissionRow("Audit Logs", "auditlog"),
		permissionRow("Settings", "settings"),
		permissionRow("Access Lists", "accessLists"),
		permissionRow("Certificates", "certificates"),
	].join(",");

	const startMarker = 'g.jsxs("div",{className:"mb-3",children:[g.jsx("label",{htmlFor:"asd"';
	const endMarker = "]}),g.jsxs(Ve.Footer";
	const start = patched.indexOf(startMarker);
	const end = patched.indexOf(endMarker, start);
	if (start === -1 || end === -1) {
		throw new Error(`Could not locate permissions editor rows in ${name}`);
	}

	patched = `${patched.slice(0, start)}!T&&g.jsxs(g.Fragment,{children:[${rows}]})${patched.slice(end)}`;

	if (patched === source) {
		throw new Error(`Could not patch permissions editor in ${name}`);
	}

	return patched;
}

for (const name of fs.readdirSync(assetsDir)) {
	const file = path.join(assetsDir, name);
	if (/^index-W-QFtloY.*\.js$/.test(name)) {
		const source = fs.readFileSync(file, "utf8");
		if (source.includes("nyx-ban-7d")) continue;
		const patched = source.replace(/function xt\(\{item:l,onBan:r,disabled:u\}\)[\s\S]*?const bt=\(\)=>/, `${actionControl}const bt=()=>`);
		if (patched === source) throw new Error(`Could not patch attack ban control in ${name}`);
		fs.writeFileSync(file, patched);
	}

	if (/^index-CTHAIRmi.*\.js$/.test(name)) {
		const source = fs.readFileSync(file, "utf8");
		let patched = patchSidebarPermissions(source, name);
		patched = patchPermissionEditor(patched, name);
		if (patched !== source) {
			fs.writeFileSync(file, patched);
		}
	}

	if (/^index-.*\.css$/.test(name)) {
		const source = fs.readFileSync(file, "utf8");
		if (!source.includes("nyx-ban-24h")) {
			fs.writeFileSync(file, `${source}\n${css}\n`);
		}
	}
}
