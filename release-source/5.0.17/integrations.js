import {HISTORY_WINDOWS,TRAFFIC_WINDOWS,closedCutoff,attackBands,attackRanks,trafficBands,automaticBands,enforcementBands,portalBands} from './historical-bands.mjs';
import {securitySourceReady} from './security-source-health.mjs';
import {settings as nativeSettings} from './nyxguard/settings.js';
import {portalAuditHealth} from './portal-security-health.mjs';
import crypto from "node:crypto";
import {alignedTrafficWindow,utcSql} from "./traffic-ingestion.mjs";
import { global as logger } from "../logger.js";

// ── Token helpers ──────────────────────────────────────────────────────────────

function generateToken() {
	return crypto.randomBytes(32).toString("hex"); // 64 hex chars = 256-bit entropy
}

function rowToApi(row) {
	return {
		id: row.id,
		name: row.name,
		// Token is returned only on creation. Existing rows return a masked preview.
		token: row._plainToken ?? `${String(row.token).slice(0, 8)}${"•".repeat(24)}`,
		enabled: row.enabled,
		lastUsedAt: row.last_used_at ?? null,
		createdOn: row.created_on,
		modifiedOn: row.modified_on,
	};
}

// ── CRUD ───────────────────────────────────────────────────────────────────────

export const integrations = {
	async list(knex) {
		const rows = await knex("integration").orderBy("id", "asc");
		return rows.map(rowToApi);
	},

	async get(knex, id) {
		const row = await knex("integration").where({ id }).first();
		if (!row) throw new Error(`Integration ${id} not found`);
		return rowToApi(row);
	},

	async create(knex, data) {
		const name = String(data.name || "").trim();
		if (!name) throw new Error("Integration name is required");
		const token = generateToken();
		const [id] = await knex("integration").insert({
			name,
			token,
			enabled: 1,
			created_on: knex.fn.now(),
			modified_on: knex.fn.now(),
		});
		const row = await knex("integration").where({ id }).first();
		// Return the plain token once — it will never be shown in full again.
		return rowToApi({ ...row, _plainToken: token });
	},

	async update(knex, id, data) {
		const existing = await integrations.get(knex, id);
		const name = data.name !== undefined ? String(data.name).trim() : existing.name;
		if (!name) throw new Error("Integration name is required");
		await knex("integration").where({ id }).update({
			name,
			enabled: data.enabled !== undefined ? (data.enabled ? 1 : 0) : existing.enabled,
			modified_on: knex.fn.now(),
		});
		return integrations.get(knex, id);
	},

	async rotateToken(knex, id) {
		await integrations.get(knex, id); // throws if not found
		const token = generateToken();
		await knex("integration").where({ id }).update({
			token,
			modified_on: knex.fn.now(),
		});
		const row = await knex("integration").where({ id }).first();
		return rowToApi({ ...row, _plainToken: token });
	},

	async remove(knex, id) {
		await integrations.get(knex, id); // throws if not found
		await knex("integration").where({ id }).delete();
	},

	/** Validate a bearer token from a scrape request. Returns true if valid+enabled. */
	async authenticate(knex, token) {
		if (!token || typeof token !== "string" || token.length < 10) return false;
		// Fetch all enabled integrations and compare using timingSafeEqual to prevent
		// timing-based token enumeration attacks.
		const rows = await knex("integration").where({ enabled: 1 }).select("id", "token");
		const tokenBuf = Buffer.from(token);
		let matchedId = null;
		for (const row of rows) {
			const rowBuf = Buffer.from(String(row.token));
			if (rowBuf.length === tokenBuf.length && crypto.timingSafeEqual(rowBuf, tokenBuf)) {
				matchedId = row.id;
				break;
			}
		}
		if (!matchedId) return false;
		// Record last used timestamp (best-effort, non-blocking).
		knex("integration")
			.where({ id: matchedId })
			.update({ last_used_at: new Date().toISOString() })
			.catch(() => {});
		return true;
	},
};

