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
 const lines=[],families=new Set();let failures=0;const now=Date.now();
 const escapeLabel=v=>String(v).replace(/\\/g,'\\\\').replace(/\n/g,'\\n').replace(/"/g,'\\"');
 const push=(name,help,type,samples)=>{
  if(!families.has(name)){lines.push(`# HELP ${name} ${help}`,`# TYPE ${name} ${type}`);families.add(name);}
  for(const {labels,value} of samples){if(!Number.isFinite(Number(value))||(Number.isInteger(Number(value))&&!Number.isSafeInteger(Number(value))))throw Error('Metric outside exact numeric range');const lbl=labels&&Object.keys(labels).length?`{${Object.entries(labels).map(([k,v])=>`${k}="${escapeLabel(v)}"`).join(',')}}`:'';lines.push(`${name}${lbl} ${value}`);}
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

	// ── Per-host and per-IP attack counts (all windows) ─────────────────────
	try {
		const attackWindows = [
			{ label: "24h", hours: 24 },
			{ label: "7d", hours: 168 },
			{ label: "30d", hours: 720 },
			{ label: "90d", hours: 2160 },
		];
		for (const { label, hours } of attackWindows) {
			const since = utcSql(now - hours * 3600 * 1000);
			// Top attacked hosts
			const hostRows = await knex("nyxguard_attack_event")
				.where("created_on", ">=", since).where("created_on", "<", utcSql(now))
				.select("host")
				.count("* as cnt")
				.groupBy("host")
				.orderBy("cnt", "desc")
				.limit(20);
			for (const r of hostRows) {
				push("nyxguard_attacks_by_host", "Attacks per host by window", "gauge",
					[{ labels: { host: r.host || "unknown", window: label }, value: Number(r.cnt) }]);
			}
			// Top attacking IPs
			const ipRows = await knex("nyxguard_attack_event")
				.where("created_on", ">=", since).where("created_on", "<", utcSql(now))
				.select("ip", "attack_type")
				.count("* as cnt")
				.groupBy("ip", "attack_type")
				.orderBy("cnt", "desc")
				.limit(20);
			for (const r of ipRows) {
				push("nyxguard_attacks_by_ip", "Attacks per source IP by window", "gauge",
					[{ labels: { ip: r.ip || "unknown", type: r.attack_type || "unknown", window: label }, value: Number(r.cnt) }]);
			}
		}
	} catch { failures++; }

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

		// Traffic windows
		const trafficWindows = [
			{ label: "1h",  hours: 1 },
			{ label: "24h", hours: 24 },
			{ label: "7d",  hours: 168 },
			{ label: "30d", hours: 720 },
   { label: "90d", hours:2160 }, {label:"180d",hours:4320},
		];

		for (const { label, hours } of trafficWindows) {
			const interval=alignedTrafficWindow(hours,now);
   push("nyxguard_traffic_window_start_seconds","UTC closed-bucket interval start inclusive","gauge",[{labels:{window:label},value:interval.start/1000}]);
   push("nyxguard_traffic_window_end_seconds","UTC closed-bucket interval end exclusive","gauge",[{labels:{window:label},value:interval.end/1000}]);
			const rows = await knex("nyxguard_traffic_stat")
				.where("bucket", ">=", interval.startSql).where("bucket", "<", interval.endSql)
				.select("proxy_host_id")
				.sum("requests as req")
				.sum("bytes_in as bin")
				.sum("bytes_out as bout")
				.sum("status_2xx as s2")
				.sum("status_3xx as s3")
				.sum("status_4xx as s4")
				.sum("status_5xx as s5")
				.groupBy("proxy_host_id");

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
	} catch { failures++; }

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

	// ── Attack events (last 24h / 7d / 30d / 90d) ────────────────────────────
	try {
		const ATTACK_TYPES = ["bot", "ddos", "sqli", "authfail"];
		const windows = [
			{ label: "24h", hours: 24 },
			{ label: "7d", hours: 168 },
			{ label: "30d", hours: 720 },
			{ label: "90d", hours: 2160 },
		];
		for (const { label, hours } of windows) {
			const since = utcSql(now - hours * 3600 * 1000);
			const rows = await knex("nyxguard_attack_event")
				.where("created_on", ">=", since).where("created_on", "<", utcSql(now))
				.select("attack_type")
				.count("* as cnt")
				.groupBy("attack_type");
			// Build a map for quick lookup, then emit zero for all known types
			const countByType = {};
			for (const r of rows) countByType[r.attack_type || "unknown"] = Number(r.cnt);
			for (const type of ATTACK_TYPES) {
				push(
					"nyxguard_attacks_total",
					"Number of attacks detected by type and window",
					"gauge",
					[{ labels: { type, window: label }, value: countByType[type] ?? 0 }],
				);
			}
			// Also emit any unknown types that appeared
			for (const [type, cnt] of Object.entries(countByType)) {
				if (!ATTACK_TYPES.includes(type)) {
					push("nyxguard_attacks_total", "Number of attacks detected by type and window", "gauge",
						[{ labels: { type, window: label }, value: cnt }]);
				}
			}
			// Total across all types for this window
			const [total] = await knex("nyxguard_attack_event")
				.where("created_on", ">=", since).where("created_on", "<", utcSql(now))
				.count("* as cnt");
			push(
				"nyxguard_attacks_window_total",
				"Total attacks detected in window",
				"gauge",
				[{ labels: { window: label }, value: Number(total?.cnt ?? 0) }],
			);
		}
	} catch { failures++; }

	// ── Attack counters (ever-increasing, for Grafana increase()[$__range]) ────
	// These are TYPE=counter: the value is the all-time total, so Prometheus can
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

	// ── Auto-ban counters (ever-increasing) ───────────────────────────────────
	try {
		const [banTotal] = await knex("nyxguard_ip_rule").where("action", "deny").where("note","like","Auto-ban:%").count("* as cnt");
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

	// ── Auto-ban events (last 24h / 7d / 30d / 90d) ──────────────────────────
	try {
		const windows = [
			{ label: "24h", hours: 24 },
			{ label: "7d", hours: 168 },
			{ label: "30d", hours: 720 },
			{ label: "90d", hours: 2160 },
		];
		for (const { label, hours } of windows) {
			const since = utcSql(now - hours * 3600 * 1000);
			// Auto-bans = IP rules with action=deny created in this window (system notes)
			const [r] = await knex("nyxguard_ip_rule")
				.where("action", "deny").where("note","like","Auto-ban:%")
				.where("created_on", ">=", since).where("created_on", "<", utcSql(now))
				.count("* as cnt");
			push(
				"nyxguard_auto_bans_total",
				"Number of auto-ban IP rules created in window",
				"gauge",
				[{ labels: { window: label }, value: Number(r?.cnt ?? 0) }],
			);
		}
	} catch { failures++; }

	// ── Unique attacking IPs (last 24h / 7d / 30d / 90d) ─────────────────────
	try {
		const windows = [
			{ label: "24h", hours: 24 },
			{ label: "7d", hours: 168 },
			{ label: "30d", hours: 720 },
			{ label: "90d", hours: 2160 },
		];
		for (const { label, hours } of windows) {
			const since = utcSql(now - hours * 3600 * 1000);
			const [r] = await knex("nyxguard_attack_event")
				.where("created_on", ">=", since).where("created_on", "<", utcSql(now))
				.countDistinct("ip as cnt");
			push(
				"nyxguard_unique_attacking_ips",
				"Number of unique attacking IP addresses by window",
				"gauge",
				[{ labels: { window: label }, value: Number(r?.cnt ?? 0) }],
			);
		}
	} catch { failures++; }

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
		const row = await knex("nyxguard_settings").where({ id: 1 }).first();
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
		const [r] = await knex("nyxguard_country_rule").where({ action: "deny", enabled: 1 }).countDistinct("country_code as cnt");
		push("nyxguard_blocked_countries_total", "Number of unique countries with active deny rules", "gauge",
			[{ value: Number(r?.cnt ?? 0) }]);
	} catch { failures++; }

	// ── Users ─────────────────────────────────────────────────────────────────
	try {
		const [r] = await knex("user").where({ is_deleted: 0 }).count("* as cnt");
		push("nyxguard_users_total", "Total number of user accounts", "gauge",
			[{ value: Number(r?.cnt ?? 0) }]);
	} catch { failures++; }

	// Dedicated country-deny observations reuse Task 4's actual enforcement records.
 try{
  const end=Math.floor(now/1000);
  for(const [window,hours]of [['24h',24],['7d',168],['30d',720],['90d',2160]]){
   const start=end-hours*3600;
   const edge=Array.from({length:60},(_,i)=>`IF(minute+${i}>=${start} AND minute+${i}<${end},COALESCE(JSON_VALUE(vector,'$[${i}]'),0),0)`).join('+');
   const [rows]=await knex.raw(`SELECT COALESCE(SUM(IF(minute>=${start} AND minute+60<=${end},requests,${edge})),0) AS n FROM nyxguard_blocked_bucket WHERE reason='country' AND minute>=${Math.floor(start/60)*60} AND minute<${end}`);
   push('nyxguard_country_denies_observed','Retained country-policy HTTP 403 enforcement observations; history incomplete, retention 30d','gauge',[{labels:{window},value:Number(rows[0].n)}]);
   push('nyxguard_country_denies_history_complete','Continuity is not proven; 90d exceeds 30d source retention','gauge',[{labels:{window},value:0}]);
  }
 }catch{failures++;}
 const states=await knex('nyxguard_traffic_state').select('integrity');
 let gaps=0,rejected=0,missing=0;for(const row of states){const m=JSON.parse(row.integrity||'{}');gaps+=m.gaps||0;rejected+=m.rejected||0;missing+=m.missing?1:0;}
 push('nyxguard_metrics_contract_version','Validated metric semantics contract version','gauge',[{value:1}]);
 push('nyxguard_metric_supported','Instrumentation availability; zero is not an event count','gauge',['waf_rule_blocks','auth_bypass_hits'].map(family=>({labels:{family},value:0})));
 push('nyxguard_collector_gaps','Detected unrecoverable source generation or partial-record gaps','gauge',[{value:gaps}]);
 push('nyxguard_collector_rejected_records','Rejected malformed complete records since integrity tracking began','gauge',[{value:rejected}]);
 push('nyxguard_collector_missing_sources','Tracked log paths currently missing','gauge',[{value:missing}]);
 push('nyxguard_metrics_source_failures','Failed source groups in this generation','gauge',[{value:failures}]);
 push('nyxguard_metrics_generated_timestamp_seconds','Generation time; stale bodies are not served after cache expiry','gauge',[{value:now/1000}]);
 return lines.join("\n") + "\n";
}
