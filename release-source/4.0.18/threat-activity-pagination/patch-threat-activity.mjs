import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const ROUTE_START = "/**\n * /api/nyxguard/attacks\n */";
const ROUTE_END = "/**\n * /api/nyxguard/attacks/ban";

const patchedRoute = `/**
 * /api/nyxguard/attacks
 */
router
	.route("/attacks")
	.options((_, res) => res.sendStatus(204))
	.all(jwtdecode())
	.all(requireNyxGuardView)
	.get(async (req, res, next) => {
		try {
			const data = await validator(
				{
					additionalProperties: false,
					properties: {
						days: { type: "integer", enum: [1, 7, 30] },
						limit: { type: "integer", minimum: 1, maximum: 500 },
						offset: { type: "integer", minimum: 0, maximum: 1000000 },
						type: { type: "string", enum: ["sqli", "ddos", "bot"] },
						search: { type: "string", maxLength: 255 },
						min_count: { type: "integer", minimum: 0, maximum: 2147483647 },
						sort: { type: "string", enum: ["ip", "type", "count", "lastSeen"] },
						order: { type: "string", enum: ["asc", "desc"] },
					},
				},
				{
					days: req.query.days ? Number.parseInt(String(req.query.days), 10) : 1,
					limit: req.query.limit ? Number.parseInt(String(req.query.limit), 10) : 200,
					offset: req.query.offset ? Number.parseInt(String(req.query.offset), 10) : 0,
					type: req.query.type ? String(req.query.type) : undefined,
					search: req.query.search ? String(req.query.search).trim() : "",
					min_count: req.query.min_count ? Number.parseInt(String(req.query.min_count), 10) : 0,
					sort: req.query.sort ? String(req.query.sort) : "count",
					order: req.query.order ? String(req.query.order) : "desc",
				},
			);

			const cacheKey = [
				"attacks",
				data.days,
				data.limit,
				data.offset,
				data.type ?? "all",
				data.search,
				data.min_count,
				data.sort,
				data.order,
			].join(":");
			const result = await withRouteCache(cacheKey, cacheTtlForWindow(data.days * 24 * 60, ATTACKS_SUMMARY_CACHE_TTL_MS), async () => {
				const knex = db();
				const since = new Date(Date.now() - data.days * 24 * 60 * 60 * 1000);

				// Preserve the established operator-view semantics: current attack-derived
				// bans remain visible even when their source event has left the selected window.
				const attackBanRows = await knex("nyxguard_ip_rule")
					.select("id", "ip_cidr", "enabled", "expires_on", "created_on", "modified_on", "note")
					.andWhere("action", "deny")
					.andWhere(whereRuleIsCurrentlyActive)
					.andWhere(whereAttackDerivedRule)
					.orderBy("id", "desc");
				const activeAttackTypeByIp = await latestAttackTypeByIp(
					knex,
					attackBanRows.filter((row) => !isAutoBanNote(row.note)).map((row) => row.ip_cidr),
				);
				const activeBans = attackBanRows
					.map((row) => ({
						ip: row.ip_cidr,
						type: attackTypeForBanRule(row, activeAttackTypeByIp),
						lastSeen: row.modified_on ?? row.created_on,
					}))
					.filter((row) => row.ip && row.type && row.lastSeen);

				const page = await buildThreatActivityPage(knex, {
					since,
					limit: data.limit,
					offset: data.offset,
					type: data.type,
					search: data.search,
					minCount: data.min_count,
					sort: data.sort,
					order: data.order,
					activeBans,
				});

				const pageIps = [...new Set(page.items.map((item) => item.ip).filter(Boolean))];
				const denyRows = pageIps.length
					? await knex("nyxguard_ip_rule")
							.select("id", "ip_cidr", "enabled", "expires_on", "created_on", "modified_on", "note")
							.whereIn("ip_cidr", pageIps)
							.andWhere("action", "deny")
							.andWhere(whereRuleIsCurrentlyActive)
							.orderBy("id", "desc")
					: [];
				const banByIp = new Map();
				for (const row of denyRows) {
					if (!banByIp.has(row.ip_cidr)) banByIp.set(row.ip_cidr, row);
				}
				const attackBanByKey = new Map();
				for (const row of attackBanRows) {
					const rowType = attackTypeForBanRule(row, activeAttackTypeByIp);
					const key = \`\${row.ip_cidr}|\${rowType}\`;
					if (rowType && !attackBanByKey.has(key)) attackBanByKey.set(key, row);
				}

				const items = page.items.map((item) => {
					const attackRule = attackBanByKey.get(\`\${item.ip}|\${item.type}\`);
					const generalRule = banByIp.get(item.ip);
					return {
						ip: item.ip,
						type: item.type,
						count: item.count,
						lastSeen: item.lastSeen,
						ban: attackRule
							? banPayload(attackRule, { displayRecorded: true })
							: generalRule
								? banPayload(generalRule)
								: null,
						...(item.banOnly ? { source: "active_attack_ban" } : {}),
					};
				});

				return { days: data.days, items, total: page.total, limit: data.limit, offset: data.offset };
			});

			res.status(200).send(result);
		} catch (err) {
			debug(logger, \`GET /api/nyxguard/attacks: \${err}\`);
			next(err);
		}
	});

`;

