import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
	getNyxGuardApps,
	getNyxGuardAppsSummary,
	getNyxGuardCountryRules,
	getNyxGuardIps,
	getNyxGuardIpRules,
	getNyxGuardSettings,
	getNyxGuardSummary,
	updateNyxGuardSettings,
	updateNyxGuardAppsWaf,
} from "src/api/backend";
import { showError, showSuccess } from "src/notifications";
import styles from "./index.module.css";

const NyxGuard = () => {
	const qc = useQueryClient();
	const [windowMinutes, setWindowMinutes] = useState(1440);
	const [trafficWindowMinutes, setTrafficWindowMinutes] = useState(5);
	const trafficLimit = useMemo(() => (trafficWindowMinutes >= 1440 ? 500 : 50), [trafficWindowMinutes]);

	const summary = useQuery({
		queryKey: ["nyxguard", "summary", windowMinutes],
		queryFn: () => getNyxGuardSummary(windowMinutes, 50),
		refetchInterval: windowMinutes <= 60 ? 5000 : 60000,
	});

	const trafficSummary = useQuery({
		queryKey: ["nyxguard", "summary", "recent", trafficWindowMinutes, trafficLimit],
		queryFn: () => getNyxGuardSummary(trafficWindowMinutes, trafficLimit),
		refetchInterval: trafficWindowMinutes <= 15 ? 3000 : 15000,
	});

	const settings = useQuery({
		queryKey: ["nyxguard", "settings"],
		queryFn: () => getNyxGuardSettings(),
		refetchInterval: 15000,
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

	const saveSettings = useMutation({
		mutationFn: (patch: { botDefenseEnabled?: boolean; ddosEnabled?: boolean; logRetentionDays?: 30 | 60 | 90 }) =>
			updateNyxGuardSettings(patch),
		onSuccess: () => qc.invalidateQueries({ queryKey: ["nyxguard", "settings"] }),
	});

	const toggleWafAll = useMutation({
		mutationFn: (enabled: boolean) => updateNyxGuardAppsWaf(enabled),
		onSuccess: async (res, enabled) => {
			showSuccess(
				enabled
					? `Enabled WAF for ${res.updated.toLocaleString()} app(s).`
					: `Disabled WAF for ${res.updated.toLocaleString()} app(s).`,
			);
			await qc.invalidateQueries({ queryKey: ["nyxguard", "apps"] });
			await qc.invalidateQueries({ queryKey: ["nyxguard", "apps", "summary"] });
		},
		onError: (err: any) => {
			const msg = err instanceof Error ? err.message : "Failed to update WAF for all apps.";
			showError(msg);
		},
	});

	const statValue = (v?: number) => (typeof v === "number" ? v.toLocaleString() : "Waiting for data…");

	const requests = summary.data?.requests;
	const blocked = summary.data?.blocked;
	const allowed = summary.data?.allowed;
	const uniqueIps = summary.data?.uniqueIps;
	const botDefenseEnabled = settings.data?.botDefenseEnabled ?? false;
	const ddosEnabled = settings.data?.ddosEnabled ?? false;
	const wafProtectedEnabled = (appsSummary.data?.protectedCount ?? 0) > 0;

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

	const wafAllEnabled = appsOverview.totalApps > 0 && appsOverview.protectedCount >= appsOverview.totalApps;

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
						{botDefenseEnabled || ddosEnabled || wafProtectedEnabled ? (
							<div className={styles.statusBar} role="status" aria-live="polite">
								{wafProtectedEnabled ? (
									<Link className={`${styles.statusPill} ${styles.statusPillLink}`} to="/nyxguard/apps" title="Protected Apps">
										WAF Protected: ON
									</Link>
								) : null}
								{botDefenseEnabled ? (
									<span className={styles.statusPill} title="Bot Defense is enabled">
										Bot Defense: ON
									</span>
								) : null}
								{ddosEnabled ? (
									<span className={styles.statusPill} title="DDoS Shield is enabled">
										DDoS Shield: ON
									</span>
								) : null}
							</div>
						) : null}
						<div className={styles.heroMeta}>
							<div className={styles.metaLabel}>Geo Source</div>
							<div className={styles.metaValue}>GeoLite2 (free local DB)</div>
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
							</div>
						</div>
						{trafficSummary.isLoading ? (
							<div className={styles.sparklinePlaceholder}>Loading…</div>
						) : trafficSummary.isError ? (
							<div className={styles.sparklinePlaceholder}>Unable to load traffic (API error).</div>
						) : trafficSummary.data?.recent?.length ? (
							<div style={{ marginTop: 16, overflowX: "auto", maxHeight: 360 }}>
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
						) : (
							<div className={styles.sparklinePlaceholder}>
								No recent traffic found in the last {trafficWindowMinutes === 1440 ? "24 hours" : `${trafficWindowMinutes} minutes`}.
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
									{ipInsights.topBlockedIps.length ? (
										<div className={styles.ruleList}>
											{ipInsights.topBlockedIps.map((it) => (
												<div key={it.ip} className={styles.ruleItem}>
													<span title={it.ip}>
														{it.ip} {it.country ? `(${it.country})` : ""}
													</span>
													<span className={styles.ruleTag}>
														{it.blocked.toLocaleString()} blocked
													</span>
												</div>
											))}
										</div>
									) : null}
								</>
							)}
							<div className={styles.actionRow}>
								<Link className={styles.primaryButton} to="/nyxguard/ips">
									Inspect IPs
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
								<>
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
									{countryRulesOverview.preview.length ? (
										<div className={styles.ruleList}>
											{countryRulesOverview.preview.map((r) => (
												<div key={r.id} className={styles.ruleItem}>
													<span>
														{r.countryCode || "??"}
														<span style={{ opacity: 0.7 }}>
															{r.expiresOn ? ` (expires ${new Date(r.expiresOn).toLocaleDateString()})` : ""}
														</span>
													</span>
													<span className={r.action === "deny" ? styles.badgeDeny : styles.badgeAllow}>
														{r.action.toUpperCase()}
													</span>
												</div>
											))}
										</div>
									) : null}
								</>
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
								<>
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
									{ipRulesOverview.preview.length ? (
										<div className={styles.ruleList}>
											{ipRulesOverview.preview.map((r) => (
												<div key={r.id} className={styles.ruleItem}>
													<span title={r.ipCidr}>
														{r.ipCidr}
														<span style={{ opacity: 0.7 }}>
															{r.expiresOn ? ` (expires ${new Date(r.expiresOn).toLocaleDateString()})` : ""}
														</span>
													</span>
													<span className={r.action === "deny" ? styles.badgeDeny : styles.badgeAllow}>
														{r.action.toUpperCase()}
													</span>
												</div>
											))}
										</div>
									) : null}
								</>
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
							<h3 className={styles.sectionTitle}>Defense Controls</h3>
							<p className={styles.sectionText}>
								WAF app protection, bot defense, and DDoS shield controls.
							</p>
							<div className={styles.ruleList}>
								<div className={styles.ruleItem}>
									<div className={styles.controlLabel}>
										<span>WAF Protection</span>
									</div>
									<div className={styles.controlMid}>
										<span
											className={
												wafProtectedEnabled
													? wafAllEnabled
														? styles.pillOn
														: styles.pillPartial
													: styles.pillOff
											}
										>
											{wafProtectedEnabled ? (wafAllEnabled ? "ON" : "PARTIAL") : "OFF"}
										</span>
									</div>
									<div className={styles.controlActions}>
										<button
											type="button"
											className={`${styles.primaryButton} ${styles.miniButton}`}
											disabled={toggleWafAll.isPending || appsOverview.totalApps === 0}
											onClick={() => toggleWafAll.mutate(!wafAllEnabled)}
											title={
												appsOverview.totalApps === 0
													? "No apps found"
													: wafAllEnabled
														? "Disable WAF for all apps"
														: "Enable WAF for all apps"
											}
										>
											{wafAllEnabled ? "All Off" : "All On"}
										</button>
										<Link
											className={`${styles.ghostButton} ${styles.miniButton}`}
											to="/nyxguard/apps"
										>
											Apps
										</Link>
									</div>
								</div>
								<div className={styles.ruleItem}>
									<div className={styles.controlLabel}>
										<span>Bot Defense</span>
									</div>
									<div className={styles.controlMid}>
										<span className={botDefenseEnabled ? styles.pillOn : styles.pillOff}>
											{botDefenseEnabled ? "ON" : "OFF"}
										</span>
									</div>
									<div className={styles.controlActions}>
										<button
											type="button"
											className={`${styles.primaryButton} ${styles.miniButton}`}
											disabled={saveSettings.isPending}
											onClick={() => saveSettings.mutate({ botDefenseEnabled: !botDefenseEnabled })}
										>
											{botDefenseEnabled ? "Disable" : "Enable"}
										</button>
										<Link
											className={`${styles.ghostButton} ${styles.miniButton}`}
											to="/nyxguard/bot"
										>
											Bot Settings
										</Link>
									</div>
								</div>
								<div className={styles.ruleItem}>
									<div className={styles.controlLabel}>
										<span>DDoS Shield</span>
									</div>
									<div className={styles.controlMid}>
										<span className={ddosEnabled ? styles.pillOn : styles.pillOff}>{ddosEnabled ? "ON" : "OFF"}</span>
									</div>
									<div className={styles.controlActions}>
										<button
											type="button"
											className={`${styles.primaryButton} ${styles.miniButton}`}
											disabled={saveSettings.isPending}
											onClick={() => saveSettings.mutate({ ddosEnabled: !ddosEnabled })}
										>
											{ddosEnabled ? "Disable" : "Activate"}
										</button>
										<Link
											className={`${styles.ghostButton} ${styles.miniButton}`}
											to="/nyxguard/ddos"
										>
											DDoS Settings
										</Link>
									</div>
								</div>
							</div>
							<div className={styles.actionRow}>
								<Link className={styles.ghostButton} to="/nyxguard/traffic">
									View Live Traffic
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
							<h3 className={styles.sectionTitle}>Decision Stream</h3>
							<p className={styles.sectionText}>
								Live allow/deny stream with geo and rule matches.
							</p>
							<div className={styles.emptyState}>
								Decision stream will appear when live traffic is connected.
							</div>
							<div className={styles.actionRow}>
								<Link className={styles.primaryButton} to="/nyxguard/traffic">
									View Live Stream
								</Link>
								<Link className={styles.ghostButton} to="/nyxguard/traffic">
									Export Events
								</Link>
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
