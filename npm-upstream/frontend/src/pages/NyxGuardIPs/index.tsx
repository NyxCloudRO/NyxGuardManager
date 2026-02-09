import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
	clearNyxGuardGeoipUpdateConfig,
	getNyxGuardGeoip,
	getNyxGuardIps,
	getNyxGuardSettings,
	setNyxGuardGeoipUpdateConfig,
	updateNyxGuardSettings,
	uploadNyxGuardGeoip,
} from "src/api/backend";
import type { NyxGuardSettings } from "src/api/backend";
import styles from "./index.module.css";

const NyxGuardIPs = () => {
	const [windowMinutes, setWindowMinutes] = useState(15);
	const qc = useQueryClient();
	const [retentionDraft, setRetentionDraft] = useState<30 | 60 | 90 | 180>(60);
	const [geoipFile, setGeoipFile] = useState<File | null>(null);
	const [mmAccountId, setMmAccountId] = useState("");
	const [mmLicenseKey, setMmLicenseKey] = useState("");

	const windowLabel = (() => {
		switch (windowMinutes) {
			case 15:
				return "15 minutes";
			case 30:
				return "30 minutes";
			case 60:
				return "60 minutes";
			case 1440:
				return "1 day";
			case 10080:
				return "7 days";
			case 43200:
				return "30 days";
			case 86400:
				return "60 days";
			case 129600:
				return "90 days";
			default:
				return `${windowMinutes} minutes`;
		}
	})();

	const settings = useQuery<NyxGuardSettings>({
		queryKey: ["nyxguard", "settings"],
		queryFn: () => getNyxGuardSettings(),
		refetchInterval: 60000,
	});
	useEffect(() => {
		if (settings.data?.logRetentionDays) {
			setRetentionDraft(settings.data.logRetentionDays);
		}
	}, [settings.data?.logRetentionDays]);

	const saveRetention = useMutation({
		mutationFn: (logRetentionDays: 30 | 60 | 90 | 180) => updateNyxGuardSettings({ logRetentionDays }),
		onSuccess: async () => {
			await qc.invalidateQueries({ queryKey: ["nyxguard", "settings"] });
		},
	});

	const geoip = useQuery({
		queryKey: ["nyxguard", "geoip"],
		queryFn: () => getNyxGuardGeoip(),
		refetchInterval: 60000,
	});

	const uploadGeoip = useMutation({
		mutationFn: async () => {
			if (!geoipFile) return;
			await uploadNyxGuardGeoip(geoipFile);
		},
		onSuccess: async () => {
			setGeoipFile(null);
			await qc.invalidateQueries({ queryKey: ["nyxguard", "geoip"] });
			await qc.invalidateQueries({ queryKey: ["nyxguard", "ips"] });
		},
	});

	const saveGeoipConfig = useMutation({
		mutationFn: async () => {
			await setNyxGuardGeoipUpdateConfig(mmAccountId.trim(), mmLicenseKey.trim());
		},
		onSuccess: async () => {
			setMmLicenseKey("");
			await qc.invalidateQueries({ queryKey: ["nyxguard", "geoip"] });
		},
	});

	const clearGeoipConfig = useMutation({
		mutationFn: async () => clearNyxGuardGeoipUpdateConfig(),
		onSuccess: async () => {
			await qc.invalidateQueries({ queryKey: ["nyxguard", "geoip"] });
		},
	});

	const ips = useQuery({
		queryKey: ["nyxguard", "ips", windowMinutes],
		queryFn: () => getNyxGuardIps(windowMinutes, windowMinutes >= 43200 ? 800 : windowMinutes >= 10080 ? 400 : 200),
		refetchInterval: windowMinutes <= 60 ? 15000 : 60000,
	});

	const exportIpsJson = () => {
		if (!ips.data?.items?.length) return;
		const ts = new Date().toISOString().replace(/[:.]/g, "-");
		const payload = {
			now: ips.data.now,
			windowMinutes: ips.data.windowMinutes,
			items: ips.data.items,
		};
		const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
		const url = URL.createObjectURL(blob);
		const a = document.createElement("a");
		a.href = url;
		a.download = `nyxguard-ips-${windowMinutes}m-${ts}.json`;
		document.body.appendChild(a);
		a.click();
		a.remove();
		setTimeout(() => URL.revokeObjectURL(url), 1000);
	};

	const retention = settings.data?.logRetentionDays ?? 30;
	const retentionChanged = retentionDraft !== retention;

	return (
		<div className={styles.page}>
			<div className="container-xl">
				<div className={styles.card}>
					<div className={styles.headerRow}>
						<h2 className={styles.title}>IPs & Locations</h2>
						<div className={styles.windowButtons}>
							<button
								type="button"
								className={windowMinutes === 15 ? styles.windowActive : styles.window}
								onClick={() => setWindowMinutes(15)}
							>
								Last 15m
							</button>
							<button
								type="button"
								className={windowMinutes === 30 ? styles.windowActive : styles.window}
								onClick={() => setWindowMinutes(30)}
							>
								Last 30m
							</button>
							<button
								type="button"
								className={windowMinutes === 60 ? styles.windowActive : styles.window}
								onClick={() => setWindowMinutes(60)}
							>
								Last 60m
							</button>
							<button
								type="button"
								className={windowMinutes === 1440 ? styles.windowActive : styles.window}
								onClick={() => setWindowMinutes(1440)}
							>
								Last 1d
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
							<button
								type="button"
								className={windowMinutes === 86400 ? styles.windowActive : styles.window}
								onClick={() => setWindowMinutes(86400)}
							>
								Last 60d
							</button>
							<button
								type="button"
								className={windowMinutes === 129600 ? styles.windowActive : styles.window}
								onClick={() => setWindowMinutes(129600)}
							>
								Last 90d
							</button>
							<button
								type="button"
								className={`${styles.window} ${styles.exportButton}`}
								disabled={!ips.data?.items?.length || ips.isLoading}
								onClick={exportIpsJson}
								title={ips.data?.items?.length ? "Download current table as JSON" : "No data to export"}
							>
								Export JSON
							</button>
						</div>
					</div>
					<p className={styles.subtitle}>
						Full IP visibility with country, requests, and decision status.
					</p>

					<div className="d-flex align-items-center gap-2 mb-3 flex-wrap">
						<div className="text-secondary text-uppercase" style={{ fontSize: 11, letterSpacing: "0.08em" }}>
							Log Retention
						</div>
						<select
							value={retentionDraft}
							disabled={settings.isLoading || saveRetention.isPending}
							onChange={(e) =>
								setRetentionDraft(Number.parseInt(e.target.value, 10) as 30 | 60 | 90 | 180)
							}
							className="form-select form-select-sm"
							style={{ width: 140 }}
						>
							<option value={30}>30 days</option>
							<option value={60}>60 days</option>
							<option value={90}>90 days</option>
							<option value={180}>180 days</option>
						</select>
						<button
							type="button"
							className={styles.applyBtn}
							disabled={!retentionChanged || saveRetention.isPending || settings.isLoading}
							onClick={() => saveRetention.mutate(retentionDraft)}
						>
							Apply
						</button>
						{saveRetention.isError ? (
							<div className="text-danger">Failed to save retention.</div>
						) : null}
					</div>

					<div className="d-flex align-items-center gap-2 mb-3 flex-wrap">
						<div className="text-secondary text-uppercase" style={{ fontSize: 11, letterSpacing: "0.08em" }}>
							GeoIP DB
						</div>
						<div className="text-secondary">
							{geoip.isLoading ? "Checking…" : geoip.data?.installed ? "Installed" : "Not installed"}
						</div>
						<input
							type="file"
							accept=".mmdb"
							onChange={(e) => setGeoipFile(e.target.files?.[0] ?? null)}
							className="form-control form-control-sm"
							style={{ width: 260 }}
						/>
						<button
							type="button"
							className={styles.applyBtn}
							disabled={!geoipFile || uploadGeoip.isPending}
							onClick={() => uploadGeoip.mutate()}
						>
							Upload
						</button>
						{uploadGeoip.isError ? (
							<div className="text-danger">
								Upload failed{uploadGeoip.error instanceof Error ? `: ${uploadGeoip.error.message}` : "."}
							</div>
						) : null}
					</div>

					<div className="d-flex align-items-center gap-2 mb-3 flex-wrap">
						<div className="text-secondary text-uppercase" style={{ fontSize: 11, letterSpacing: "0.08em" }}>
							Auto-update
						</div>
						<div className="text-secondary">
							{geoip.isLoading ? "Checking…" : geoip.data?.updateConfigured ? "Configured" : "Not configured"}
						</div>
						{geoip.data?.updateConfigured ? (
							<button
								type="button"
								className={styles.applyBtn}
								disabled={clearGeoipConfig.isPending}
								onClick={() => clearGeoipConfig.mutate()}
							>
								Clear
							</button>
						) : (
							<>
								<input
									value={mmAccountId}
									onChange={(e) => setMmAccountId(e.target.value)}
									placeholder="MaxMind AccountID"
									className="form-control form-control-sm"
									style={{ width: 180 }}
								/>
								<input
									value={mmLicenseKey}
									onChange={(e) => setMmLicenseKey(e.target.value)}
									placeholder="MaxMind LicenseKey"
									type="password"
									className="form-control form-control-sm"
									style={{ width: 260 }}
								/>
								<button
									type="button"
									className={styles.applyBtn}
									disabled={!mmAccountId.trim() || !mmLicenseKey.trim() || saveGeoipConfig.isPending}
									onClick={() => saveGeoipConfig.mutate()}
								>
									Save
								</button>
							</>
						)}
						{saveGeoipConfig.isError ? (
							<div className="text-danger">
								Save failed{saveGeoipConfig.error instanceof Error ? `: ${saveGeoipConfig.error.message}` : "."}
							</div>
						) : null}
					</div>

					{ips.isLoading ? (
						<div className={styles.emptyState}>Loading…</div>
					) : ips.isError ? (
						<div className={styles.emptyState}>Unable to load IP data.</div>
					) : (ips.data?.items?.length ?? 0) === 0 ? (
						<div className={styles.emptyState}>
							No IP data found in the last {windowLabel}.
						</div>
					) : (
						<div style={{ overflowX: "auto" }}>
							<table className="table table-sm table-vcenter">
								<thead>
									<tr>
										<th>IP</th>
										<th>Country</th>
										<th className="text-end">Requests</th>
										<th className="text-end">Blocked</th>
										<th className="text-end">Allowed</th>
										<th>Last Seen</th>
										<th>Hosts</th>
									</tr>
								</thead>
								<tbody>
									{(ips.data?.items ?? []).map((r) => (
										<tr key={r.ip}>
											<td className="text-nowrap">{r.ip}</td>
											<td className="text-secondary text-nowrap">{r.country ?? "-"}</td>
											<td className="text-end text-nowrap">{r.requests}</td>
											<td className="text-end text-nowrap">{r.blocked}</td>
											<td className="text-end text-nowrap">{r.allowed}</td>
											<td className="text-secondary text-nowrap">
												{new Date(r.lastSeen).toLocaleString()}
											</td>
											<td className="text-truncate" style={{ maxWidth: 420 }}>
												{r.hosts.join(", ")}
											</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
					)}
				</div>
			</div>
		</div>
	);
};

export default NyxGuardIPs;
