import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
	getNyxGuardApps,
	getNyxGuardAppsSummary,
	getNyxGuardAttacksSummary,
	getNyxGuardCountryRules,
	getNyxGuardIps,
	getNyxGuardIpRules,
	getNyxGuardSettings,
	getNyxGuardGeoip,
	getNyxGuardSummary,
} from "src/api/backend";
import { useHostReport } from "src/hooks";
import styles from "./index.module.css";

function formatBytes(bytes: number) {
	if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
	const units = ["B", "KB", "MB", "GB", "TB"];
	let n = bytes;
	let u = 0;
	while (n >= 1024 && u < units.length - 1) {
		n /= 1024;
		u += 1;
	}
	const digits = u === 0 ? 0 : n >= 100 ? 0 : n >= 10 ? 1 : 2;
	return `${n.toFixed(digits)} ${units[u]}`;
}

function trafficWindowLabel(minutes: number) {
	if (minutes === 5) return "5 minutes";
	if (minutes === 15) return "15 minutes";
	if (minutes === 1440) return "24 hours";
	if (minutes === 10080) return "7 days";
	if (minutes === 43200) return "30 days";
	return `${minutes} minutes`;
}

function attackTypeLabel(t: string | null | undefined) {
	if (t === "sqli") return "SQL";
	if (t === "ddos") return "DDoS";
	if (t === "bot") return "Bot";
	return "Unknown";
}

function formatPercent(v: number | null | undefined) {
	if (typeof v !== "number" || !Number.isFinite(v)) return "N/A";
	return `${v.toFixed(1)}%`;
}

