import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { getNyxGuardAppsSummary, getNyxGuardSettings, getNyxGuardSummary, updateNyxGuardSettings } from "src/api/backend";
import styles from "./index.module.css";

const NyxGuard = () => {
	const qc = useQueryClient();
	const [windowMinutes, setWindowMinutes] = useState(1440);

	const summary = useQuery({
		queryKey: ["nyxguard", "summary", windowMinutes],
		queryFn: () => getNyxGuardSummary(windowMinutes, 50),
		refetchInterval: windowMinutes <= 60 ? 5000 : 60000,
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

	const saveSettings = useMutation({
		mutationFn: (patch: { botDefenseEnabled?: boolean; ddosEnabled?: boolean; logRetentionDays?: 30 | 60 | 90 }) =>
			updateNyxGuardSettings(patch),
		onSuccess: () => qc.invalidateQueries({ queryKey: ["nyxguard", "settings"] }),
	});

	const statValue = (v?: number) => (typeof v === "number" ? v.toLocaleString() : "Waiting for data…");

	const requests = summary.data?.requests;
	const blocked = summary.data?.blocked;
	const allowed = summary.data?.allowed;
	const uniqueIps = summary.data?.uniqueIps;
	const botDefenseEnabled = settings.data?.botDefenseEnabled ?? false;
	const ddosEnabled = settings.data?.ddosEnabled ?? false;
	const wafProtectedEnabled = (appsSummary.data?.protectedCount ?? 0) > 0;

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
								<span className={styles.pill}>Realtime</span>
								<span className={styles.pill}>Last 15m</span>
								<span className={styles.pill}>Last 24h</span>
							</div>
						</div>
						<div className={styles.sparklinePlaceholder}>
							Live traffic will appear when the stream is connected.
						</div>
					</div>
					<div className={styles.sections}>
						<div className={styles.sectionCard}>
							<h3 className={styles.sectionTitle}>IP Intelligence</h3>
							<p className={styles.sectionText}>
								Full visibility into IP reputation, ASN, country, and decisions.
							</p>
							<div className={styles.emptyState}>
								IP insights will appear once traffic ingestion is enabled.
							</div>
							<div className={styles.actionRow}>
								<Link className={styles.primaryButton} to="/nyxguard/ips">
									Inspect IPs
								</Link>
								<Link className={styles.ghostButton} to="/nyxguard/ips">
									Export List
								</Link>
							</div>
						</div>
						<div className={styles.sectionCard}>
							<h3 className={styles.sectionTitle}>Country Controls</h3>
							<p className={styles.sectionText}>
								Allow or deny by country. Changes apply instantly to protected apps.
							</p>
							<div className={styles.emptyState}>
								No country rules yet. Create your first rule to apply enforcement.
							</div>
							<div className={styles.actionRow}>
								<Link className={styles.primaryButton} to="/nyxguard/rules">
									Add Country Rule
								</Link>
								<Link className={styles.ghostButton} to="/nyxguard/rules">
									Manage Rules
								</Link>
							</div>
						</div>
						<div className={styles.sectionCard}>
							<h3 className={styles.sectionTitle}>Rules & Actions</h3>
							<p className={styles.sectionText}>
								Define deny/allow logic for IPs, ranges, ASN, and behavior.
							</p>
							<div className={styles.emptyState}>
								Rule builder will appear after the rules engine is configured.
							</div>
							<div className={styles.actionRow}>
								<Link className={styles.primaryButton} to="/nyxguard/rules">
									Save Rule
								</Link>
								<Link className={styles.ghostButton} to="/nyxguard/rules">
									View All Rules
								</Link>
							</div>
						</div>
						<div className={styles.sectionCard}>
							<h3 className={styles.sectionTitle}>Bot Defense</h3>
							<p className={styles.sectionText}>
								Detect automation, fingerprint bots, and throttle suspicious patterns.
							</p>
							<div className={styles.actionRow}>
								<button
									type="button"
									className={styles.primaryButton}
									disabled={saveSettings.isPending}
									onClick={() => saveSettings.mutate({ botDefenseEnabled: !botDefenseEnabled })}
								>
									{botDefenseEnabled ? "Disable Bot Defense" : "Enable Bot Defense"}
								</button>
								<Link className={styles.ghostButton} to="/nyxguard/apps">
									Protected Apps
								</Link>
							</div>
						</div>
						<div className={styles.sectionCard}>
							<h3 className={styles.sectionTitle}>DDoS Shield</h3>
							<p className={styles.sectionText}>
								Auto-mitigate spikes with rate limits, challenges, and emergency blocks.
							</p>
							<div className={styles.actionRow}>
								<button
									type="button"
									className={styles.primaryButton}
									disabled={saveSettings.isPending}
									onClick={() => saveSettings.mutate({ ddosEnabled: !ddosEnabled })}
								>
									{ddosEnabled ? "Disable Shield" : "Activate Shield"}
								</button>
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
							<div className={styles.emptyState}>
								No apps are connected yet. Add an app to begin protection.
							</div>
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
