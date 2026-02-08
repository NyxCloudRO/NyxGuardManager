import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { getNyxGuardSummary } from "src/api/backend";
import styles from "./index.module.css";

const NyxGuardTraffic = () => {
	const [windowMinutes, setWindowMinutes] = useState(5);
	const limit = useMemo(() => (windowMinutes >= 1440 ? 500 : 50), [windowMinutes]);
	const summary = useQuery({
		queryKey: ["nyxguard", "summary", windowMinutes, limit],
		queryFn: () => getNyxGuardSummary(windowMinutes, limit),
		refetchInterval: windowMinutes <= 15 ? 3000 : 15000,
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
						<div style={{ overflowX: "auto" }}>
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
									{summary.data.recent.slice(0, windowMinutes >= 1440 ? 200 : 25).map((r) => (
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
						<div className={styles.placeholder}>
							No recent traffic found in the last {windowMinutes === 1440 ? "24 hours" : `${windowMinutes} minutes`}.
						</div>
					)}
				</div>
			</div>
		</div>
	);
};

export default NyxGuardTraffic;