function replaceExactlyOnce(source, before, after, label) {
	const count = source.split(before).length - 1;
	if (count !== 1) throw new Error(`Expected one ${label}, found ${count}`);
	return source.replace(before, after);
}

export function patchBackend(appRoot) {
	const routePath = path.join(appRoot, "routes/nyxguard/attack-log.js");
	let source = fs.readFileSync(routePath, "utf8");
	source = replaceExactlyOnce(
		source,
		'import db from "../../db.js";',
		'import db from "../../db.js";\nimport { buildThreatActivityPage } from "../../internal/threat-activity-page.js";',
		"Threat Activity helper import",
	);
	const start = source.indexOf(ROUTE_START);
	const end = source.indexOf(ROUTE_END, start);
	if (start < 0 || end < 0) throw new Error("Pinned Threat Activity route markers are missing");
	source = `${source.slice(0, start)}${patchedRoute}${source.slice(end)}`;
	fs.writeFileSync(routePath, source, "utf8");
	return routePath;
}

export function patchApiClient(frontendRoot) {
	const clientPath = path.join(frontendRoot, "assets/getNyxGuardAttacks-DWznpCF6.js");
	let source = fs.readFileSync(clientPath, "utf8");
	const before = 'async function g(a,r=200,n){const t=new URLSearchParams;return t.set("days",String(a)),t.set("limit",String(r)),s({url:`nyxguard/attacks?${t.toString()}`})}';
	const after = 'async function g(a,r=200,n={}){const t=new URLSearchParams;return t.set("days",String(a)),t.set("limit",String(r)),t.set("offset",String(n.offset??0)),n.type&&t.set("type",n.type),n.search&&t.set("search",n.search),n.minCount&&t.set("min_count",String(n.minCount)),n.sort&&t.set("sort",n.sort),n.order&&t.set("order",n.order),s({url:`nyxguard/attacks?${t.toString()}`})}';
	source = replaceExactlyOnce(source, before, after, "Threat Activity API client function");
	fs.writeFileSync(clientPath, source, "utf8");
	return clientPath;
}

export function patchThreatPage(frontendRoot, fileName) {
	const pagePath = path.join(frontendRoot, `assets/${fileName}`);
	let source = fs.readFileSync(pagePath, "utf8");
	source = replaceExactlyOnce(
		source,
		'from"./getNyxGuardAttacks-DWznpCF6.js"',
		'from"./getNyxGuardAttacks-DWznpCF6.js?v=20260830-threat-pagination3"',
		"Threat Activity API client cache buster",
	);

	source = replaceExactlyOnce(
		source,
		'[y,j]=o.useState("count"),[h,C]=o.useState("desc"),L=e=>{y===e?C(c=>c==="asc"?"desc":"asc"):(j(e),C("desc"))},g=A({queryKey:["nyxguard","attacks",r],queryFn:()=>F(r,200),refetchInterval:r===1?15e3:6e4}),v=o.useMemo(()=>{const e=g.data?.items??[],c=d.trim().toLowerCase(),x=p.trim()!==""?Number.parseInt(p.trim(),10):null,E=e.filter(f=>!(c&&!f.ip.toLowerCase().includes(c)||m&&f.type!==m||x!==null&&Number.isFinite(x)&&f.count<x)),w=h==="asc"?1:-1;return[...E].sort((f,k)=>{switch(y){case"ip":return w*f.ip.localeCompare(k.ip);case"type":return w*f.type.localeCompare(k.type);case"count":return w*(f.count-k.count);case"lastSeen":return w*(new Date(f.lastSeen).getTime()-new Date(k.lastSeen).getTime());default:return 0}})},[g.data?.items,d,m,p,y,h]),',
		'[y,j]=o.useState("count"),[h,C]=o.useState("desc"),[E,w]=o.useState(0),L=e=>{w(0),y===e?C(c=>c==="asc"?"desc":"asc"):(j(e),C("desc"))},x=p.trim()!==""?Number.parseInt(p.trim(),10):0,g=A({queryKey:["nyxguard","attacks",r,E,d,m,x,y,h],queryFn:()=>F(r,200,{offset:E,type:m||void 0,search:d.trim(),minCount:Number.isFinite(x)?x:0,sort:y,order:h}),refetchInterval:r===1?15e3:6e4}),v=(o.useEffect(()=>{g.data&&E>0&&E>=g.data.total&&w(Math.max(0,Math.floor((g.data.total-1)/200)*200))},[g.data?.total,E]),g.data?.items??[]),',
		"Threat Activity query and local filtering block",
	);
	source = source
		.replaceAll('onClick:()=>u(1)', 'onClick:()=>{u(1),w(0)}')
		.replaceAll('onClick:()=>u(7)', 'onClick:()=>{u(7),w(0)}')
		.replaceAll('onClick:()=>u(30)', 'onClick:()=>{u(30),w(0)}')
		.replace('value:d,onChange:e=>b(e.target.value)', 'value:d,onChange:e=>{b(e.target.value),w(0)}')
		.replace('value:m,onChange:e=>_(e.target.value)', 'value:m,onChange:e=>{_(e.target.value),w(0)}')
		.replace('value:p,onChange:e=>i(e.target.value)', 'value:p,onChange:e=>{i(e.target.value),w(0)}')
		.replace('onClick:()=>{b(""),_(""),i("")}', 'onClick:()=>{b(""),_(""),i(""),w(0)}')
		.replace('{count:v.length,total:g.data?.items?.length??0}', '{count:v.length,total:g.data?.total??0}')
		.replace('(g.data?.items?.length??0)>0&&t.jsxs', 'g.data&&t.jsxs');

	const tableEnd = '})]})})]})})})};export{bt as default};';
	const pagination = '})]})}),t.jsxs("div",{style:{display:"flex",justifyContent:"space-between",alignItems:"center",gap:12,marginTop:12},children:[t.jsx("span",{className:a.filterCount,children:`${v.length?E+1:0}-${E+v.length} of ${(g.data?.total??0).toLocaleString()}`}),t.jsxs("div",{style:{display:"flex",gap:8},children:[t.jsx("button",{type:"button",className:a.window,disabled:E===0||g.isFetching,onClick:()=>w(e=>Math.max(0,e-200)),children:"Previous"}),t.jsx("button",{type:"button",className:a.window,disabled:E+v.length>=(g.data?.total??0)||g.isFetching,onClick:()=>w(e=>e+200),children:"Next"})]})]})]})})})};export{bt as default};';
	source = replaceExactlyOnce(source, tableEnd, pagination, "Threat Activity pagination footer");

	if (!source.includes("g.data?.total??0") || !source.includes('children:"Next"')) {
		throw new Error("Threat Activity page contract markers are missing after patch");
	}
	fs.writeFileSync(pagePath, source, "utf8");
	return pagePath;
}

