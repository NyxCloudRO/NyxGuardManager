import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
	clearNyxGuardLogs,
	clearNyxGuardGeoipUpdateConfig,
	getNyxGuardGeoip,
	getNyxGuardIps,
	getNyxGuardSettings,
	setNyxGuardGeoipUpdateConfig,
	uploadNyxGuardGeoip,
	updateNyxGuardSettings,
} from "src/api/backend";
import type { NyxGuardSettings } from "src/api/backend";
import type { GeoipProvider } from "src/api/backend/getNyxGuardGeoip";
import { intl, T } from "src/locale";
import styles from "./index.module.css";

const NyxGuardIPs = () => {
	const [windowMinutes, setWindowMinutes] = useState(15);
	const qc = useQueryClient();
	const [geoipFile, setGeoipFile] = useState<File | null>(null);
	const [geoipProvider, setGeoipProvider] = useState<GeoipProvider>("maxmind");
	const [mmAccountId, setMmAccountId] = useState("");
	const [mmLicenseKey, setMmLicenseKey] = useState("");
	const [retentionDays, setRetentionDays] = useState<30 | 60 | 90 | 180>(90);

	const windowLabel = (() => {
		switch (windowMinutes) {
			case 15:
				return intl.formatMessage({ id: "nyxguard.ips.window.15m" });
			case 30:
				return intl.formatMessage({ id: "nyxguard.ips.window.30m" });
			case 60:
				return intl.formatMessage({ id: "nyxguard.ips.window.60m" });
			case 1440:
				return intl.formatMessage({ id: "nyxguard.ips.window.1d" });
			case 10080:
				return intl.formatMessage({ id: "nyxguard.ips.window.7d" });
			case 43200:
				return intl.formatMessage({ id: "nyxguard.ips.window.30d" });
			case 86400:
				return intl.formatMessage({ id: "nyxguard.ips.window.60d" });
			case 129600:
				return intl.formatMessage({ id: "nyxguard.ips.window.90d" });
			default:
				return intl.formatMessage({ id: "nyxguard.ips.window.minutes" }, { minutes: windowMinutes });
		}
	})();

	const settings = useQuery<NyxGuardSettings>({
		queryKey: ["nyxguard", "settings"],
		queryFn: () => getNyxGuardSettings(),
		refetchInterval: 60000,
	});
	useEffect(() => {
		if (!settings.data) return;
		setRetentionDays(settings.data.logRetentionDays);
	}, [settings.data]);

	const applyRetention = useMutation({
		mutationFn: () => updateNyxGuardSettings({ logRetentionDays: retentionDays }),
		onSuccess: async () => {
			await qc.invalidateQueries({ queryKey: ["nyxguard", "settings"] });
		},
	});

	const geoip = useQuery({
		queryKey: ["nyxguard", "geoip"],
		queryFn: () => getNyxGuardGeoip(),
		refetchInterval: 60000,
	});
	const installedMaxMind = geoip.data?.providers?.maxmind?.installed ?? geoip.data?.installed ?? false;
	const installedIp2 = geoip.data?.providers?.ip2location?.installed ?? false;

	const uploadGeoip = useMutation({
		mutationFn: async () => {
			if (!geoipFile) return;
			await uploadNyxGuardGeoip(geoipFile, geoipProvider);
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
	const clearLogs = useMutation({
		mutationFn: () => clearNyxGuardLogs({ target: "ips", minutes: windowMinutes }),
		onSuccess: async () => {
			await qc.invalidateQueries({ queryKey: ["nyxguard", "summary"] });
			await qc.invalidateQueries({ queryKey: ["nyxguard", "ips"] });
		},
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

	return (
		<div className={styles.page}>
			<div className="container-xl">
				<div className={styles.card}>
					<div className={styles.headerRow}>
						<h2 className={styles.title}><T id="nyxguard.ips.title" /></h2>
						<div className={styles.windowButtons}>
							<button
								type="button"
								className={windowMinutes === 15 ? styles.windowActive : styles.window}
								onClick={() => setWindowMinutes(15)}
							>
								<T id="nyxguard.ips.window.last-15m" />
							</button>
							<button
								type="button"
								className={windowMinutes === 30 ? styles.windowActive : styles.window}
								onClick={() => setWindowMinutes(30)}
							>
								<T id="nyxguard.ips.window.last-30m" />
							</button>
							<button
								type="button"
								className={windowMinutes === 60 ? styles.windowActive : styles.window}
								onClick={() => setWindowMinutes(60)}
							>
								<T id="nyxguard.ips.window.last-60m" />
							</button>
							<button
								type="button"
								className={windowMinutes === 1440 ? styles.windowActive : styles.window}
								onClick={() => setWindowMinutes(1440)}
							>
								<T id="nyxguard.ips.window.last-1d" />
							</button>
							<button
								type="button"
								className={windowMinutes === 10080 ? styles.windowActive : styles.window}
								onClick={() => setWindowMinutes(10080)}
							>
								<T id="nyxguard.ips.window.last-7d" />
							</button>
							<button
								type="button"
								className={windowMinutes === 43200 ? styles.windowActive : styles.window}
								onClick={() => setWindowMinutes(43200)}
							>
								<T id="nyxguard.ips.window.last-30d" />
							</button>
							<button
								type="button"
								className={windowMinutes === 86400 ? styles.windowActive : styles.window}
								onClick={() => setWindowMinutes(86400)}
							>
								<T id="nyxguard.ips.window.last-60d" />
							</button>
							<button
								type="button"
								className={windowMinutes === 129600 ? styles.windowActive : styles.window}
								onClick={() => setWindowMinutes(129600)}
							>
								<T id="nyxguard.ips.window.last-90d" />
							</button>
							<button
								type="button"
								className={`${styles.window} ${styles.exportButton}`}
								disabled={!ips.data?.items?.length || ips.isLoading}
								onClick={exportIpsJson}
								title={
									ips.data?.items?.length
										? intl.formatMessage({ id: "nyxguard.ips.export.tooltip" })
										: intl.formatMessage({ id: "nyxguard.ips.export.no-data" })
								}
							>
								<T id="nyxguard.ips.export-json" />
							</button>
							<button
								type="button"
								className={styles.window}
								disabled={clearLogs.isPending}
								onClick={() => {
									const ok = window.confirm(
										intl.formatMessage({ id: "nyxguard.ips.clear-confirm" }, { window: windowLabel }),
									);
									if (!ok) return;
									clearLogs.mutate();
								}}
							>
								<T id="nyxguard.ips.clear-logs" />
							</button>
						</div>
					</div>
					<p className={styles.subtitle}>
						<T id="nyxguard.ips.subtitle" />
					</p>

					<div className="d-flex align-items-center gap-2 mb-3 flex-wrap">
						<div className="text-secondary text-uppercase" style={{ fontSize: 11, letterSpacing: "0.08em" }}>
							<T id="nyxguard.ips.log-retention" />
						</div>
						<select
							value={retentionDays}
							onChange={(e) => setRetentionDays(Number.parseInt(e.target.value, 10) as 30 | 60 | 90 | 180)}
							className="form-select form-select-sm"
							style={{ width: 140 }}
						>
							<option value={30}>{intl.formatMessage({ id: "nyxguard.ips.days" }, { days: 30 })}</option>
							<option value={60}>{intl.formatMessage({ id: "nyxguard.ips.days" }, { days: 60 })}</option>
							<option value={90}>{intl.formatMessage({ id: "nyxguard.ips.days" }, { days: 90 })}</option>
							<option value={180}>{intl.formatMessage({ id: "nyxguard.ips.days" }, { days: 180 })}</option>
						</select>
						<button
							type="button"
							className={styles.applyBtn}
							disabled={applyRetention.isPending || retentionDays === (settings.data?.logRetentionDays ?? 90)}
							onClick={() => applyRetention.mutate()}
						>
							<T id="apply" />
						</button>
					</div>

					<div className="d-flex align-items-center gap-2 mb-3 flex-wrap">
						<div className="text-secondary text-uppercase" style={{ fontSize: 11, letterSpacing: "0.08em" }}>
							<T id="nyxguard.ips.geoip-db" />
						</div>
						<div className="text-secondary">
							{geoip.isLoading
								? intl.formatMessage({ id: "nyxguard.ips.status.checking" })
								: geoipProvider === "ip2location"
									? installedIp2
										? intl.formatMessage({ id: "nyxguard.ips.status.installed" })
										: intl.formatMessage({ id: "nyxguard.ips.status.not-installed" })
									: installedMaxMind
										? intl.formatMessage({ id: "nyxguard.ips.status.installed" })
										: intl.formatMessage({ id: "nyxguard.ips.status.not-installed" })}
						</div>
						<select
							value={geoipProvider}
							onChange={(e) => setGeoipProvider(e.target.value as GeoipProvider)}
							className="form-select form-select-sm"
							style={{ width: 190 }}
							title={intl.formatMessage({ id: "nyxguard.ips.geoip-provider-title" })}
						>
							<option value="maxmind">MaxMind GeoLite2</option>
							<option value="ip2location">IP2Location (.mmdb)</option>
						</select>
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
							<T id="nyxguard.ips.upload" />
						</button>
						{uploadGeoip.isError ? (
							<div className="text-danger">
								{intl.formatMessage({ id: "nyxguard.ips.upload-failed" })}
								{uploadGeoip.error instanceof Error ? `: ${uploadGeoip.error.message}` : "."}
							</div>
						) : null}
					</div>

					<div className="d-flex align-items-center gap-2 mb-3 flex-wrap">
						<div className="text-secondary text-uppercase" style={{ fontSize: 11, letterSpacing: "0.08em" }}>
							<T id="nyxguard.ips.auto-update" />
						</div>
						<div className="text-secondary">
							{geoip.isLoading
								? intl.formatMessage({ id: "nyxguard.ips.status.checking" })
								: geoip.data?.updateConfigured
									? intl.formatMessage({ id: "nyxguard.ips.status.configured" })
									: intl.formatMessage({ id: "nyxguard.ips.status.not-configured" })}
						</div>
						{geoip.data?.updateConfigured ? (
							<button
								type="button"
								className={styles.applyBtn}
								disabled={clearGeoipConfig.isPending}
								onClick={() => clearGeoipConfig.mutate()}
							>
								<T id="nyxguard.ips.clear" />
							</button>
						) : (
							<>
								<input
									value={mmAccountId}
									onChange={(e) => setMmAccountId(e.target.value)}
									placeholder={intl.formatMessage({ id: "nyxguard.ips.maxmind-account-id" })}
									className="form-control form-control-sm"
									style={{ width: 180 }}
								/>
								<input
									value={mmLicenseKey}
									onChange={(e) => setMmLicenseKey(e.target.value)}
									placeholder={intl.formatMessage({ id: "nyxguard.ips.maxmind-license-key" })}
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
									<T id="save" />
								</button>
							</>
						)}
						{saveGeoipConfig.isError ? (
							<div className="text-danger">
								{intl.formatMessage({ id: "nyxguard.ips.save-failed" })}
								{saveGeoipConfig.error instanceof Error ? `: ${saveGeoipConfig.error.message}` : "."}
							</div>
						) : null}
					</div>

					{ips.isLoading ? (
						<div className={styles.emptyState}><T id="loading" /></div>
					) : ips.isError ? (
						<div className={styles.emptyState}><T id="nyxguard.ips.load-error" /></div>
					) : (ips.data?.items?.length ?? 0) === 0 ? (
						<div className={styles.emptyState}>
							{intl.formatMessage({ id: "nyxguard.ips.empty-window" }, { window: windowLabel })}
						</div>
					) : (
						<div className={`nyx-scroll-y nyx-scroll-theme ${styles.tableViewport}`}>
							<table className="table table-sm table-vcenter">
								<thead>
									<tr>
										<th><T id="nyxguard.ips.table.ip" /></th>
										<th><T id="nyxguard.ips.table.country" /></th>
										<th className="text-end"><T id="nyxguard.ips.table.requests" /></th>
										<th className="text-end"><T id="nyxguard.ips.table.blocked" /></th>
										<th className="text-end"><T id="nyxguard.ips.table.allowed" /></th>
										<th><T id="nyxguard.ips.table.last-seen" /></th>
										<th><T id="nyxguard.ips.table.hosts" /></th>
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