const NyxGuard = () => {
	const [windowMinutes, setWindowMinutes] = useState(1440);
	const [trafficWindowMinutes, setTrafficWindowMinutes] = useState(5);
	const trafficLimit = useMemo(() => (trafficWindowMinutes >= 1440 ? 500 : 50), [trafficWindowMinutes]);
	const hostReport = useHostReport();

	const exportDecisionEvents = () => {
		const recent = trafficSummary.data?.recent ?? [];
		if (!recent.length) return;

		const ts = new Date().toISOString().replace(/[:.]/g, "-");
		const blob = new Blob([JSON.stringify(recent, null, 2)], { type: "application/json" });
		const url = URL.createObjectURL(blob);
		const a = document.createElement("a");
		a.href = url;
		a.download = `nyxguard-events-${ts}.json`;
		document.body.appendChild(a);
		a.click();
		a.remove();
		setTimeout(() => URL.revokeObjectURL(url), 1000);
	};

	const summary = useQuery({
		queryKey: ["nyxguard", "summary", windowMinutes],
		queryFn: () => getNyxGuardSummary(windowMinutes, 50),
		refetchInterval: windowMinutes <= 60 ? 5000 : 60000,
	});

	const trafficSummary = useQuery({
		queryKey: ["nyxguard", "summary", "recent", trafficWindowMinutes, trafficLimit],
		queryFn: () => getNyxGuardSummary(trafficWindowMinutes, trafficLimit),
		refetchInterval: trafficWindowMinutes <= 15 ? 3000 : trafficWindowMinutes <= 1440 ? 15000 : 60000,
	});

	const attacksSummary = useQuery({
		queryKey: ["nyxguard", "attacks", "summary", windowMinutes],
		queryFn: () => getNyxGuardAttacksSummary(windowMinutes),
		refetchInterval: windowMinutes <= 60 ? 15000 : 60000,
	});

	const settings = useQuery({
		queryKey: ["nyxguard", "settings"],
		queryFn: () => getNyxGuardSettings(),
		refetchInterval: 15000,
	});

	const geoip = useQuery({
		queryKey: ["nyxguard", "geoip"],
		queryFn: () => getNyxGuardGeoip(),
		refetchInterval: 60000,
	});

	const appsSummary = useQuery({
		queryKey: ["nyxguard", "apps", "summary"],
		queryFn: () => getNyxGuardAppsSummary(),
		refetchInterval: 15000,
	});

	const apps = useQuery({
		queryKey: ["nyxguard", "apps"],
		queryFn: () => getNyxGuardApps(),
		refetchInterval: 15000,
	});

	const ips = useQuery({
		queryKey: ["nyxguard", "ips", "insights", windowMinutes],
		queryFn: () => getNyxGuardIps(windowMinutes, windowMinutes >= 10080 ? 400 : 200),
		refetchInterval: windowMinutes <= 60 ? 15000 : 60000,
	});

	const countryRules = useQuery({
		queryKey: ["nyxguard", "rules", "country"],
		queryFn: () => getNyxGuardCountryRules(),
		refetchInterval: 15000,
	});

	const ipRules = useQuery({
		queryKey: ["nyxguard", "rules", "ip"],
		queryFn: () => getNyxGuardIpRules(),
		refetchInterval: 15000,
	});

	const statValue = (v?: number) => (typeof v === "number" ? v.toLocaleString() : "Waiting for data…");
	const statBytes = (v?: number) => (typeof v === "number" ? formatBytes(v) : "Waiting for data…");

	const requests = summary.data?.requests;
	const blocked = summary.data?.blocked;
	const allowed = summary.data?.allowed;
	const uniqueIps = summary.data?.uniqueIps;
	const rxBytes = summary.data?.rxBytes;
	const txBytes = summary.data?.txBytes;
	const botDefenseEnabled = settings.data?.botDefenseEnabled ?? false;
	const ddosEnabled = settings.data?.ddosEnabled ?? false;
	const sqliEnabled = settings.data?.sqliEnabled ?? false;
	const authBypassEnabled = settings.data?.authBypassEnabled ?? true;

	const attacksCardMain = useMemo(() => {
		if (attacksSummary.isLoading) return "Loading…";
		if (attacksSummary.isError) return "Unavailable";
		const lastType = attacksSummary.data?.last?.type;
		return lastType ? attackTypeLabel(lastType) : "None";
	}, [attacksSummary.data?.last?.type, attacksSummary.isError, attacksSummary.isLoading]);

	const attacksCardSub = useMemo(() => {
		if (attacksSummary.isLoading || attacksSummary.isError) return "Open Attacks";
		const total = attacksSummary.data?.total ?? 0;
		const byType = attacksSummary.data?.byType;
		const parts = [
			`Total: ${Number.isFinite(total) ? total.toLocaleString() : String(total)}`,
			byType ? `SQL ${byType.sqli ?? 0}  DDoS ${byType.ddos ?? 0}  Bot ${byType.bot ?? 0}` : null,
		].filter(Boolean);
		return parts.join(" | ");
	}, [attacksSummary.data?.byType, attacksSummary.data?.total, attacksSummary.isError, attacksSummary.isLoading]);

	const geoSourcesLabel = useMemo(() => {
		const p = geoip.data?.providers;
		const hasMax = !!p?.maxmind?.installed || !!geoip.data?.installed; // installed is legacy MaxMind field
		const hasIp2 = !!p?.ip2location?.installed;
		if (hasMax && hasIp2) return "GeoLite2 + IP2Location (local DBs)";
		if (hasMax) return "GeoLite2 (local DB)";
		if (hasIp2) return "IP2Location (local DB)";
		return "Not installed";
	}, [geoip.data]);

	const hostSystem = hostReport.data?.system;
	const hostContainer = hostSystem?.container;

	const ipInsights = useMemo(() => {
		const items = ips.data?.items ?? [];
		if (!items.length) {
			return {
				totalUniqueIps: 0,
				totalRequests: 0,
				totalBlocked: 0,
				blockedRate: 0,
				topCountries: [] as Array<{
					country: string;
					ips: number;
					requests: number;
					blocked: number;
				}>,
				topBlockedIps: [] as Array<{ ip: string; blocked: number; requests: number; country: string | null }>,
			};
		}

		let totalRequests = 0;
		let totalBlocked = 0;

		const byCountry = new Map<
			string,
			{ country: string; ips: number; requests: number; blocked: number }
		>();

		for (const it of items) {
			totalRequests += it.requests ?? 0;
			totalBlocked += it.blocked ?? 0;

			const countryKey = (it.country ?? "Unknown").toUpperCase();
			const cur = byCountry.get(countryKey) ?? {
				country: countryKey === "UNKNOWN" ? "Unknown" : countryKey,
				ips: 0,
				requests: 0,
				blocked: 0,
			};
			cur.ips += 1;
			cur.requests += it.requests ?? 0;
			cur.blocked += it.blocked ?? 0;
			byCountry.set(countryKey, cur);
		}

		const topCountries = Array.from(byCountry.values())
			.sort((a, b) => (b.requests - a.requests) || (b.blocked - a.blocked) || (b.ips - a.ips))
			.slice(0, 5);

		const topBlockedIps = [...items]
			.sort((a, b) => (b.blocked - a.blocked) || (b.requests - a.requests))
			.slice(0, 3)
			.map((it) => ({ ip: it.ip, blocked: it.blocked, requests: it.requests, country: it.country }));

		return {
			totalUniqueIps: items.length,
			totalRequests,
			totalBlocked,
			blockedRate: totalRequests > 0 ? totalBlocked / totalRequests : 0,
			topCountries,
			topBlockedIps,
		};
	}, [ips.data?.items]);

	const appsOverview = useMemo(() => {
		const items = apps.data?.items ?? [];
		const totalApps = typeof appsSummary.data?.totalApps === "number" ? appsSummary.data.totalApps : items.length;
		const protectedCount =
			typeof appsSummary.data?.protectedCount === "number"
				? appsSummary.data.protectedCount
				: items.filter((it) => !!it.wafEnabled).length;
		const monitoringCount = Math.max(0, totalApps - protectedCount);

		const preview = items.slice(0, 5).map((app) => {
			const name = app.domains?.[0] ?? `Proxy Host #${app.id}`;
			return { id: app.id, name, wafEnabled: !!app.wafEnabled };
		});

		return { totalApps, protectedCount, monitoringCount, preview };
	}, [apps.data?.items, appsSummary.data?.protectedCount, appsSummary.data?.totalApps]);

	const countryRulesOverview = useMemo(() => {
		const items = countryRules.data?.items ?? [];
		const now = Date.now();
		const isExpired = (expiresOn: string | null) => {
			if (!expiresOn) return false;
			const t = Date.parse(expiresOn);
			return Number.isFinite(t) ? t <= now : false;
		};

		const active = items.filter((r) => r.enabled && !isExpired(r.expiresOn));
		const allow = active.filter((r) => r.action === "allow");
		const deny = active.filter((r) => r.action === "deny");

		const preview = [...active]
			.sort((a, b) => Number(b.id) - Number(a.id))
			.slice(0, 5)
			.map((r) => ({
				id: r.id,
				action: r.action,
				countryCode: (r.countryCode ?? "").toUpperCase(),
				expiresOn: r.expiresOn,
			}));

		return {
			totalRules: items.length,
			activeRules: active.length,
			allowCount: allow.length,
			denyCount: deny.length,
			preview,
		};
	}, [countryRules.data?.items]);

	const ipRulesOverview = useMemo(() => {
		const items = ipRules.data?.items ?? [];
		const now = Date.now();
		const isExpired = (expiresOn: string | null) => {
			if (!expiresOn) return false;
			const t = Date.parse(expiresOn);
			return Number.isFinite(t) ? t <= now : false;
		};

		const active = items.filter((r) => r.enabled && !isExpired(r.expiresOn));
		const allow = active.filter((r) => r.action === "allow");
		const deny = active.filter((r) => r.action === "deny");

		const preview = [...active]
			.sort((a, b) => Number(b.id) - Number(a.id))
			.slice(0, 5)
			.map((r) => ({
				id: r.id,
				action: r.action,
				ipCidr: r.ipCidr,
				expiresOn: r.expiresOn,
			}));

		return {
			totalRules: items.length,
			activeRules: active.length,
			allowCount: allow.length,
			denyCount: deny.length,
			preview,
		};
	}, [ipRules.data?.items]);

	const windowLabel = useMemo(() => {
		if (windowMinutes === 15) return "Last 15m";
		if (windowMinutes === 1440) return "Last 1d";
		if (windowMinutes === 10080) return "Last 7d";
		if (windowMinutes === 43200) return "Last 30d";
		if (windowMinutes === 86400) return "Last 60d";
		if (windowMinutes === 129600) return "Last 90d";
		if (windowMinutes === 259200) return "Last 180d";
		return `Last ${windowMinutes}m`;
	}, [windowMinutes]);

	return (
		<div className={styles.page}>
			<div className="container-xl">
				<div className={styles.hero}>
					<div className={styles.heroHeader}>
						<div>
							<h2 className={styles.title}>NyxGuard WAF</h2>
							<p className={styles.subtitle}>
								Live traffic, IP intelligence, geo insights, and action-ready rules.
							</p>
							<div className={styles.windowButtons}>
								<button
									type="button"
									className={windowMinutes === 1440 ? styles.windowActive : styles.window}
									onClick={() => setWindowMinutes(1440)}
								>
									1d
								</button>
								<button
									type="button"
									className={windowMinutes === 10080 ? styles.windowActive : styles.window}
									onClick={() => setWindowMinutes(10080)}
								>
									7d
								</button>
								<button
									type="button"
									className={windowMinutes === 43200 ? styles.windowActive : styles.window}
									onClick={() => setWindowMinutes(43200)}
								>
									30d
								</button>
								<button
									type="button"
									className={windowMinutes === 86400 ? styles.windowActive : styles.window}
									onClick={() => setWindowMinutes(86400)}
								>
									60d
								</button>
								<button
									type="button"
									className={windowMinutes === 129600 ? styles.windowActive : styles.window}
									onClick={() => setWindowMinutes(129600)}
								>
									90d
								</button>
								<button
									type="button"
									className={windowMinutes === 259200 ? styles.windowActive : styles.window}
									onClick={() => setWindowMinutes(259200)}
								>
									180d
								</button>
							</div>
						</div>
					</div>
					<div className={styles.stats}>
						<div className={styles.statCard}>
							<div className={styles.statLabel}>Requests ({windowLabel})</div>
							<div className={styles.statValue}>{statValue(requests)}</div>
						</div>
						<div className={styles.statCard}>
							<div className={styles.statLabel}>Blocked ({windowLabel})</div>
							<div className={styles.statValue}>{statValue(blocked)}</div>
						</div>
						<div className={styles.statCard}>
							<div className={styles.statLabel}>Allowed ({windowLabel})</div>
							<div className={styles.statValue}>{statValue(allowed)}</div>
						</div>
						<div className={styles.statCard}>
							<div className={styles.statLabel}>Unique IPs ({windowLabel})</div>
							<div className={styles.statValue}>{statValue(uniqueIps)}</div>
						</div>
						<div className={styles.statCard}>
							<div className={styles.statLabel}>RX ({windowLabel})</div>
							<div className={styles.statValue}>{statBytes(rxBytes)}</div>
						</div>
						<div className={styles.statCard}>
							<div className={styles.statLabel}>TX ({windowLabel})</div>
							<div className={styles.statValue}>{statBytes(txBytes)}</div>
						</div>
						<div className={styles.statCard}>
							<div className={styles.statLabel}>Attacks ({windowLabel})</div>
							<div className={styles.statValue}>{attacksCardMain}</div>
							<div className={styles.statSub}>{attacksCardSub}</div>
						</div>
						<div className={styles.statCard}>
							<div className={styles.statLabel}>Geo Source</div>
							<div className={styles.statValue} style={{ fontSize: 14, marginTop: 10 }}>
								{geoSourcesLabel}
							</div>
						</div>
					</div>
					<div className={styles.hostBoard}>
						<div className={styles.hostBoardHeader}>
							<h3 className={styles.sectionTitle}>Host Resources</h3>
							<p className={styles.sectionText}>CPU, RAM, and disk usage from the server running this app.</p>
						</div>
						<div className={styles.hostGrid}>
							<div className={styles.hostMetric}>
								<div className={styles.statLabel}>CPU Usage</div>
								<div className={styles.hostValue}>{formatPercent(hostSystem?.cpuUsagePercent)}</div>
							</div>
							<div className={styles.hostMetric}>
								<div className={styles.statLabel}>RAM Usage</div>
								<div className={styles.hostValue}>
									{hostSystem ? `${formatBytes(hostSystem.ramUsedBytes)} / ${formatBytes(hostSystem.ramTotalBytes)}` : "N/A"}
								</div>
								<div className={styles.statSub}>{formatPercent(hostSystem?.ramUsedPercent)} used</div>
							</div>
							<div className={styles.hostMetric}>
								<div className={styles.statLabel}>HDD Used</div>
								<div className={styles.hostValue}>
									{hostSystem?.disk ? formatBytes(hostSystem.disk.usedBytes) : "N/A"}
								</div>
								<div className={styles.statSub}>
									{hostSystem?.disk ? `${hostSystem.disk.usedPercent.toFixed(1)}%` : "No disk info"}
								</div>
							</div>
							<div className={styles.hostMetric}>
								<div className={styles.statLabel}>HDD Free</div>
								<div className={styles.hostValue}>
									{hostSystem?.disk ? formatBytes(hostSystem.disk.freeBytes) : "N/A"}
								</div>
							</div>
							<div className={styles.hostMetric}>
								<div className={styles.statLabel}>HDD Total</div>
								<div className={styles.hostValue}>
									{hostSystem?.disk ? formatBytes(hostSystem.disk.totalBytes) : "N/A"}
								</div>
								<div className={styles.statSub}>{hostSystem?.disk ? `Path: ${hostSystem.disk.path}` : ""}</div>
							</div>
						</div>
						<div className={styles.hostBoardHeader} style={{ marginTop: 16 }}>
							<h3 className={styles.sectionTitle}>Docker Usage (This App Container)</h3>
							<p className={styles.sectionText}>
								Runtime memory and CPU usage for the current container ({hostContainer?.containerId ?? "unknown"}).
							</p>
						</div>
						<div className={styles.hostGrid}>
							<div className={styles.hostMetric}>
								<div className={styles.statLabel}>Container CPU</div>
								<div className={styles.hostValue}>{formatPercent(hostContainer?.cpuUsagePercent)}</div>
							</div>
							<div className={styles.hostMetric}>
								<div className={styles.statLabel}>Container RAM Usage</div>
								<div className={styles.hostValue}>
									{hostContainer ? formatBytes(hostContainer.memoryUsageBytes) : "N/A"}
								</div>
								<div className={styles.statSub}>
									{hostContainer?.memoryUsagePercent != null ? `${hostContainer.memoryUsagePercent.toFixed(2)}%` : ""}
								</div>
							</div>
							<div className={styles.hostMetric}>
								<div className={styles.statLabel}>Container RSS</div>
								<div className={styles.hostValue}>{hostContainer ? formatBytes(hostContainer.rssBytes) : "N/A"}</div>
							</div>
							<div className={styles.hostMetric}>
								<div className={styles.statLabel}>Container NET I/O</div>
								<div className={styles.hostValue}>
									{hostContainer
										? `${formatBytes(hostContainer.netIo?.rxBytes ?? 0)} / ${formatBytes(hostContainer.netIo?.txBytes ?? 0)}`
										: "N/A"}
								</div>
								<div className={styles.statSub}>RX / TX</div>
							</div>
							<div className={styles.hostMetric}>
								<div className={styles.statLabel}>Container BLOCK I/O</div>
								<div className={styles.hostValue}>
									{hostContainer
										? `${formatBytes(hostContainer.blockIo?.readBytes ?? 0)} / ${formatBytes(hostContainer.blockIo?.writeBytes ?? 0)}`
										: "N/A"}
								</div>
								<div className={styles.statSub}>Read / Write</div>
							</div>
						</div>
					</div>
					<div className={styles.chartCard}>
						<div className={styles.chartHeader}>
							<div>
								<h3 className={styles.sectionTitle}>Live Traffic</h3>
								<p className={styles.sectionText}>Requests per minute with burst detection.</p>
							</div>
							<div className={styles.pillRow}>
								<button
									type="button"
									className={trafficWindowMinutes === 5 ? styles.windowActive : styles.window}
									onClick={() => setTrafficWindowMinutes(5)}
								>
									Realtime
								</button>
								<button
									type="button"
									className={trafficWindowMinutes === 15 ? styles.windowActive : styles.window}
									onClick={() => setTrafficWindowMinutes(15)}
								>
									Last 15m
								</button>
								<button
									type="button"
									className={trafficWindowMinutes === 1440 ? styles.windowActive : styles.window}
									onClick={() => setTrafficWindowMinutes(1440)}
								>
									Last 24h
								</button>
								<button
									type="button"
									className={trafficWindowMinutes === 10080 ? styles.windowActive : styles.window}
									onClick={() => setTrafficWindowMinutes(10080)}
								>
									Last 7d
								</button>
								<button
									type="button"
									className={trafficWindowMinutes === 43200 ? styles.windowActive : styles.window}
									onClick={() => setTrafficWindowMinutes(43200)}
								>
									Last 30d
								</button>
							</div>
						</div>
						{trafficSummary.isLoading ? (
							<div className={styles.sparklinePlaceholder}>Loading…</div>
						) : trafficSummary.isError ? (
							<div className={styles.sparklinePlaceholder}>Unable to load traffic (API error).</div>
						) : trafficSummary.data?.recent?.length ? (
							<>
								<div className="text-secondary" style={{ marginTop: 10 }}>
									Window totals: RX <strong className="text-white">{formatBytes(trafficSummary.data.rxBytes)}</strong>, TX{" "}
									<strong className="text-white">{formatBytes(trafficSummary.data.txBytes)}</strong>
								</div>
								<div style={{ marginTop: 12, overflowX: "auto", maxHeight: 360 }}>
									<table className="table table-sm table-vcenter">
										<thead>
											<tr>
												<th>Time</th>
												<th>Host</th>
												<th>Request</th>
												<th className="text-end">Status</th>
												<th>IP</th>
											</tr>
										</thead>
										<tbody>
											{trafficSummary.data.recent.slice(0, trafficWindowMinutes >= 1440 ? 200 : 25).map((r) => (
												<tr key={`${r.ts}-${r.ip}-${r.host}-${r.uri}`}>
													<td className="text-secondary text-nowrap">{new Date(r.ts).toLocaleTimeString()}</td>
													<td className="text-nowrap">{r.host}</td>
													<td className="text-truncate" style={{ maxWidth: 520 }}>
														<span className="text-secondary">{r.method}</span> {r.uri}
													</td>
													<td className="text-end text-nowrap">{r.status ?? "-"}</td>
													<td className="text-nowrap text-secondary">{r.ip}</td>
												</tr>
											))}
										</tbody>
									</table>
								</div>
							</>
						) : (
							<div className={styles.sparklinePlaceholder}>
								No recent traffic found in the last {trafficWindowLabel(trafficWindowMinutes)}.
							</div>
						)}
					</div>
						<div className={styles.sections}>
						<div className={styles.sectionCard}>
							<h3 className={styles.sectionTitle}>IP Intelligence</h3>
							<p className={styles.sectionText}>
								Full visibility into IP reputation, ASN, country, and decisions.
							</p>
							{ips.isLoading ? (
								<div className={styles.emptyState}>Loading IP insights…</div>
							) : ips.isError ? (
								<div className={styles.emptyState}>Unable to load IP insights (API error).</div>
							) : ipInsights.totalUniqueIps === 0 ? (
								<div className={styles.emptyState}>
									No IP activity found in {windowLabel}. Once requests hit your protected apps, insights will appear here.
								</div>
							) : (
								<>
									<div className={styles.ruleList}>
										<div className={styles.ruleItem}>
											<span>Unique IPs ({windowLabel})</span>
											<span className={styles.ruleTag}>{ipInsights.totalUniqueIps.toLocaleString()}</span>
										</div>
										<div className={styles.ruleItem}>
											<span>Total Requests ({windowLabel})</span>
											<span className={styles.ruleTag}>{ipInsights.totalRequests.toLocaleString()}</span>
										</div>
										<div className={styles.ruleItem}>
											<span>Blocked Rate ({windowLabel})</span>
											<span className={styles.ruleTag}>{(ipInsights.blockedRate * 100).toFixed(1)}%</span>
										</div>
									</div>
									<div className={styles.table}>
										<div className={styles.tableHeader}>
											<div>Country</div>
											<div className="text-end">IPs</div>
											<div className="text-end">Requests</div>
											<div className="text-end">Blocked</div>
										</div>
									{ipInsights.topCountries.map((c) => (
											<div key={c.country} className={styles.tableRow}>
												<div>{c.country}</div>
												<div className="text-end">{c.ips.toLocaleString()}</div>
												<div className="text-end">{c.requests.toLocaleString()}</div>
												<div className="text-end">{c.blocked.toLocaleString()}</div>
											</div>
										))}
									</div>
								</>
							)}
							<div className={styles.actionRow}>
								<Link className={styles.primaryButton} to="/nyxguard/ips">
									Inspect IPs
								</Link>
							</div>
						</div>
						<div className={styles.sectionCard}>
							<h3 className={styles.sectionTitle}>Apps Overview</h3>
							<p className={styles.sectionText}>
								Protect proxy hosts with profiles, policies, and rule packs.
							</p>
							{appsSummary.isLoading && apps.isLoading ? (
								<div className={styles.emptyState}>Loading apps…</div>
							) : appsSummary.isError || apps.isError ? (
								<div className={styles.emptyState}>Unable to load apps overview (API error).</div>
							) : appsOverview.totalApps === 0 ? (
								<div className={styles.emptyState}>
									No apps are connected yet. Add a proxy host to begin protection.
								</div>
							) : (
								<>
									<div className={styles.ruleList}>
										<div className={styles.ruleItem}>
											<span>Connected Apps</span>
											<span className={styles.ruleTag}>{appsOverview.totalApps.toLocaleString()}</span>
										</div>
										<div className={styles.ruleItem}>
											<span>Protected (WAF)</span>
											<span className={styles.ruleTag}>{appsOverview.protectedCount.toLocaleString()}</span>
										</div>
										<div className={styles.ruleItem}>
											<span>Monitoring Only</span>
											<span className={styles.ruleTag}>{appsOverview.monitoringCount.toLocaleString()}</span>
										</div>
									</div>
									{appsOverview.preview.length ? (
										<div className={styles.appList}>
											{appsOverview.preview.map((app) => (
												<div key={app.id} className={styles.appRow}>
													<span>{app.name}</span>
													<span className={app.wafEnabled ? styles.badgeActive : styles.badgeMuted}>
														{app.wafEnabled ? "Protected" : "Monitoring"}
													</span>
												</div>
											))}
										</div>
									) : null}
								</>
							)}
							<div className={styles.actionRow}>
								<Link className={styles.primaryButton} to="/nyxguard/apps">
									Add App
								</Link>
								<Link className={styles.ghostButton} to="/nyxguard/apps">
									View All Apps
								</Link>
							</div>
						</div>
						<div className={styles.sectionCard}>
							<h3 className={styles.sectionTitle}>Rules & Actions</h3>
							<p className={styles.sectionText}>
								Define deny/allow logic for IPs, ranges, ASN, and behavior.
							</p>
							{ipRules.isLoading ? (
								<div className={styles.emptyState}>Loading IP rules…</div>
							) : ipRules.isError ? (
								<div className={styles.emptyState}>Unable to load IP rules (API error).</div>
							) : ipRulesOverview.totalRules === 0 ? (
								<div className={styles.emptyState}>
									No IP rules yet. Add an IP/CIDR rule to apply enforcement.
								</div>
							) : (
								<div className={styles.ruleList}>
									<div className={styles.ruleItem}>
										<span>Active IP Rules</span>
										<span className={styles.ruleTag}>{ipRulesOverview.activeRules.toLocaleString()}</span>
									</div>
									<div className={styles.ruleItem}>
										<span>Allow</span>
										<span className={styles.ruleTag}>{ipRulesOverview.allowCount.toLocaleString()}</span>
									</div>
									<div className={styles.ruleItem}>
										<span>Deny</span>
										<span className={styles.ruleTag}>{ipRulesOverview.denyCount.toLocaleString()}</span>
									</div>
								</div>
							)}
							<div className={styles.actionRow}>
								<Link className={styles.primaryButton} to="/nyxguard/rules?type=ip">
									Add IP Rule
								</Link>
								<Link className={styles.ghostButton} to="/nyxguard/rules?type=ip">
									View All Rules
								</Link>
							</div>
						</div>
						<div className={styles.sectionCard}>
							<h3 className={styles.sectionTitle}>Country Controls</h3>
							<p className={styles.sectionText}>
								Allow or deny by country. Changes apply instantly to protected apps.
							</p>
							{countryRules.isLoading ? (
								<div className={styles.emptyState}>Loading country rules…</div>
							) : countryRules.isError ? (
								<div className={styles.emptyState}>Unable to load country rules (API error).</div>
							) : countryRulesOverview.totalRules === 0 ? (
								<div className={styles.emptyState}>
									No country rules yet. Create your first rule to apply enforcement.
								</div>
							) : (
								<div className={styles.ruleList}>
									<div className={styles.ruleItem}>
										<span>Active Country Rules</span>
										<span className={styles.ruleTag}>{countryRulesOverview.activeRules.toLocaleString()}</span>
									</div>
									<div className={styles.ruleItem}>
										<span>Allow</span>
										<span className={styles.ruleTag}>{countryRulesOverview.allowCount.toLocaleString()}</span>
									</div>
									<div className={styles.ruleItem}>
										<span>Deny</span>
										<span className={styles.ruleTag}>{countryRulesOverview.denyCount.toLocaleString()}</span>
									</div>
								</div>
							)}
							<div className={styles.actionRow}>
								<Link className={styles.primaryButton} to="/nyxguard/rules?type=country">
									Add Country Rule
								</Link>
								<Link className={styles.ghostButton} to="/nyxguard/rules?type=country">
									Manage Rules
								</Link>
							</div>
							</div>
							<div className={styles.sectionCard}>
								<h3 className={styles.sectionTitle}>GlobalGate Security Layer</h3>
								<p className={styles.sectionText}>
									Global toggles and tuning for Bot Defense, DDoS Shield, and SQL Shield are managed under GlobalGate.
								</p>
								<div className={styles.ruleList}>
									<div className={styles.ruleItem}>
										<span>WAF Protection</span>
										<span
											className={
												appsOverview.totalApps === 0 || appsOverview.protectedCount === 0
													? styles.pillOff
													: appsOverview.protectedCount >= appsOverview.totalApps
														? styles.pillOn
														: styles.pillPartial
											}
										>
											{appsOverview.totalApps === 0 || appsOverview.protectedCount === 0
												? "OFF"
												: appsOverview.protectedCount >= appsOverview.totalApps
													? "ON"
													: "PARTIAL"}
										</span>
									</div>
									<div className={styles.ruleItem}>
										<span>Bot Defense</span>
										<span className={botDefenseEnabled ? styles.pillOn : styles.pillOff}>{botDefenseEnabled ? "ON" : "OFF"}</span>
									</div>
									<div className={styles.ruleItem}>
										<span>DDoS Shield</span>
										<span className={ddosEnabled ? styles.pillOn : styles.pillOff}>{ddosEnabled ? "ON" : "OFF"}</span>
									</div>
									<div className={styles.ruleItem}>
										<span>SQL Shield</span>
										<span className={sqliEnabled ? styles.pillOn : styles.pillOff}>{sqliEnabled ? "ON" : "OFF"}</span>
									</div>
									<div className={styles.ruleItem}>
										<span>Auth Traffic Bypass</span>
										<span className={authBypassEnabled ? styles.pillOn : styles.pillOff}>{authBypassEnabled ? "ON" : "OFF"}</span>
									</div>
								</div>
								<div className={styles.actionRow}>
									<Link className={styles.primaryButton} to="/nyxguard/globalgate">
										Open GlobalGate
									</Link>
								</div>
							</div>
						<div className={styles.sectionCard}>
							<h3 className={styles.sectionTitle}>Decision Stream</h3>
							<p className={styles.sectionText}>
								Live allow/deny stream with geo (from access logs).
							</p>
							<div className={styles.windowButtons} style={{ marginTop: 14 }}>
								<button
									type="button"
									className={trafficWindowMinutes === 5 ? styles.windowActive : styles.window}
									onClick={() => setTrafficWindowMinutes(5)}
								>
									Realtime
								</button>
								<button
									type="button"
									className={trafficWindowMinutes === 15 ? styles.windowActive : styles.window}
									onClick={() => setTrafficWindowMinutes(15)}
								>
									Last 15m
								</button>
								<button
									type="button"
									className={trafficWindowMinutes === 1440 ? styles.windowActive : styles.window}
									onClick={() => setTrafficWindowMinutes(1440)}
								>
									Last 24h
								</button>
								<button
									type="button"
									className={trafficWindowMinutes === 10080 ? styles.windowActive : styles.window}
									onClick={() => setTrafficWindowMinutes(10080)}
								>
									Last 7d
								</button>
								<button
									type="button"
									className={trafficWindowMinutes === 43200 ? styles.windowActive : styles.window}
									onClick={() => setTrafficWindowMinutes(43200)}
								>
									Last 30d
								</button>
							</div>
							{trafficSummary.isLoading ? (
								<div className={styles.emptyState}>Loading decision stream…</div>
							) : trafficSummary.isError ? (
								<div className={styles.emptyState}>Unable to load decision stream (API error).</div>
							) : trafficSummary.data?.recent?.length ? (
								<div className={styles.decisionStream}>
									{trafficSummary.data.recent.slice(0, 10).map((r) => {
										const status = typeof r.status === "number" ? r.status : null;
										const isBlocked = typeof status === "number" ? status >= 400 : false;
										const t = new Date(r.ts);
										const country = r.country ? ` (${r.country})` : "";
										return (
											<div key={`${r.ts}-${r.ip}-${r.host}-${r.uri}`} className={styles.decisionRow}>
												<div className={styles.decisionTime}>{t.toLocaleTimeString()}</div>
												<div className={isBlocked ? styles.badgeDeny : styles.badgeAllow}>{isBlocked ? "DENY" : "ALLOW"}</div>
												<div className={styles.decisionReq} title={`${r.host} ${r.method} ${r.uri}`}>
													<span style={{ opacity: 0.75 }}>{r.host}</span> <span style={{ opacity: 0.6 }}>{r.method}</span>{" "}
													{r.uri}
												</div>
												<div className={styles.decisionIp} title={`${r.ip}${country}`}>
													{r.ip}
													{country}
												</div>
											</div>
										);
									})}
								</div>
							) : (
								<div className={styles.emptyState}>
									No recent traffic found in the last {trafficWindowLabel(trafficWindowMinutes)}. If
									you are sure there is traffic, confirm the NyxGuard access logs are present under `/data/logs` (or set `NYXGUARD_LOG_DIR`).
								</div>
							)}
							<div className={styles.actionRow}>
								<Link className={styles.primaryButton} to="/nyxguard/traffic">
									View Live Stream
								</Link>
								<button
									type="button"
									className={styles.ghostButton}
									onClick={exportDecisionEvents}
									disabled={!trafficSummary.data?.recent?.length}
									title={trafficSummary.data?.recent?.length ? "Download current events as JSON" : "No events to export"}
								>
									Export Events
								</button>
							</div>
						</div>
					</div>
					{summary.data?.hosts?.length ? (
						<div className={styles.chartCard} style={{ marginTop: "1rem" }}>
							<div className={styles.chartHeader}>
								<div>
									<h3 className={styles.sectionTitle}>Active Hosts (last {summary.data.windowMinutes}m)</h3>
									<p className={styles.sectionText}>Requests seen in NyxGuard Manager access logs.</p>
								</div>
							</div>
							<div style={{ overflowX: "auto" }}>
								<table className="table table-sm table-vcenter card-table">
									<thead>
										<tr>
											<th>Host</th>
											<th className="text-end">Requests</th>
											<th className="text-end">Allowed</th>
											<th className="text-end">Blocked</th>
											<th className="text-end">Unique IPs</th>
											<th className="text-end">RX</th>
											<th className="text-end">TX</th>
										</tr>
									</thead>
									<tbody>
										{summary.data.hosts.slice(0, 10).map(h => (
											<tr key={h.host}>
												<td>{h.host}</td>
												<td className="text-end">{h.requests.toLocaleString()}</td>
												<td className="text-end">{h.allowed.toLocaleString()}</td>
												<td className="text-end">{h.blocked.toLocaleString()}</td>
												<td className="text-end">{h.uniqueIps.toLocaleString()}</td>
												<td className="text-end text-nowrap text-secondary">{formatBytes(h.rxBytes)}</td>
												<td className="text-end text-nowrap text-secondary">{formatBytes(h.txBytes)}</td>
											</tr>
										))}
									</tbody>
								</table>
							</div>
						</div>
					) : null}
				</div>
			</div>
		</div>
	);
};

export default NyxGuard;
