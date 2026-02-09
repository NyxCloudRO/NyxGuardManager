import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
	createNyxGuardCountryRule,
	createNyxGuardIpRule,
	deleteNyxGuardCountryRule,
	deleteNyxGuardIpRule,
	getNyxGuardCountryRules,
	getNyxGuardIpRules,
	updateNyxGuardCountryRule,
	updateNyxGuardIpRule,
} from "src/api/backend";
import { showSuccess } from "src/notifications";
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
			showSuccess("Rule added and active.");
			await qc.invalidateQueries({ queryKey: ["nyxguard", "rules", "ip"] });
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
			showSuccess("Rule added and active.");
			await qc.invalidateQueries({ queryKey: ["nyxguard", "rules", "country"] });
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

	const hasError = useMemo(() => {
		if (ruleType === "ip") {
			const v = ipCidr.trim();
			if (!v) return "Enter an IP or CIDR (example: 203.0.113.0/24)";
			if (!/^[0-9a-fA-F:./]+$/.test(v)) return "Only IP/CIDR characters are allowed";
			return null;
		}
		const v = countryCode.trim().toUpperCase();
		if (!v) return "Enter a country code (example: MD)";
		if (!/^[A-Z]{2}$/.test(v)) return "Country code must be 2 letters (example: FR)";
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
					<h2 className={styles.title}>Rules (Allow / Deny)</h2>
					<p className={styles.subtitle}>
						Create allow/deny rules with instant enforcement (protected apps only). Rules can be permanent or expire automatically.
					</p>

					<div className={styles.builder}>
						<div>
							<div className={styles.label}>Rule Type</div>
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
									IP / Range
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
									Country
								</button>
							</div>
						</div>

						<div>
							<div className={styles.label}>Value</div>
							{ruleType === "ip" ? (
								<>
									<input
										className={styles.input}
										value={ipCidr}
										onChange={(e) => setIpCidr(e.target.value)}
										placeholder="203.0.113.0/24"
									/>
									{hasError ? <div className="text-danger mt-2">{hasError}</div> : null}
								</>
							) : (
								<>
									<input
										className={styles.input}
										value={countryCode}
										onChange={(e) => setCountryCode(e.target.value)}
										placeholder="MD"
									/>
									{hasError ? <div className="text-danger mt-2">{hasError}</div> : null}
								</>
							)}
						</div>

						<div>
							<div className={styles.label}>Action</div>
							<div className={styles.row}>
								<button
									type="button"
									className={action === "allow" ? styles.pillActiveBtn : styles.pillBtn}
									onClick={() => setAction("allow")}
								>
									Allow
								</button>
								<button
									type="button"
									className={action === "deny" ? styles.pillActiveBtn : styles.pillBtn}
									onClick={() => setAction("deny")}
								>
									Deny
								</button>
							</div>
						</div>

						<div>
							<div className={styles.label}>Duration</div>
							<select
								className={styles.input}
								value={expiresInDays ?? ""}
								onChange={(e) => {
									const v = e.target.value;
									setExpiresInDays(v === "" ? null : (Number.parseInt(v, 10) as 1 | 7 | 30 | 60 | 90 | 180));
								}}
							>
								<option value="">Permanent</option>
								<option value={1}>1 day</option>
								<option value={7}>7 days</option>
								<option value={30}>30 days</option>
								<option value={60}>60 days</option>
								<option value={90}>90 days</option>
								<option value={180}>180 days</option>
							</select>
						</div>

						<div>
							<div className={styles.label}>Note (optional)</div>
							<input
								className={styles.input}
								value={note}
								onChange={(e) => setNote(e.target.value)}
								placeholder="Reason / label"
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
								Save Rule
							</button>
						</div>
					</div>

					<div className={styles.rulesList}>
						<div className={styles.label}>Active Rules</div>
					{ruleType === "ip" ? (
						ipRules.isLoading ? (
							<div className={styles.emptyState}>Loading…</div>
						) : ipRules.isError ? (
							<div className={styles.emptyState}>Unable to load rules.</div>
						) : (ipRules.data?.items?.length ?? 0) === 0 ? (
							<div className={styles.emptyState}>No IP rules yet.</div>
						) : (
							<div style={{ overflowX: "auto" }}>
								<table className="table table-sm table-vcenter">
									<thead>
										<tr>
											<th>Enabled</th>
											<th>Action</th>
											<th>IP/CIDR</th>
											<th>Note</th>
											<th>Expires</th>
											<th className="text-end">Actions</th>
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
														Delete
													</button>
												</td>
											</tr>
										))}
									</tbody>
								</table>
							</div>
						)
					) : countryRules.isLoading ? (
						<div className={styles.emptyState}>Loading…</div>
					) : countryRules.isError ? (
						<div className={styles.emptyState}>Unable to load rules.</div>
					) : (countryRules.data?.items?.length ?? 0) === 0 ? (
						<div className={styles.emptyState}>No country rules yet.</div>
					) : (
						<div style={{ overflowX: "auto" }}>
							<table className="table table-sm table-vcenter">
								<thead>
									<tr>
										<th>Enabled</th>
										<th>Action</th>
										<th>Country</th>
										<th>Note</th>
										<th>Expires</th>
										<th className="text-end">Actions</th>
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
													Delete
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