// ── Metrics collector ──────────────────────────────────────────────────────────
// Some production datasets take longer than Prometheus' default scrape timeout to
// aggregate. Cache the rendered exposition briefly and refresh stale data in the
// background so dashboards stay live even while heavier DB queries are running.

const METRICS_CACHE_TTL_MS=15000;
let metricsCache={body:'',expiresAt:0,refreshing:null};
export async function collectMetrics(knex){
 if(metricsCache.body&&Date.now()<metricsCache.expiresAt)return metricsCache.body;
 if(!metricsCache.refreshing)metricsCache.refreshing=collectMetricsUncached(knex).then(body=>{metricsCache.body=body;metricsCache.expiresAt=Date.now()+METRICS_CACHE_TTL_MS;return body}).finally(()=>{metricsCache.refreshing=null});
 return metricsCache.refreshing;
}
async function collectMetricsUncached(knex) {
 const lines=[],families=new Set();let failures=0;const now=Date.now(),cutoff=closedCutoff(now);
 const source=(family,up)=>{push('nyxguard_history_source_up','Historical source query succeeded in this generation','gauge',[{labels:{family},value:up?1:0}]);if(up){push('nyxguard_history_evaluation_cutoff_seconds','Closed UTC evaluation boundary; not a committed collector watermark','gauge',[{labels:{family},value:cutoff/1000}]);for(const {label,hours} of HISTORY_WINDOWS){push('nyxguard_history_interval_start_seconds','Requested observation interval start inclusive','gauge',[{labels:{family,window:label},value:cutoff/1000-hours*3600}]);push('nyxguard_history_complete','Continuity is unverified; exact retained observations only','gauge',[{labels:{family,window:label},value:0}]);}}};
 const escapeLabel=v=>String(v).replace(/\\/g,'\\\\').replace(/\n/g,'\\n').replace(/"/g,'\\"');
 const push=(name,help,type,samples)=>{
  if(!families.has(name)){lines.push(`# HELP ${name} ${help}`,`# TYPE ${name} ${type}`);families.add(name);}
  for(const {labels,value} of samples){if(!Number.isFinite(Number(value))||(Number.isInteger(Number(value))&&!Number.isSafeInteger(Number(value))))throw Error('Metric outside exact numeric range');const lbl=labels&&Object.keys(labels).length?`{${Object.entries(labels).map(([k,v])=>`${k}="${escapeLabel(v)}"`).join(',')}}`:'';lines.push(`${name}${lbl} ${value}`);}
  if(type==='gauge'&&name.endsWith('_total'))push(name.slice(0,-6),help+' (preferred gauge name)',type,samples);
 };

	// ── Protected hosts ──────────────────────────────────────────────────────
	try {
		const hosts = await knex("proxy_host").where("is_deleted", 0).select("id", "meta");
  const [protectedRow]=await knex('nyxguard_app').join('proxy_host','nyxguard_app.proxy_host_id','proxy_host.id').where('proxy_host.is_deleted',0).where('nyxguard_app.waf_enabled',1).countDistinct('proxy_host.id as cnt');
  const wafOn=Number(protectedRow.cnt);

		push(
			"nyxguard_proxy_hosts_total",
			"Total number of proxy hosts",
			"gauge",
			[{ value: hosts.length }],
		);
		push(
			"nyxguard_protected_hosts_total",
			"Number of proxy hosts with WAF protection enabled",
			"gauge",
			[{ value: wafOn }],
		);
	} catch { failures++; }

 // SQL-bounded deterministic top-20 per window; no per-IP results outside top N.
 try {
  const rows=await attackRanks(knex,cutoff);
  for(const r of rows){
   if(r.group==='host')push('nyxguard_attacks_by_host','Retained attacks per host by closed window','gauge',[{labels:{host:r.host||'unknown',window:r.label},value:r.n}]);
   else push('nyxguard_attacks_by_ip','Retained attacks per IP and type by closed window','gauge',[{labels:{ip:r.ip||'unknown',type:r.attack_type||'unknown',window:r.label},value:r.n}]);
  }
  source('attack_ranking',true);
 }catch{failures++;source('attack_ranking',false);}

	// ── Per-app WAF status ────────────────────────────────────────────────────
	try {
		const apps = await knex("nyxguard_app")
			.join("proxy_host", "nyxguard_app.proxy_host_id", "proxy_host.id")
			.where("proxy_host.is_deleted", 0)
			.select("proxy_host.id", "proxy_host.domain_names", "nyxguard_app.waf_enabled", "proxy_host.meta");
		for (const a of apps) {
			let name = "";
			try { const m = JSON.parse(a.meta || "{}"); name = m.nyxguard_app_name || ""; } catch { /* */ }
			if (!name) {
				try { name = JSON.parse(a.domain_names)[0] || "unknown"; } catch { name = "unknown"; }
			}
			push("nyxguard_app_waf_enabled", "Per-app WAF protection status", "gauge",
				[{ labels: { app: name,host_id:String(a.id) }, value: a.waf_enabled ? 1 : 0 }]);
		}
	} catch { failures++; }

	// ── Per-app traffic stats ─────────────────────────────────────────────────
	try {
		// Build a map: proxy_host_id → app name (from nyxguard_app join or proxy_host)
		const allHosts = await knex("proxy_host")
			.where({ is_deleted: 0 })
			.select("id", "domain_names", "meta");
		const hostNameById = new Map();
		for (const h of allHosts) {
			let name = "";
			try { const m = JSON.parse(h.meta || "{}"); name = m.nyxguard_app_name || ""; } catch { /* */ }
			if (!name) {
				try { name = JSON.parse(h.domain_names)[0] || `host-${h.id}`; } catch { name = `host-${h.id}`; }
			}
			hostNameById.set(h.id, name);
		}

  const traffic=await trafficBands(knex,cutoff);
  for(const {label,hours} of TRAFFIC_WINDOWS){
   const interval=alignedTrafficWindow(hours,cutoff);
   push('nyxguard_traffic_window_start_seconds','UTC closed-bucket interval start inclusive','gauge',[{labels:{window:label},value:interval.start/1000}]);
   push('nyxguard_traffic_window_end_seconds','UTC closed-bucket interval end exclusive','gauge',[{labels:{window:label},value:interval.end/1000}]);
   const rows=traffic.get(label);
   // Existing legacy history is unverified: an absent row cannot prove zero.
   push('nyxguard_traffic_history_complete','Legacy rollup continuity is not proven (0=unverified)','gauge',[{labels:{window:label},value:0}]);

			for (const r of rows) {
				const app = hostNameById.get(r.proxy_host_id) ?? `host-${r.proxy_host_id}`;
				const lbl = { app, host_id:String(r.proxy_host_id), window: label };
				push("nyxguard_app_requests_total", "Total HTTP requests per app by window", "gauge",
					[{ labels: lbl, value: Number(r.req ?? 0) }]);
				push("nyxguard_app_bytes_in_total", "Total bytes received per app by window", "gauge",
					[{ labels: lbl, value: Number(r.bin ?? 0) }]);
				push("nyxguard_app_bytes_out_total", "Total bytes sent per app by window", "gauge",
					[{ labels: lbl, value: Number(r.bout ?? 0) }]);
				push("nyxguard_app_status_2xx_total", "HTTP 2xx responses per app by window", "gauge",
					[{ labels: lbl, value: Number(r.s2 ?? 0) }]);
    push("nyxguard_app_status_3xx_total","HTTP 3xx responses per app by closed-bucket window","gauge",[{labels:lbl,value:Number(r.s3??0)}]);
    push("nyxguard_app_status_other_total","HTTP 1xx or missing final status per app by closed-bucket window","gauge",[{labels:lbl,value:Number(r.req)-Number(r.s2)-Number(r.s3)-Number(r.s4)-Number(r.s5)}]);
				push("nyxguard_app_status_4xx_total", "HTTP 4xx responses per app by window", "gauge",
					[{ labels: lbl, value: Number(r.s4 ?? 0) }]);
				push("nyxguard_app_status_5xx_total", "HTTP 5xx responses per app by window", "gauge",
					[{ labels: lbl, value: Number(r.s5 ?? 0) }]);
			}
		}
  source('traffic',true);
	} catch { failures++;source('traffic',false); }

	// ── IP/Country rules ──────────────────────────────────────────────────────
	try {
		const [ipAllow] = await knex("nyxguard_ip_rule").where({ action: "allow", enabled: 1 }).count("* as cnt");
		const [ipDeny] = await knex("nyxguard_ip_rule").where({ action: "deny", enabled: 1 }).count("* as cnt");
		push("nyxguard_ip_rules_total", "IP rules by action", "gauge", [
			{ labels: { action: "allow" }, value: Number(ipAllow?.cnt ?? 0) },
			{ labels: { action: "deny" }, value: Number(ipDeny?.cnt ?? 0) },
		]);
		const [countryAllow] = await knex("nyxguard_country_rule").where({ action: "allow", enabled: 1 }).count("* as cnt");
		const [countryDeny] = await knex("nyxguard_country_rule").where({ action: "deny", enabled: 1 }).count("* as cnt");
		push("nyxguard_country_rules_total", "Country rules by action", "gauge", [
			{ labels: { action: "allow" }, value: Number(countryAllow?.cnt ?? 0) },
			{ labels: { action: "deny" }, value: Number(countryDeny?.cnt ?? 0) },
		]);
	} catch { failures++; }

 try{
  const rows=await attackBands(knex,cutoff);
  for(const {label,types,total,unique} of rows){
   for(const type of new Set(['bot','ddos','sqli','authfail',...types.keys()]))push('nyxguard_attacks_total','Retained attack detections by type and closed window','gauge',[{labels:{type,window:label},value:types.get(type)||0}]);
   push('nyxguard_attacks_window_total','Retained detections in closed window; continuity unverified','gauge',[{labels:{window:label},value:total}]);
   push('nyxguard_unique_attacking_ips','Exact distinct retained non-null IPs across the entire closed window','gauge',[{labels:{window:label},value:unique}]);
  }
  source('attacks',true);
 }catch{failures++;source('attacks',false);}

	// ── Attack counters (ever-increasing, for Grafana increase()[$__range]) ────
	// These retained-row values are gauges, not lifetime counters. Never use
	// compute increase() over any time range the user selects.
	try {
		const ATTACK_TYPES = ["bot", "ddos", "sqli", "authfail"];
		const allRows = await knex("nyxguard_attack_event")
			.select("attack_type")
			.count("* as cnt")
			.groupBy("attack_type");
		const allByType = {};
		for (const r of allRows) allByType[r.attack_type || "unknown"] = Number(r.cnt);
		const allTimeSamples = ATTACK_TYPES.map((type) => ({
			labels: { type },
			value: allByType[type] ?? 0,
		}));
		// Also include any unexpected types
		for (const [type, cnt] of Object.entries(allByType)) {
			if (!ATTACK_TYPES.includes(type)) allTimeSamples.push({ labels: { type }, value: cnt });
		}
		push(
			"nyxguard_attacks_created_total",
			"Retained attack event rows by type; gauge, not cumulative",
			"gauge",
			allTimeSamples,
		);
		// Grand total counter (all types combined)
		const [grandTotal] = await knex("nyxguard_attack_event").count("* as cnt");
		push(
			"nyxguard_attacks_all_created_total",
			"Retained attack event rows; gauge, not cumulative",
			"gauge",
			[{ value: Number(grandTotal?.cnt ?? 0) }],
		);
	} catch { failures++; }

	// ── Retained automatic rules (gauges) ─────────────────────────────────────
	try {
		const [banTotal] = await knex("nyxguard_ip_rule").where("action", "deny").where("rule_origin","automatic_ban").count("* as cnt");
		push(
			"nyxguard_bans_created_total",
			"Retained auto-ban deny rules; gauge, not cumulative",
			"gauge",
			[{ value: Number(banTotal?.cnt ?? 0) }],
		);
	} catch { failures++; }

	// ── Active bans ───────────────────────────────────────────────────────────
	try {
		const [banRow] = await knex("nyxguard_ip_rule")
			.where({ action: "deny", enabled: 1 }).where(q=>q.whereNull("expires_on").orWhere("expires_on",">",utcSql(now)))
			.count("* as cnt");
		push(
			"nyxguard_active_bans_total",
			"Enabled non-expired IP deny rules (manual and automatic)",
			"gauge",
			[{ value: Number(banRow?.cnt ?? 0) }],
		);
	} catch { failures++; }

 try{
  const rows=await automaticBands(knex,cutoff);
  for(const {label,n} of rows)push('nyxguard_auto_bans_total','Retained automatic deny rules created in closed window; deleted rules are absent','gauge',[{labels:{window:label},value:n}]);
  source('automatic_rules',true);
 }catch{failures++;source('automatic_rules',false);}

	// ── WAF custom rules ──────────────────────────────────────────────────────
	try {
		const [total] = await knex("nyxguard_waf_rule").count("* as cnt");
		const [enabled] = await knex("nyxguard_waf_rule").where({ enabled: 1 }).count("* as cnt");
		push("nyxguard_waf_rules_total", "Total WAF custom rules defined", "gauge",
			[{ value: Number(total?.cnt ?? 0) }]);
		push("nyxguard_waf_rules_enabled", "WAF custom rules currently enabled", "gauge",
			[{ value: Number(enabled?.cnt ?? 0) }]);
	} catch { failures++; }

	// ── SSL certificates expiring ─────────────────────────────────────────────
	try {
		const soon = new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString().slice(0, 10);
		const [expiring] = await knex("certificate")
			.where("is_deleted", 0)
			.where("expires_on", ">", utcSql(now)).where("expires_on", "<=", utcSql(now+30*86400000))
			.count("* as cnt");
		const [total] = await knex("certificate").where("is_deleted", 0).count("* as cnt");
		push("nyxguard_ssl_certs_total", "Total SSL certificates managed", "gauge",
			[{ value: Number(total?.cnt ?? 0) }]);
		push("nyxguard_ssl_certs_expiring_soon", "SSL certificates expiring within 30 days", "gauge",
			[{ value: Number(expiring?.cnt ?? 0) }]);
	} catch { failures++; }

	// ── NyxGuard global settings ──────────────────────────────────────────────
	try {
		const effective = await nativeSettings.get(knex);
        const row = {bot_defense_enabled:effective.botDefenseEnabled,ddos_enabled:effective.ddosEnabled,sqli_enabled:effective.sqliEnabled,auth_bypass_enabled:effective.authBypassEnabled};
		if (row) {
			push("nyxguard_setting_bot_defense_enabled", "Bot defense global toggle (1=on, 0=off)", "gauge",
				[{ value: row.bot_defense_enabled ? 1 : 0 }]);
			push("nyxguard_setting_ddos_enabled", "DDoS shield global toggle (1=on, 0=off)", "gauge",
				[{ value: row.ddos_enabled ? 1 : 0 }]);
			push("nyxguard_setting_sqli_enabled", "SQL shield global toggle (1=on, 0=off)", "gauge",
				[{ value: row.sqli_enabled ? 1 : 0 }]);
			push("nyxguard_setting_auth_bypass_enabled", "Auth bypass global toggle (1=on, 0=off)", "gauge",
				[{ value: row.auth_bypass_enabled ? 1 : 0 }]);
		}
	} catch { failures++; }

	// ── Blocked countries ─────────────────────────────────────────────────────
	try {
		const [r] = await knex("nyxguard_country_rule").where({ action: "deny", enabled: 1 }).where(q=>q.whereNull("expires_on").orWhere("expires_on",">",utcSql(now))).countDistinct("country_code as cnt");
		push("nyxguard_blocked_countries_total", "Number of unique countries with active deny rules", "gauge",
			[{ value: Number(r?.cnt ?? 0) }]);
	} catch { failures++; }

	// ── Users ─────────────────────────────────────────────────────────────────
	try {
		const [r] = await knex("user").where({ is_deleted: 0 }).count("* as cnt");
		push("nyxguard_users_total", "Total number of user accounts", "gauge",
			[{ value: Number(r?.cnt ?? 0) }]);
	} catch { failures++; }

 // A failed or stale enforcement collector cannot provide a current zero.
 try{
  const state=await knex('nyxguard_blocked_state').where({id:1}).first();
  const ready=securitySourceReady(state,Date.now());
  push('nyxguard_security_events_source_up','Native enforcement observation collector ready and fresh','gauge',[{value:ready?1:0}]);
  push('nyxguard_security_events_history_complete','Continuity unverified; configured retention and row cap still apply','gauge',[{value:0}]);
  if(!ready)throw Error('Enforcement source unavailable');
  const rows=await enforcementBands(knex,cutoff);
  for(const {label,country,waf_rule} of rows){
   push('nyxguard_country_denies_observed','Retained country enforcement observations in closed window; continuity unverified','gauge',[{labels:{window:label},value:country}]);
   push('nyxguard_country_denies_history_complete','Continuity is unverified; retention and row cap still apply','gauge',[{labels:{window:label},value:0}]);
   push('nyxguard_waf_rule_blocks_observed','Retained first-match custom WAF enforcement observations in closed window','gauge',[{labels:{window:label},value:waf_rule}]);
  }
  source('enforcement',true);
 }catch{failures++;source('enforcement',false);}
 const portalHealth=portalAuditHealth();
 push('nyxguard_access_portal_audit_write_failures_total','Failed native access decision audit writes since process start','counter',[{value:portalHealth.failures}]);
 push('nyxguard_access_portal_security_rejections_source_up','Native access decision audit writes healthy','gauge',[{value:portalHealth.healthy?1:0}]);
 // Only a denied signed-session verification at the native check endpoint qualifies.
 try {
  if(!portalHealth.healthy)throw Error('Access decision audit writes degraded');
  const rows=await portalBands(knex,cutoff);
  for(const {label,n} of rows)push('nyxguard_access_portal_security_rejections_observed','Retained signature or cross-scope portal rejections; excludes missing, expired and login events','gauge',[{labels:{window:label},value:n}]);
  source('portal',true);
 }catch{failures++;source('portal',false);}
 for(const {label,hours} of HISTORY_WINDOWS)push('nyxguard_monitoring_window_days','Supported fixed elapsed observation duration in days','gauge',[{labels:{window:label},value:hours/24}]);
 const states=await knex('nyxguard_traffic_state').select('integrity');
 let gaps=0,rejected=0,missing=0;for(const row of states){const m=JSON.parse(row.integrity||'{}');gaps+=m.gaps||0;rejected+=m.rejected||0;missing+=m.missing?1:0;}
 push('nyxguard_metrics_contract_version','Validated metric semantics contract version','gauge',[{value:1}]);
 push('nyxguard_metric_supported','Instrumentation availability; zero is not an event count','gauge',['waf_rule_blocks','auth_bypass_hits'].map(family=>({labels:{family},value:1})));
 push('nyxguard_collector_gaps','Detected unrecoverable source generation or partial-record gaps','gauge',[{value:gaps}]);
 push('nyxguard_collector_rejected_records','Rejected malformed complete records since integrity tracking began','gauge',[{value:rejected}]);
 push('nyxguard_collector_missing_sources','Tracked log paths currently missing','gauge',[{value:missing}]);
 push('nyxguard_metrics_source_failures','Failed source groups in this generation','gauge',[{value:failures}]);
 push('nyxguard_metrics_generated_timestamp_seconds','Generation time; stale bodies are not served after cache expiry','gauge',[{value:now/1000}]);
 return lines.join("\n") + "\n";
}
