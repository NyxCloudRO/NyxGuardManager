import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { getNyxGuardSummary } from "src/api/backend";
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

const NyxGuardTraffic = () => {
	const [windowMinutes, setWindowMinutes] = useState(5);
	const limit = useMemo(() => (windowMinutes >= 1440 ? 500 : 50), [windowMinutes]);
	const summary = useQuery({
		queryKey: ["nyxguard", "summary", windowMinutes, limit],
		queryFn: () => getNyxGuardSummary(windowMinutes, limit),
		refetchInterval: windowMinutes <= 15 ? 3000 : windowMinutes <= 1440 ? 15000 : 60000,
	});

	return (
		<div className={styles.page}>
			<div className="container-xl">
				<div className={styles.card}>
					<div className={styles.headerRow}>
						<h2 className={styles.title}>Live Traffic</h2>
						<div className={styles.windowButtons}>
							<button
								type="button"
								className={windowMinutes === 5 ? styles.windowActive : styles.window}
								onClick={() => setWindowMinutes(5)}
							>
								Realtime
							</button>
							<button
								type="button"
								className={windowMinutes === 15 ? styles.windowActive : styles.window}
								onClick={() => setWindowMinutes(15)}
							>
								Last 15m
							</button>
							<button
								type="button"
								className={windowMinutes === 1440 ? styles.windowActive : styles.window}
								onClick={() => setWindowMinutes(1440)}
							>
								Last 24h
							</button>
							<button
								type="button"
								className={windowMinutes === 10080 ? styles.windowActive : styles.window}
								onClick={() => setWindowMinutes(10080)}
							>
								Last 7d
							</button>
							<button
								type="button"
								className={windowMinutes === 43200 ? styles.windowActive : styles.window}
								onClick={() => setWindowMinutes(43200)}
							>
								Last 30d
							</button>
						</div>
					</div>
					<p className={styles.subtitle}>
						Streaming requests per minute with burst detection and anomaly bands.
					</p>
					{summary.isLoading ? (
						<div className={styles.placeholder}>Loading…</div>
					) : summary.isError ? (
						<div className={styles.placeholder}>Unable to load traffic (API error).</div>
					) : summary.data?.recent?.length ? (
						<>
							<div className="text-secondary" style={{ marginBottom: 10 }}>
								<span style={{ marginRight: 14 }}>
									<strong className="text-white">{summary.data.requests.toLocaleString()}</strong> req
								</span>
								<span style={{ marginRight: 14 }}>
									RX <strong className="text-white">{formatBytes(summary.data.rxBytes)}</strong>
								</span>
								<span>
									TX <strong className="text-white">{formatBytes(summary.data.txBytes)}</strong>
								</span>
							</div>
							<div style={{ overflowX: "auto" }}>
							<table className="table table-sm table-vcenter">
								<thead>
									<tr>
										<th>Time</th>
										<th>Host</th>
										<th>Request</th>
										<th className="text-end">Status</th>
										<th>IP</th>
										<th>Country</th>
										<th className="text-end">RX</th>
										<th className="text-end">TX</th>
									</tr>
								</thead>
								<tbody>
									{summary.data.recent.slice(0, windowMinutes >= 1440 ? 200 : 25).map((r) => (
										<tr key={`${r.ts}-${r.ip}-${r.host}-${r.uri}`}>
											<td className="text-secondary text-nowrap">{new Date(r.ts).toLocaleTimeString()}</td>
											<td className="text-nowrap">{r.host}</td>
											<td className="text-truncate" style={{ maxWidth: 520 }}>
												<span className="text-secondary">{r.method}</span> {r.uri}
											</td>
											<td className="text-end text-nowrap">{r.status ?? "-"}</td>
											<td className="text-nowrap text-secondary">{r.ip}</td>
											<td className="text-nowrap text-secondary">{r.country ?? "-"}</td>
											<td className="text-end text-nowrap text-secondary">{formatBytes(r.rxBytes)}</td>
											<td className="text-end text-nowrap text-secondary">{formatBytes(r.txBytes)}</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
						{summary.data.hosts?.length ? (
							<div style={{ marginTop: 16, overflowX: "auto" }}>
								<table className="table table-sm table-vcenter">
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
										{summary.data.hosts.slice(0, 15).map((h) => (
											<tr key={h.host}>
												<td className="text-nowrap">{h.host}</td>
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
						) : null}
						</>
					) : (
						<div className={styles.placeholder}>
							No recent traffic found in the last {trafficWindowLabel(windowMinutes)}.
						</div>
					)}
				</div>
			</div>
		</div>
	);
};

export default NyxGuardTraffic;
