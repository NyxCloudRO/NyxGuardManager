import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import cn from "classnames";
import { useState } from "react";
import { getNyxGuardAttacks, updateNyxGuardAttackBan, type NyxGuardAttackItem, type NyxGuardAttackType } from "src/api/backend";
import { showError, showSuccess } from "src/notifications";
import styles from "./index.module.css";

function typeClass(t: NyxGuardAttackType) {
	if (t === "sqli") return cn(styles.pill, styles.pillSqli);
	if (t === "ddos") return cn(styles.pill, styles.pillDdos);
	return cn(styles.pill, styles.pillBot);
}

function typeLabel(t: NyxGuardAttackType) {
	if (t === "sqli") return "SQL";
	if (t === "ddos") return "DDoS";
	return "Bot";
}

function banLabel(item: NyxGuardAttackItem) {
	const ban = item.ban;
	if (!ban || !ban.enabled) return "Not banned";
	if (!ban.expiresOn) return "Permanent";
	const ms = Date.parse(ban.expiresOn);
	if (!Number.isFinite(ms)) return "Banned";
	return `Until ${new Date(ms).toLocaleString()}`;
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
			showSuccess(`Updated ban for ${args.ip}`);
			await qc.invalidateQueries({ queryKey: ["nyxguard", "attacks"] });
		},
		onError: (err: any) => {
			showError(err instanceof Error ? err.message : "Failed to update ban.");
		},
	});

	return (
		<div className={styles.page}>
			<div className="container-xl">
				<div className={styles.card}>
					<div className={styles.titleRow}>
						<div>
							<h2 className={styles.title}>Attacks</h2>
							<p className={styles.subtitle}>Recent bot, DDoS, and SQL activity detected by NyxGuard.</p>
						</div>
						<div className={styles.windowGroup}>
							<button type="button" className={days === 1 ? styles.windowActive : styles.window} onClick={() => setDays(1)}>
								1 day
							</button>
							<button type="button" className={days === 7 ? styles.windowActive : styles.window} onClick={() => setDays(7)}>
								7 days
							</button>
							<button type="button" className={days === 30 ? styles.windowActive : styles.window} onClick={() => setDays(30)}>
								30 days
							</button>
						</div>
					</div>

					{attacks.isLoading ? (
						<div className={styles.placeholder}>Loading…</div>
					) : attacks.isError ? (
						<div className={styles.placeholder}>Unable to load attacks (API error).</div>
					) : (attacks.data?.items?.length ?? 0) === 0 ? (
						<div className={styles.placeholder}>No attacks detected in this window.</div>
					) : (
						<div style={{ overflowX: "auto" }}>
							<table className={cn("table table-sm table-vcenter", styles.table)}>
								<thead>
									<tr>
										<th>IP</th>
										<th>Type</th>
										<th className="text-end">Count</th>
										<th>Last Seen</th>
										<th>Ban</th>
										<th className="text-end">Adjust</th>
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
														Set ban…
													</option>
													<option value="24h">24 hours</option>
													<option value="30d">30 days</option>
													<option value="permanent">Permanent</option>
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
