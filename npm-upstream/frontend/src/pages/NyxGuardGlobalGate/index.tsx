import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import {
	getNyxGuardAppsSummary,
	getNyxGuardSettings,
	updateNyxGuardAppsWaf,
	updateNyxGuardSettings,
	type NyxGuardAppsSummary,
	type NyxGuardSettings,
} from "src/api/backend";
import styles from "./index.module.css";

type Draft = NyxGuardSettings;

function asInt(v: string, fallback: number) {
	const n = Number.parseInt(v, 10);
	return Number.isFinite(n) ? n : fallback;
}

const NyxGuardGlobalGate = () => {
	const qc = useQueryClient();
	const settings = useQuery({
		queryKey: ["nyxguard", "settings"],
		queryFn: () => getNyxGuardSettings(),
	});

	const appsSummary = useQuery({
		queryKey: ["nyxguard", "apps", "summary"],
		queryFn: () => getNyxGuardAppsSummary(),
		refetchInterval: 15000,
	});

	const initialDraft = useMemo<Draft | null>(() => (settings.data ? settings.data : null), [settings.data]);
	const [draft, setDraft] = useState<Draft | null>(null);

	useEffect(() => {
		if (!initialDraft) return;
		setDraft(initialDraft);
	}, [initialDraft]);

	const save = useMutation({
		mutationFn: (patch: Partial<NyxGuardSettings>) => updateNyxGuardSettings(patch),
		onMutate: async (patch) => {
			// Make global toggles feel instant across the app by updating the cached settings immediately.
			await qc.cancelQueries({ queryKey: ["nyxguard", "settings"] });
			const prev = qc.getQueryData<NyxGuardSettings>(["nyxguard", "settings"]);
			if (prev) {
				qc.setQueryData<NyxGuardSettings>(["nyxguard", "settings"], { ...prev, ...patch });
			}
			return { prev };
		},
		onError: (_err, _patch, ctx: any) => {
			if (ctx?.prev) qc.setQueryData(["nyxguard", "settings"], ctx.prev);
		},
		onSuccess: async () => {
			await qc.invalidateQueries({ queryKey: ["nyxguard", "settings"] });
			// These views depend on effective enforcement and should refresh when global settings change.
			await qc.invalidateQueries({ queryKey: ["nyxguard", "apps"] });
			await qc.invalidateQueries({ queryKey: ["nyxguard", "apps", "summary"] });
			await qc.invalidateQueries({ queryKey: ["nyxguard", "attacks"] });
			await qc.invalidateQueries({ queryKey: ["nyxguard", "summary"] });
		},
	});

	const wafAll = useMutation({
		mutationFn: (enabled: boolean) => updateNyxGuardAppsWaf(enabled),
		onMutate: async (enabled) => {
			// Optimistically update app list + summary so app-level pages reflect the change instantly.
			await qc.cancelQueries({ queryKey: ["nyxguard", "apps"] });
			await qc.cancelQueries({ queryKey: ["nyxguard", "apps", "summary"] });
			const prevApps = qc.getQueryData<any>(["nyxguard", "apps"]);
			const prevSummary = qc.getQueryData<any>(["nyxguard", "apps", "summary"]);

			if (prevApps?.items) {
				qc.setQueryData(["nyxguard", "apps"], {
					...prevApps,
					items: prevApps.items.map((it: any) => ({
						...it,
						wafEnabled: enabled,
						// When WAF is disabled, protections are effectively disabled at the app level too.
						botDefenseEnabled: enabled ? it.botDefenseEnabled : false,
						ddosEnabled: enabled ? it.ddosEnabled : false,
						sqliEnabled: enabled ? it.sqliEnabled : false,
					})),
				});
			}

			const totalApps = prevSummary?.totalApps ?? (prevApps?.items?.length ?? 0);
			if (totalApps > 0) {
				qc.setQueryData(["nyxguard", "apps", "summary"], {
					totalApps,
					protectedCount: enabled ? totalApps : 0,
				});
			}

			return { prevApps, prevSummary };
		},
		onError: (_err, _enabled, ctx: any) => {
			if (ctx?.prevApps) qc.setQueryData(["nyxguard", "apps"], ctx.prevApps);
			if (ctx?.prevSummary) qc.setQueryData(["nyxguard", "apps", "summary"], ctx.prevSummary);
		},
		onSuccess: async () => {
			await qc.invalidateQueries({ queryKey: ["nyxguard", "apps"] });
			await qc.invalidateQueries({ queryKey: ["nyxguard", "apps", "summary"] });
		},
	});

	if (settings.isLoading || !draft) {
		return (
			<div className={styles.page}>
				<div className="container-xl">
					<div className={styles.card}>Loading GlobalGate Security Layer…</div>
				</div>
			</div>
		);
	}

	const wafState = (() => {
		const s: NyxGuardAppsSummary | undefined = appsSummary.data;
		if (!s || s.totalApps <= 0) return { label: "OFF", className: styles.badgeOff, canToggle: false, next: true };
		if (s.protectedCount <= 0) return { label: "OFF", className: styles.badgeOff, canToggle: true, next: true };
		if (s.protectedCount >= s.totalApps) return { label: "ON", className: styles.badgeOn, canToggle: true, next: false };
		return { label: "PARTIAL", className: styles.badgePartial, canToggle: true, next: true };
	})();

	return (
		<div className={styles.page}>
			<div className="container-xl">
				<div className={styles.card}>
					<h2 className={styles.title}>GlobalGate Security Layer</h2>
					<p className={styles.subtitle}>
						GlobalGate is the central control surface for NyxGuard’s global protections. Changes apply instantly
						after nginx reload and affect all protected applications.
					</p>

					<div className={styles.grid}>
						<div className={styles.section}>
							<div className={styles.sectionTitle}>Global Toggles</div>
							<div className={styles.toggles}>
								<div className={styles.toggleItem}>
									<span>WAF Protection</span>
									<button
										type="button"
										className={wafState.className}
										disabled={!wafState.canToggle || wafAll.isPending}
										onClick={() => wafAll.mutate(wafState.next)}
										title={
											!wafState.canToggle
												? "No proxy hosts found yet."
												: wafState.next
													? "Enable WAF for all proxy hosts"
													: "Disable WAF for all proxy hosts"
										}
									>
										{wafState.label}
									</button>
								</div>
								<div className={styles.toggleItem}>
									<span>Bot Defense</span>
									<button
										type="button"
										className={draft.botDefenseEnabled ? styles.badgeOn : styles.badgeOff}
										disabled={save.isPending}
										onClick={() => {
											const next = !draft.botDefenseEnabled;
											setDraft({ ...draft, botDefenseEnabled: next });
											save.mutate({ botDefenseEnabled: next });
										}}
									>
										{draft.botDefenseEnabled ? "ON" : "OFF"}
									</button>
								</div>
								<div className={styles.toggleItem}>
									<span>DDoS Shield</span>
									<button
										type="button"
										className={draft.ddosEnabled ? styles.badgeOn : styles.badgeOff}
										disabled={save.isPending}
										onClick={() => {
											const next = !draft.ddosEnabled;
											setDraft({ ...draft, ddosEnabled: next });
											save.mutate({ ddosEnabled: next });
										}}
									>
										{draft.ddosEnabled ? "ON" : "OFF"}
									</button>
								</div>
								<div className={styles.toggleItem}>
									<span>SQL Shield</span>
									<button
										type="button"
										className={draft.sqliEnabled ? styles.badgeOn : styles.badgeOff}
										disabled={save.isPending}
										onClick={() => {
											const next = !draft.sqliEnabled;
											setDraft({ ...draft, sqliEnabled: next });
											save.mutate({ sqliEnabled: next });
										}}
									>
										{draft.sqliEnabled ? "ON" : "OFF"}
									</button>
								</div>
								<div className={styles.toggleItem}>
									<span>Authenticated Traffic Bypass</span>
									<button
										type="button"
										className={draft.authBypassEnabled ? styles.badgeOn : styles.badgeOff}
										disabled={save.isPending}
										onClick={() => {
											const next = !draft.authBypassEnabled;
											setDraft({ ...draft, authBypassEnabled: next });
											save.mutate({ authBypassEnabled: next });
										}}
										title="If enabled, authenticated users are far less likely to be blocked by bot/SQL/DDoS protections."
									>
										{draft.authBypassEnabled ? "ON" : "OFF"}
									</button>
								</div>
							</div>
						</div>

						<div className={styles.section}>
							<div className={styles.sectionTitle}>Log Retention</div>
							<div className={styles.field}>
								<div className={styles.label}>NyxGuard log retention (days)</div>
								<select
									className={styles.input}
									value={draft.logRetentionDays}
									onChange={(e) =>
										setDraft({
											...draft,
											logRetentionDays: asInt(e.target.value, draft.logRetentionDays) as Draft["logRetentionDays"],
										})
									}
								>
									<option value={30}>30</option>
									<option value={60}>60</option>
									<option value={90}>90</option>
									<option value={180}>180</option>
								</select>
								<div className={styles.help}>Controls how long proxy access/error logs are kept on disk.</div>
							</div>
						</div>

						<div className={styles.section}>
							<div className={styles.sectionTitle}>DDoS Shield Tuning</div>
							<div className={styles.row}>
								<div className={styles.field}>
									<div className={styles.label}>Rate (requests/sec)</div>
									<input
										className={styles.input}
										type="number"
										min={1}
										max={10000}
										value={draft.ddosRateRps}
										onChange={(e) => setDraft({ ...draft, ddosRateRps: asInt(e.target.value, draft.ddosRateRps) })}
									/>
									<div className={styles.help}>Global limit_req_zone rate.</div>
								</div>
								<div className={styles.field}>
									<div className={styles.label}>Burst</div>
									<input
										className={styles.input}
										type="number"
										min={0}
										max={100000}
										value={draft.ddosBurst}
										onChange={(e) => setDraft({ ...draft, ddosBurst: asInt(e.target.value, draft.ddosBurst) })}
									/>
									<div className={styles.help}>Extra requests allowed during spikes.</div>
								</div>
							</div>
							<div className={styles.row}>
								<div className={styles.field}>
									<div className={styles.label}>Connection limit</div>
									<input
										className={styles.input}
										type="number"
										min={1}
										max={100000}
										value={draft.ddosConnLimit}
										onChange={(e) => setDraft({ ...draft, ddosConnLimit: asInt(e.target.value, draft.ddosConnLimit) })}
									/>
									<div className={styles.help}>limit_conn nyxguard_conn.</div>
								</div>
							</div>
						</div>

						<div className={styles.section}>
							<div className={styles.sectionTitle}>Bot Defense Tuning</div>
							<div className={styles.field}>
								<div className={styles.label}>User-Agent tokens (one per line)</div>
								<textarea
									className={styles.textarea}
									value={draft.botUaTokens}
									onChange={(e) => setDraft({ ...draft, botUaTokens: e.target.value })}
								/>
								<div className={styles.help}>
									Used to identify known bot tools by their User-Agent. One token per line. Case-insensitive substring
									match. Examples: <code>sqlmap</code>, <code>nikto</code>, <code>python-requests</code>,{" "}
									<code>curl</code>.
								</div>
							</div>
							<div className={styles.field} style={{ marginTop: 10 }}>
								<div className={styles.label}>Path tokens (one per line)</div>
								<textarea
									className={styles.textarea}
									value={draft.botPathTokens}
									onChange={(e) => setDraft({ ...draft, botPathTokens: e.target.value })}
								/>
								<div className={styles.help}>
									Used to block common automated scanning paths. One token per line. Case-insensitive substring match
									against the request URI. Examples: <code>wp-login.php</code>, <code>xmlrpc.php</code>,{" "}
									<code>.env</code>, <code>phpmyadmin</code>.
								</div>
							</div>
						</div>

						<div className={styles.section}>
							<div className={styles.sectionTitle}>SQL Shield Tuning</div>
							<div className={styles.row}>
								<div className={styles.field}>
									<div className={styles.label}>Block threshold (score)</div>
									<input
										className={styles.input}
										type="number"
										min={1}
										max={1000}
										value={draft.sqliThreshold}
										onChange={(e) => setDraft({ ...draft, sqliThreshold: asInt(e.target.value, draft.sqliThreshold) })}
									/>
								</div>
								<div className={styles.field}>
									<div className={styles.label}>Max body inspect (bytes)</div>
									<input
										className={styles.input}
										type="number"
										min={0}
										max={1048576}
										value={draft.sqliMaxBody}
										onChange={(e) => setDraft({ ...draft, sqliMaxBody: asInt(e.target.value, draft.sqliMaxBody) })}
									/>
								</div>
							</div>
							<div className={styles.row}>
								<div className={styles.field}>
									<div className={styles.label}>Probe min score</div>
									<input
										className={styles.input}
										type="number"
										min={0}
										max={1000}
										value={draft.sqliProbeMinScore}
										onChange={(e) =>
											setDraft({ ...draft, sqliProbeMinScore: asInt(e.target.value, draft.sqliProbeMinScore) })
										}
									/>
									<div className={styles.help}>Scores above this count toward correlation.</div>
								</div>
								<div className={styles.field}>
									<div className={styles.label}>Probe ban score</div>
									<input
										className={styles.input}
										type="number"
										min={1}
										max={100000}
										value={draft.sqliProbeBanScore}
										onChange={(e) =>
											setDraft({ ...draft, sqliProbeBanScore: asInt(e.target.value, draft.sqliProbeBanScore) })
										}
									/>
								</div>
							</div>
							<div className={styles.row}>
								<div className={styles.field}>
									<div className={styles.label}>Probe window (seconds)</div>
									<input
										className={styles.input}
										type="number"
										min={1}
										max={600}
										value={draft.sqliProbeWindowSec}
										onChange={(e) =>
											setDraft({ ...draft, sqliProbeWindowSec: asInt(e.target.value, draft.sqliProbeWindowSec) })
										}
									/>
								</div>
							</div>
						</div>

						<div className={styles.section}>
							<div className={styles.sectionTitle}>Failed Login Auto-Ban</div>
							<div className={styles.row}>
								<div className={styles.field}>
									<div className={styles.label}>Threshold (attempts)</div>
									<input
										className={styles.input}
										type="number"
										min={1}
										max={1000}
										value={draft.authfailThreshold}
										onChange={(e) =>
											setDraft({ ...draft, authfailThreshold: asInt(e.target.value, draft.authfailThreshold) })
										}
									/>
								</div>
								<div className={styles.field}>
									<div className={styles.label}>Window (seconds)</div>
									<input
										className={styles.input}
										type="number"
										min={5}
										max={3600}
										value={draft.authfailWindowSec}
										onChange={(e) =>
											setDraft({ ...draft, authfailWindowSec: asInt(e.target.value, draft.authfailWindowSec) })
										}
									/>
								</div>
							</div>
							<div className={styles.row}>
								<div className={styles.field}>
									<div className={styles.label}>Ban duration (hours)</div>
									<input
										className={styles.input}
										type="number"
										min={1}
										max={8760}
										value={draft.authfailBanHours}
										onChange={(e) =>
											setDraft({ ...draft, authfailBanHours: asInt(e.target.value, draft.authfailBanHours) })
										}
									/>
									<div className={styles.help}>Default is 24 hours.</div>
								</div>
							</div>
						</div>
					</div>

					<div className={styles.actions}>
						<button
							type="button"
							className={styles.primary}
							disabled={save.isPending}
							onClick={() => save.mutate(draft)}
						>
							Save GlobalGate Settings
						</button>
						<button
							type="button"
							className={styles.ghost}
							disabled={save.isPending}
							onClick={() => setDraft(settings.data ?? draft)}
						>
							Reset
						</button>
					</div>

					{settings.isError || save.isError ? (
						<div className={styles.error}>Unable to save settings. Check API and try again.</div>
					) : null}
				</div>
			</div>
		</div>
	);
};

export default NyxGuardGlobalGate;
