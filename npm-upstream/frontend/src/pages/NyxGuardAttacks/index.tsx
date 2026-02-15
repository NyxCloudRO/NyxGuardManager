import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import cn from "classnames";
import { useState } from "react";
import { clearNyxGuardLogs, getNyxGuardAttacks, updateNyxGuardAttackBan, type NyxGuardAttackItem, type NyxGuardAttackType } from "src/api/backend";
import { intl, T } from "src/locale";
import { showError, showSuccess } from "src/notifications";
import styles from "./index.module.css";

function typeClass(t: NyxGuardAttackType) {
	if (t === "sqli") return cn(styles.pill, styles.pillSqli);
	if (t === "ddos") return cn(styles.pill, styles.pillDdos);
	return cn(styles.pill, styles.pillBot);
}

function typeLabel(t: NyxGuardAttackType) {
	if (t === "sqli") return intl.formatMessage({ id: "nyxguard.attacks.type.sql" });
	if (t === "ddos") return intl.formatMessage({ id: "nyxguard.attacks.type.ddos" });
	return intl.formatMessage({ id: "nyxguard.attacks.type.bot" });
}

function banLabel(item: NyxGuardAttackItem) {
	const ban = item.ban;
	if (!ban || !ban.enabled) return intl.formatMessage({ id: "nyxguard.attacks.status.not-banned" });
	if (!ban.expiresOn) return intl.formatMessage({ id: "nyxguard.attacks.status.permanent" });
	const ms = Date.parse(ban.expiresOn);
	if (!Number.isFinite(ms)) return intl.formatMessage({ id: "nyxguard.attacks.status.banned" });
	return intl.formatMessage({ id: "nyxguard.attacks.status.until" }, { date: new Date(ms).toLocaleString() });
}

const NyxGuardAttacks = () => {
	const qc = useQueryClient();
	const [days, setDays] = useState<1 | 7 | 30>(1);

	const attacks = useQuery({
		queryKey: ["nyxguard", "attacks", days],
		queryFn: () => getNyxGuardAttacks(days, 200),
		refetchInterval: days === 1 ? 15000 : 60000,
	});

	const ban = useMutation({
		mutationFn: (args: { ip: string; duration: "24h" | "30d" | "permanent" }) => updateNyxGuardAttackBan(args.ip, args.duration),
		onSuccess: async (_data, args) => {
			showSuccess(intl.formatMessage({ id: "nyxguard.attacks.updated-ban" }, { ip: args.ip }));
			await qc.invalidateQueries({ queryKey: ["nyxguard", "attacks"] });
		},
		onError: (err: any) => {
			showError(err instanceof Error ? err.message : intl.formatMessage({ id: "nyxguard.attacks.failed-update-ban" }));
		},
	});
	const clearLogs = useMutation({
		mutationFn: () => clearNyxGuardLogs({ target: "attacks", days }),
		onSuccess: async () => {
			showSuccess(intl.formatMessage({ id: "nyxguard.attacks.logs-cleared" }));
			await qc.invalidateQueries({ queryKey: ["nyxguard", "attacks"] });
			await qc.invalidateQueries({ queryKey: ["nyxguard", "attacks", "summary"] });
		},
		onError: (err: any) => {
			showError(err instanceof Error ? err.message : intl.formatMessage({ id: "nyxguard.attacks.failed-clear" }));
		},
	});

	return (
		<div className={styles.page}>
			<div className="container-xl">
				<div className={styles.card}>
					<div className={styles.titleRow}>
						<div>
							<h2 className={styles.title}>
								<T id="nyxguard-attacks" />
							</h2>
							<p className={styles.subtitle}>
								<T id="nyxguard.attacks.subtitle" />
							</p>
						</div>
						<div className={styles.windowGroup}>
							<button type="button" className={days === 1 ? styles.windowActive : styles.window} onClick={() => setDays(1)}>
								<T id="nyxguard.attacks.day-1" />
							</button>
							<button type="button" className={days === 7 ? styles.windowActive : styles.window} onClick={() => setDays(7)}>
								<T id="nyxguard.attacks.day-7" />
							</button>
							<button type="button" className={days === 30 ? styles.windowActive : styles.window} onClick={() => setDays(30)}>
								<T id="nyxguard.attacks.day-30" />
							</button>
							<button
								type="button"
								className={styles.window}
								disabled={clearLogs.isPending}
								onClick={() => {
									const ok = window.confirm(intl.formatMessage({ id: "nyxguard.attacks.clear-confirm" }, { days }));
									if (!ok) return;
									clearLogs.mutate();
								}}
							>
								<T id="nyxguard.attacks.clear-logs" />
							</button>
						</div>
					</div>

					{attacks.isLoading ? (
						<div className={styles.placeholder}>
							<T id="loading" />
						</div>
					) : attacks.isError ? (
						<div className={styles.placeholder}>
							<T id="nyxguard.attacks.load-error" />
						</div>
					) : (attacks.data?.items?.length ?? 0) === 0 ? (
						<div className={styles.placeholder}>
							<T id="nyxguard.attacks.empty" />
						</div>
					) : (
						<div className={`nyx-scroll-y nyx-scroll-theme ${styles.tableViewport}`}>
							<table className={cn("table table-sm table-vcenter", styles.table)}>
								<thead>
									<tr>
										<th><T id="nyxguard.attacks.table.ip" /></th>
										<th><T id="nyxguard.attacks.table.type" /></th>
										<th className="text-end"><T id="nyxguard.attacks.table.count" /></th>
										<th><T id="nyxguard.attacks.table.last-seen" /></th>
										<th><T id="nyxguard.attacks.table.ban" /></th>
										<th className="text-end"><T id="nyxguard.attacks.table.adjust" /></th>
									</tr>
								</thead>
								<tbody>
									{(attacks.data?.items ?? []).map((it) => (
										<tr key={`${it.ip}-${it.type}`}>
											<td className="text-nowrap">{it.ip}</td>
											<td className="text-nowrap">
												<span className={typeClass(it.type)}>{typeLabel(it.type)}</span>
											</td>
											<td className="text-end text-nowrap">{it.count.toLocaleString()}</td>
											<td className="text-nowrap text-secondary">{new Date(it.lastSeen).toLocaleString()}</td>
											<td className="text-nowrap text-secondary">{banLabel(it)}</td>
											<td className="text-end text-nowrap">
												<select
													className={cn("form-select form-select-sm", styles.banSelect)}
													disabled={ban.isPending}
													defaultValue=""
													onChange={(e) => {
														const v = e.target.value;
														if (v !== "24h" && v !== "30d" && v !== "permanent") return;
														ban.mutate({ ip: it.ip, duration: v });
														e.target.value = "";
													}}
												>
													<option value="" disabled>
														<T id="nyxguard.attacks.set-ban" />
													</option>
													<option value="24h"><T id="nyxguard.attacks.duration-24h" /></option>
													<option value="30d"><T id="nyxguard.attacks.duration-30d" /></option>
													<option value="permanent"><T id="nyxguard.attacks.duration-permanent" /></option>
												</select>
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

export default NyxGuardAttacks;
