import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router-dom";
import { clearNyxGuardLogs, getNyxGuardAttacksSummary, getNyxGuardSummary } from "src/api/backend";
import { intl, T } from "src/locale";
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
	if (minutes === 5) return intl.formatMessage({ id: "nyxguard.traffic.window.5m" });
	if (minutes === 15) return intl.formatMessage({ id: "nyxguard.traffic.window.15m" });
	if (minutes === 1440) return intl.formatMessage({ id: "nyxguard.traffic.window.24h" });
	if (minutes === 10080) return intl.formatMessage({ id: "nyxguard.traffic.window.7d" });
	if (minutes === 43200) return intl.formatMessage({ id: "nyxguard.traffic.window.30d" });
	return intl.formatMessage({ id: "nyxguard.traffic.window.minutes" }, { minutes });
}

const NyxGuardTraffic = () => {
	const qc = useQueryClient();
	const [windowMinutes, setWindowMinutes] = useState(5);
	const [pageSize, setPageSize] = useState<50 | 100>(50);
	const [page, setPage] = useState(0);
	const offset = page * pageSize;
	const clearLogs = useMutation({
		mutationFn: () => clearNyxGuardLogs({ target: "traffic", minutes: windowMinutes }),
		onSuccess: async () => {
			setPage(0);
			await qc.invalidateQueries({ queryKey: ["nyxguard", "summary"] });
			await qc.invalidateQueries({ queryKey: ["nyxguard", "ips"] });
			await qc.invalidateQueries({ queryKey: ["nyxguard", "attacks"] });
		},
	});
	const summary = useQuery({
		queryKey: ["nyxguard", "summary", windowMinutes, pageSize, offset],
		queryFn: () => getNyxGuardSummary(windowMinutes, pageSize, offset),
		refetchInterval: windowMinutes <= 15 ? 3000 : windowMinutes <= 1440 ? 15000 : 60000,
	});
	const attacks = useQuery({
		queryKey: ["nyxguard", "attacks", "summary", windowMinutes],
		queryFn: () => getNyxGuardAttacksSummary(windowMinutes),
		refetchInterval: windowMinutes <= 15 ? 3000 : windowMinutes <= 1440 ? 15000 : 60000,
	});
	const hasPrev = page > 0;
	const visibleCount = summary.data?.recent?.length ?? 0;
	const totalCount = summary.data?.requests ?? 0;
	const hasNext = offset + visibleCount < totalCount;

	return (
		<div className={styles.page}>
			<div className="container-xl">
				<div className={styles.card}>
					<div className={styles.headerRow}>
						<h2 className={styles.title}><T id="nyxguard.traffic.title" /></h2>
						<div className={styles.windowButtons}>
							<button
								type="button"
								className={windowMinutes === 5 ? styles.windowActive : styles.window}
								onClick={() => {
									setWindowMinutes(5);
									setPage(0);
								}}
							>
								<T id="nyxguard.traffic.realtime" />
							</button>
							<button
								type="button"
								className={windowMinutes === 15 ? styles.windowActive : styles.window}
								onClick={() => {
									setWindowMinutes(15);
									setPage(0);
								}}
							>
								<T id="nyxguard.traffic.last-15m" />
							</button>
							<button
								type="button"
								className={windowMinutes === 1440 ? styles.windowActive : styles.window}
								onClick={() => {
									setWindowMinutes(1440);
									setPage(0);
								}}
							>
								<T id="nyxguard.traffic.last-24h" />
							</button>
							<button
								type="button"
								className={windowMinutes === 10080 ? styles.windowActive : styles.window}
								onClick={() => {
									setWindowMinutes(10080);
									setPage(0);
								}}
							>
								<T id="nyxguard.traffic.last-7d" />
							</button>
							<button
								type="button"
								className={windowMinutes === 43200 ? styles.windowActive : styles.window}
								onClick={() => {
									setWindowMinutes(43200);
									setPage(0);
								}}
							>
								<T id="nyxguard.traffic.last-30d" />
							</button>
							<button
								type="button"
								className={styles.window}
								disabled={clearLogs.isPending}
								onClick={() => {
									const ok = window.confirm(
										intl.formatMessage({ id: "nyxguard.traffic.clear-confirm" }, { window: trafficWindowLabel(windowMinutes) }),
									);
									if (!ok) return;
									clearLogs.mutate();
								}}
							>
								<T id="nyxguard.traffic.clear-logs" />
							</button>
						</div>
					</div>
					<div className={styles.controlsRow}>
						<div className={styles.pageSizeGroup}>
							<span className={styles.controlsLabel}><T id="nyxguard.traffic.rows" /></span>
							<button
								type="button"
								className={pageSize === 50 ? styles.windowActive : styles.window}
								onClick={() => {
									setPageSize(50);
									setPage(0);
								}}
							>
								50
							</button>
							<button
								type="button"
								className={pageSize === 100 ? styles.windowActive : styles.window}
								onClick={() => {
									setPageSize(100);
									setPage(0);
								}}
							>
								100
							</button>
						</div>
					</div>
					<p className={styles.subtitle}>
						<T id="nyxguard.traffic.subtitle" />
					</p>
					{summary.isLoading ? (
						<div className={styles.placeholder}><T id="loading" /></div>
					) : summary.isError ? (
						<div className={styles.placeholder}><T id="nyxguard.traffic.load-error" /></div>
					) : summary.data?.recent?.length ? (
						<>
							<div className="text-secondary" style={{ marginBottom: 10 }}>
								<span style={{ marginRight: 14 }}>
									<strong className="text-white">{summary.data.requests.toLocaleString()}</strong> <T id="nyxguard.traffic.req" />
								</span>
								<span style={{ marginRight: 14 }}>
									RX <strong className="text-white">{formatBytes(summary.data.rxBytes)}</strong>
								</span>
									<span>
										TX <strong className="text-white">{formatBytes(summary.data.txBytes)}</strong>
									</span>
									<span style={{ marginLeft: 14 }}>
										<Link to="/nyxguard/attacks" className="text-secondary">
											<T id="nyxguard.traffic.attacks" />{" "}
											<strong className="text-white">
												{attacks.data?.total?.toLocaleString?.() ?? "…"}
											</strong>
										</Link>
									</span>
								</div>
							<div className={`nyx-scroll-y nyx-scroll-theme ${styles.tableViewport}`}>
							<table className="table table-sm table-vcenter">
								<thead>
									<tr>
										<th><T id="nyxguard.traffic.table.time" /></th>
										<th><T id="nyxguard.traffic.table.host" /></th>
										<th><T id="nyxguard.traffic.table.request" /></th>
										<th className="text-end"><T id="nyxguard.traffic.table.status" /></th>
										<th><T id="nyxguard.traffic.table.ip" /></th>
										<th><T id="nyxguard.traffic.table.country" /></th>
										<th className="text-end">RX</th>
										<th className="text-end">TX</th>
									</tr>
								</thead>
								<tbody>
									{summary.data.recent.map((r) => (
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
							<div className={styles.paginationRow}>
								<div className={styles.paginationMeta}>
								{intl.formatMessage(
									{ id: "nyxguard.traffic.pagination" },
									{
										from: visibleCount ? offset + 1 : 0,
										to: offset + visibleCount,
										total: totalCount.toLocaleString(),
									},
								)}
							</div>
							<div className={styles.paginationActions}>
								<button type="button" className={styles.window} disabled={!hasPrev} onClick={() => setPage((p) => Math.max(0, p - 1))}>
									<T id="nyxguard.traffic.prev" />
								</button>
								<button type="button" className={styles.window} disabled={!hasNext} onClick={() => setPage((p) => p + 1)}>
									<T id="nyxguard.traffic.next" />
								</button>
							</div>
						</div>
						{summary.data.hosts?.length ? (
							<div className={`nyx-scroll-y nyx-scroll-theme ${styles.hostTableViewport}`}>
								<table className="table table-sm table-vcenter">
									<thead>
										<tr>
											<th><T id="nyxguard.traffic.hosts.host" /></th>
											<th className="text-end"><T id="nyxguard.traffic.hosts.requests" /></th>
											<th className="text-end"><T id="nyxguard.traffic.hosts.allowed" /></th>
											<th className="text-end"><T id="nyxguard.traffic.hosts.blocked" /></th>
											<th className="text-end"><T id="nyxguard.traffic.hosts.unique-ips" /></th>
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
							{intl.formatMessage({ id: "nyxguard.traffic.empty-window" }, { window: trafficWindowLabel(windowMinutes) })}
						</div>
					)}
				</div>
			</div>
		</div>
	);
};

export default NyxGuardTraffic;