export function patchFrontendCacheBusters(frontendRoot) {
	const oldMainName = "index-CTHAIRmi-409dev-4012certfix4.js";
	const newMainName = "index-CTHAIRmi-409dev-4012certfix4-threatpagination3.js";
	const mainPath = path.join(frontendRoot, "assets", oldMainName);
	let main = fs.readFileSync(mainPath, "utf8");
	main = replaceExactlyOnce(
		main,
		'assets/index-W-QFtloY-409dev.js',
		'assets/index-W-QFtloY-409dev.js?v=20260830-threat-pagination3',
		"Threat Activity page cache buster",
	);
	main = replaceExactlyOnce(
		main,
		'./index-W-QFtloY.js',
		'./index-W-QFtloY.js?v=20260830-threat-pagination3',
		"active Threat Activity import cache buster",
	);
	fs.writeFileSync(mainPath, main, "utf8");

	// The compiled chunks import the entry module directly. Give the entry a new
	// filename and rewrite every compiled import together so React is instantiated
	// once while browsers are forced off the previously cached entry graph.
	const assetsRoot = path.join(frontendRoot, "assets");
	for (const fileName of fs.readdirSync(assetsRoot).filter((name) => name.endsWith(".js"))) {
		const filePath = path.join(assetsRoot, fileName);
		const source = fs.readFileSync(filePath, "utf8");
		const output = source.replaceAll(`./${oldMainName}`, `./${newMainName}`);
		if (output !== source) fs.writeFileSync(filePath, output, "utf8");
	}
	const versionedMainPath = path.join(assetsRoot, newMainName);
	fs.copyFileSync(mainPath, versionedMainPath);

	const indexPath = path.join(frontendRoot, "index.html");
	let index = fs.readFileSync(indexPath, "utf8");
	index = replaceExactlyOnce(
		index,
		'src="/assets/index-CTHAIRmi-409dev-4012certfix4.js"',
		'src="/assets/index-CTHAIRmi-409dev-4012certfix4-threatpagination3.js"',
		"active frontend entry cache buster",
	);
	fs.writeFileSync(indexPath, index, "utf8");
	return [versionedMainPath, indexPath];
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
	const appRoot = process.argv[2] || "/app";
	console.log(`Patched ${patchBackend(appRoot)}`);
	console.log(`Patched ${patchApiClient(path.join(appRoot, "frontend"))}`);
	for (const fileName of ["index-W-QFtloY.js", "index-W-QFtloY-408dev.js", "index-W-QFtloY-409dev.js"]) {
		console.log(`Patched ${patchThreatPage(path.join(appRoot, "frontend"), fileName)}`);
	}
	for (const patched of patchFrontendCacheBusters(path.join(appRoot, "frontend"))) console.log(`Patched ${patched}`);
}
