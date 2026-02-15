import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
	createNyxGuardCountryRule,
	createNyxGuardIpRule,
	deleteNyxGuardCountryRule,
	deleteNyxGuardCountryRules,
	deleteNyxGuardIpRule,
	deleteNyxGuardIpRules,
	getNyxGuardCountryRules,
	getNyxGuardIpRules,
	updateNyxGuardCountryRule,
	updateNyxGuardIpRule,
} from "src/api/backend";
import { intl, T } from "src/locale";
import { showError, showSuccess } from "src/notifications";
import styles from "./index.module.css";

const NyxGuardRules = () => {
	const qc = useQueryClient();
	const [searchParams, setSearchParams] = useSearchParams();
	const queryType = (searchParams.get("type") ?? "").toLowerCase();
	const initialRuleType = queryType === "country" ? "country" : "ip";
	const [ruleType, setRuleType] = useState<"ip" | "country">(initialRuleType);
	const [action, setAction] = useState<"allow" | "deny">("deny");
	const [ipCidr, setIpCidr] = useState("");
	const [countryCode, setCountryCode] = useState("");
	const [note, setNote] = useState("");
	const [expiresInDays, setExpiresInDays] = useState<1 | 7 | 30 | 60 | 90 | 180 | null>(null);

	const ipRules = useQuery({
		queryKey: ["nyxguard", "rules", "ip"],
		queryFn: () => getNyxGuardIpRules(),
	});

	const countryRules = useQuery({
		queryKey: ["nyxguard", "rules", "country"],
		queryFn: () => getNyxGuardCountryRules(),
	});

	const createIpRule = useMutation({
		mutationFn: () =>
			createNyxGuardIpRule({
				action,
				ipCidr: ipCidr.trim(),
				note: note.trim() ? note.trim() : null,
				expiresInDays,
			}),
		onSuccess: async (created) => {
			setIpCidr("");
			setNote("");
			setExpiresInDays(null);
			qc.setQueryData(["nyxguard", "rules", "ip"], (prev: any) => {
				const items = Array.isArray(prev?.items) ? prev.items : [];
				return { ...(prev ?? {}), items: [created, ...items] };
			});
			showSuccess(intl.formatMessage({ id: "nyxguard.rules.added" }));
			await qc.invalidateQueries({ queryKey: ["nyxguard", "rules", "ip"] });
		},
		onError: (err: any) => {
			const msg = err instanceof Error ? err.message : intl.formatMessage({ id: "nyxguard.rules.add-ip-failed" });
			showError(msg);
		},
	});

	const createCountryRule = useMutation({
		mutationFn: () =>
			createNyxGuardCountryRule({
				action,
				countryCode: countryCode.trim().toUpperCase(),
				note: note.trim() ? note.trim() : null,
				expiresInDays,
			}),
		onSuccess: async (created) => {
			setCountryCode("");
			setNote("");
			setExpiresInDays(null);
			qc.setQueryData(["nyxguard", "rules", "country"], (prev: any) => {
				const items = Array.isArray(prev?.items) ? prev.items : [];
				return { ...(prev ?? {}), items: [created, ...items] };
			});
			showSuccess(intl.formatMessage({ id: "nyxguard.rules.added" }));
			await qc.invalidateQueries({ queryKey: ["nyxguard", "rules", "country"] });
		},
		onError: (err: any) => {
			const msg = err instanceof Error ? err.message : intl.formatMessage({ id: "nyxguard.rules.add-country-failed" });
			showError(msg);
		},
	});

	const toggleIpEnabled = useMutation({
		mutationFn: (args: { id: number; enabled: boolean }) => updateNyxGuardIpRule(args.id, { enabled: args.enabled }),
		onSuccess: () => qc.invalidateQueries({ queryKey: ["nyxguard", "rules", "ip"] }),
	});

	const toggleCountryEnabled = useMutation({
		mutationFn: (args: { id: number; enabled: boolean }) =>
			updateNyxGuardCountryRule(args.id, { enabled: args.enabled }),
		onSuccess: () => qc.invalidateQueries({ queryKey: ["nyxguard", "rules", "country"] }),
	});

	const removeIpRule = useMutation({
		mutationFn: (id: number) => deleteNyxGuardIpRule(id),
		onSuccess: () => qc.invalidateQueries({ queryKey: ["nyxguard", "rules", "ip"] }),
	});

	const removeCountryRule = useMutation({
		mutationFn: (id: number) => deleteNyxGuardCountryRule(id),
		onSuccess: () => qc.invalidateQueries({ queryKey: ["nyxguard", "rules", "country"] }),
	});
	const removeAllIpRules = useMutation({
		mutationFn: () => deleteNyxGuardIpRules(),
		onSuccess: async (res) => {
			showSuccess(intl.formatMessage({ id: "nyxguard.rules.deleted-ip" }, { count: res.deleted }));
			await qc.invalidateQueries({ queryKey: ["nyxguard", "rules", "ip"] });
		},
		onError: (err: any) => {
			showError(err instanceof Error ? err.message : intl.formatMessage({ id: "nyxguard.rules.delete-ip-failed" }));
		},
	});
	const removeAllCountryRules = useMutation({
		mutationFn: () => deleteNyxGuardCountryRules(),
		onSuccess: async (res) => {
			showSuccess(intl.formatMessage({ id: "nyxguard.rules.deleted-country" }, { count: res.deleted }));
			await qc.invalidateQueries({ queryKey: ["nyxguard", "rules", "country"] });
		},
		onError: (err: any) => {
			showError(err instanceof Error ? err.message : intl.formatMessage({ id: "nyxguard.rules.delete-country-failed" }));
		},
	});

	const hasError = useMemo(() => {
		if (ruleType === "ip") {
			const v = ipCidr.trim();
			if (!v) return intl.formatMessage({ id: "nyxguard.rules.ip-required" });
			if (!/^[0-9a-fA-F:./]+$/.test(v)) return intl.formatMessage({ id: "nyxguard.rules.ip-invalid" });
			return null;
		}
		const v = countryCode.trim().toUpperCase();
		if (!v) return intl.formatMessage({ id: "nyxguard.rules.country-required" });
		if (!/^[A-Z]{2}$/.test(v)) return intl.formatMessage({ id: "nyxguard.rules.country-invalid" });
		return null;
	}, [countryCode, ipCidr, ruleType]);

	// Keep state in sync with deep-links like /nyxguard/rules?type=country
	useEffect(() => {
		if (queryType !== "ip" && queryType !== "country") return;
		setRuleType(queryType);
	}, [queryType]);

	return (
		<div className={styles.page}>
			<div className="container-xl">
				<div className={styles.card}>
					<h2 className={styles.title}>
						<T id="nyxguard-rules" />
					</h2>
					<p className={styles.subtitle}>
						<T id="nyxguard.rules.subtitle" />
					</p>

					<div className={styles.builder}>
						<div>
							<div className={styles.label}><T id="nyxguard.rules.rule-type" /></div>
							<div className={styles.row}>
								<button
									type="button"
									className={ruleType === "ip" ? styles.pillActiveBtn : styles.pillBtn}
									onClick={() => {
										setRuleType("ip");
										setSearchParams((prev) => {
											const next = new URLSearchParams(prev);
											next.set("type", "ip");
											return next;
										});
									}}
								>
									<T id="nyxguard.rules.ip-range" />
								</button>
								<button
									type="button"
									className={ruleType === "country" ? styles.pillActiveBtn : styles.pillBtn}
									onClick={() => {
										setRuleType("country");
										setSearchParams((prev) => {
											const next = new URLSearchParams(prev);
											next.set("type", "country");
											return next;
										});
									}}
								>
									<T id="nyxguard.rules.country" />
								</button>
							</div>
						</div>

						<div>
							<div className={styles.label}><T id="value" /></div>
							{ruleType === "ip" ? (
								<>
									<input
										className={styles.input}
										value={ipCidr}
										onChange={(e) => setIpCidr(e.target.value)}
										placeholder={intl.formatMessage({ id: "nyxguard.rules.ip-placeholder" })}
									/>
									{hasError ? <div className="text-danger mt-2">{hasError}</div> : null}
								</>
							) : (
								<>
									<input
										className={styles.input}
										value={countryCode}
										onChange={(e) => setCountryCode(e.target.value)}
										placeholder={intl.formatMessage({ id: "nyxguard.rules.country-placeholder" })}
									/>
									{hasError ? <div className="text-danger mt-2">{hasError}</div> : null}
								</>
							)}
						</div>

						<div>
							<div className={styles.label}><T id="action" /></div>
							<div className={styles.row}>
								<button
									type="button"
									className={action === "allow" ? styles.pillActiveBtn : styles.pillBtn}
									onClick={() => setAction("allow")}
								>
									<T id="allow" />
								</button>
								<button
									type="button"
									className={action === "deny" ? styles.pillActiveBtn : styles.pillBtn}
									onClick={() => setAction("deny")}
								>
									<T id="deny" />
								</button>
							</div>
						</div>

						<div>
							<div className={styles.label}><T id="duration" /></div>
							<select
								className={styles.input}
								value={expiresInDays ?? ""}
								onChange={(e) => {
									const v = e.target.value;
									setExpiresInDays(v === "" ? null : (Number.parseInt(v, 10) as 1 | 7 | 30 | 60 | 90 | 180));
								}}
							>
								<option value=""><T id="nyxguard.rules.permanent" /></option>
								<option value={1}><T id="nyxguard.rules.days-1" /></option>
								<option value={7}><T id="nyxguard.rules.days-7" /></option>
								<option value={30}><T id="nyxguard.rules.days-30" /></option>
								<option value={60}><T id="nyxguard.rules.days-60" /></option>
								<option value={90}><T id="nyxguard.rules.days-90" /></option>
								<option value={180}><T id="nyxguard.rules.days-180" /></option>
							</select>
						</div>

						<div>
							<div className={styles.label}><T id="nyxguard.rules.note-optional" /></div>
							<input
								className={styles.input}
								value={note}
								onChange={(e) => setNote(e.target.value)}
								placeholder={intl.formatMessage({ id: "nyxguard.rules.note-placeholder" })}
							/>
						</div>

						<div className={styles.actions}>
							<button
								className={styles.primary}
								type="button"
								disabled={!!hasError || createIpRule.isPending || createCountryRule.isPending}
								onClick={() => {
									if (ruleType === "ip") createIpRule.mutate();
									else createCountryRule.mutate();
								}}
							>
								<T id="nyxguard.rules.save-rule" />
							</button>
						</div>
					</div>

					<div className={styles.rulesList}>
						<div className={styles.listHeader}>
							<div className={styles.label}><T id="nyxguard.rules.active-rules" /></div>
							<button
								type="button"
								className={styles.ghost}
								disabled={
									removeAllIpRules.isPending ||
									removeAllCountryRules.isPending ||
									(ruleType === "ip"
										? (ipRules.data?.items?.length ?? 0) === 0
										: (countryRules.data?.items?.length ?? 0) === 0)
								}
								onClick={() => {
									if (ruleType === "ip") {
										const count = ipRules.data?.items?.length ?? 0;
										if (!window.confirm(intl.formatMessage({ id: "nyxguard.rules.delete-all-ip-confirm" }, { count }))) return;
										removeAllIpRules.mutate();
										return;
									}
									const count = countryRules.data?.items?.length ?? 0;
									if (!window.confirm(intl.formatMessage({ id: "nyxguard.rules.delete-all-country-confirm" }, { count }))) return;
									removeAllCountryRules.mutate();
								}}
							>
								<T id="nyxguard.rules.delete-all" />
							</button>
						</div>
					{ruleType === "ip" ? (
						ipRules.isLoading ? (
							<div className={styles.emptyState}><T id="loading" /></div>
						) : ipRules.isError ? (
							<div className={styles.emptyState}><T id="nyxguard.rules.load-error" /></div>
						) : (ipRules.data?.items?.length ?? 0) === 0 ? (
							<div className={styles.emptyState}><T id="nyxguard.rules.no-ip-rules" /></div>
						) : (
							<div className={`nyx-scroll-y nyx-scroll-theme ${styles.tableViewport}`}>
								<table className="table table-sm table-vcenter">
									<thead>
										<tr>
											<th><T id="enabled" /></th>
											<th><T id="action" /></th>
											<th>IP/CIDR</th>
											<th>Note</th>
											<th><T id="expires" /></th>
											<th className="text-end"><T id="actions" /></th>
										</tr>
									</thead>
									<tbody>
										{(ipRules.data?.items ?? []).map((r) => (
											<tr key={r.id}>
												<td className="text-nowrap">
													<input
														type="checkbox"
														checked={r.enabled}
														onChange={(e) => toggleIpEnabled.mutate({ id: r.id, enabled: e.target.checked })}
													/>
												</td>
												<td className="text-nowrap">
													<span className={r.action === "deny" ? styles.badgeDeny : styles.badgeAllow}>
														{r.action.toUpperCase()}
													</span>
												</td>
												<td className="text-nowrap">{r.ipCidr}</td>
												<td className="text-secondary">{r.note ?? "-"}</td>
												<td className="text-secondary text-nowrap">
													{r.expiresOn ? new Date(r.expiresOn).toLocaleString() : "Never"}
												</td>
												<td className="text-end text-nowrap">
													<button
														type="button"
														className={styles.ghost}
														disabled={removeIpRule.isPending}
														onClick={() => removeIpRule.mutate(r.id)}
													>
														<T id="delete" />
													</button>
												</td>
											</tr>
										))}
									</tbody>
								</table>
							</div>
						)
					) : countryRules.isLoading ? (
						<div className={styles.emptyState}><T id="loading" /></div>
					) : countryRules.isError ? (
						<div className={styles.emptyState}><T id="nyxguard.rules.load-error" /></div>
					) : (countryRules.data?.items?.length ?? 0) === 0 ? (
						<div className={styles.emptyState}><T id="nyxguard.rules.no-country-rules" /></div>
					) : (
						<div className={`nyx-scroll-y nyx-scroll-theme ${styles.tableViewport}`}>
							<table className="table table-sm table-vcenter">
								<thead>
									<tr>
										<th><T id="enabled" /></th>
										<th><T id="action" /></th>
										<th>Country</th>
										<th>Note</th>
										<th><T id="expires" /></th>
										<th className="text-end"><T id="actions" /></th>
									</tr>
								</thead>
								<tbody>
									{(countryRules.data?.items ?? []).map((r) => (
										<tr key={r.id}>
											<td className="text-nowrap">
												<input
													type="checkbox"
													checked={r.enabled}
													onChange={(e) => toggleCountryEnabled.mutate({ id: r.id, enabled: e.target.checked })}
												/>
											</td>
											<td className="text-nowrap">
												<span className={r.action === "deny" ? styles.badgeDeny : styles.badgeAllow}>
													{r.action.toUpperCase()}
												</span>
											</td>
											<td className="text-nowrap">{r.countryCode}</td>
											<td className="text-secondary">{r.note ?? "-"}</td>
											<td className="text-secondary text-nowrap">
												{r.expiresOn ? new Date(r.expiresOn).toLocaleString() : "Never"}
											</td>
											<td className="text-end text-nowrap">
												<button
													type="button"
													className={styles.ghost}
													disabled={removeCountryRule.isPending}
													onClick={() => removeCountryRule.mutate(r.id)}
												>
													<T id="delete" />
												</button>
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
		</div>
	);
};

export default NyxGuardRules;
