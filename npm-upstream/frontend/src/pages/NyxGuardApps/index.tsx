import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import cn from "classnames";
import { HasPermission } from "src/components";
import { getNyxGuardApps, getNyxGuardSettings, updateNyxGuardApp } from "src/api/backend";
import { MANAGE, PROXY_HOSTS } from "src/modules/Permissions";
import styles from "./index.module.css";

const NyxGuardApps = () => {
	const qc = useQueryClient();
	const settings = useQuery({
		queryKey: ["nyxguard", "settings"],
		queryFn: () => getNyxGuardSettings(),
		refetchInterval: 15000,
	});
	const apps = useQuery({
		queryKey: ["nyxguard", "apps"],
		queryFn: () => getNyxGuardApps(),
		refetchInterval: 15000,
	});
	const toggle = useMutation({
		mutationFn: (args: {
			id: number;
			wafEnabled: boolean;
			botDefenseEnabled?: boolean;
			ddosEnabled?: boolean;
			sqliEnabled?: boolean;
			authBypassEnabled?: boolean;
		}) =>
			updateNyxGuardApp(args.id, {
				wafEnabled: args.wafEnabled,
				botDefenseEnabled: args.botDefenseEnabled,
				ddosEnabled: args.ddosEnabled,
				sqliEnabled: args.sqliEnabled,
				authBypassEnabled: args.authBypassEnabled,
			}),
		onMutate: (args) => {
			const prev = qc.getQueryData<any>(["nyxguard", "apps"]);
			qc.setQueryData(["nyxguard", "apps"], (old: any) => {
				if (!old?.items) return old;
				return {
					...old,
					items: old.items.map((it: any) =>
						it.id === args.id
							? {
									...it,
									wafEnabled: args.wafEnabled,
									// Disabling WAF implicitly disables per-app Bot/DDoS includes.
									botDefenseEnabled: args.wafEnabled
										? typeof args.botDefenseEnabled === "boolean"
											? args.botDefenseEnabled
											: it.botDefenseEnabled
										: false,
									ddosEnabled: args.wafEnabled
										? typeof args.ddosEnabled === "boolean"
											? args.ddosEnabled
											: it.ddosEnabled
										: false,
									sqliEnabled: args.wafEnabled
										? typeof args.sqliEnabled === "boolean"
											? args.sqliEnabled
											: it.sqliEnabled
										: false,
									authBypassEnabled:
										typeof args.authBypassEnabled === "boolean" ? args.authBypassEnabled : it.authBypassEnabled,
								}
							: it,
					),
				};
			});
			return () => qc.setQueryData(["nyxguard", "apps"], prev);
		},
		onError: (_err, _args, rollback: any) => rollback?.(),
		onSuccess: async (_data, args) => {
			await qc.invalidateQueries({ queryKey: ["nyxguard", "apps"] });
			await qc.invalidateQueries({ queryKey: ["nyxguard", "apps", "summary"] });
			// Keep the Proxy Host modal/details in sync without a full page refresh.
			await qc.invalidateQueries({ queryKey: ["proxy-host", args.id] });
			await qc.invalidateQueries({ queryKey: ["proxy-hosts"] });
		},
	});

	return (
		<div className={styles.page}>
			<div className="container-xl">
				<div className={styles.card}>
					<h2 className={styles.title}>Protected Apps</h2>
					<p className={styles.subtitle}>
						Assign WAF profiles, enforce rules, and monitor app status.
					</p>
					{apps.isLoading ? (
						<div className={styles.emptyState}>Loading…</div>
					) : apps.isError ? (
						<div className={styles.emptyState}>Unable to load proxy hosts.</div>
					) : (apps.data?.items?.length ?? 0) === 0 ? (
						<div className={styles.emptyState}>No proxy hosts found yet.</div>
						) : (
							(apps.data?.items ?? []).map((app) => {
								const name = app.domains?.[0] ?? `Proxy Host #${app.id}`;
								const isProtected = app.wafEnabled;
								const botGlobal = settings.data?.botDefenseEnabled ?? false;
								const ddosGlobal = settings.data?.ddosEnabled ?? false;
								const sqliGlobal = settings.data?.sqliEnabled ?? false;
								const authBypassGlobal = settings.data?.authBypassEnabled ?? false;

								const botConfigured = app.botDefenseEnabled;
								const ddosConfigured = app.ddosEnabled;
								const sqliConfigured = app.sqliEnabled;
								const authBypassConfigured = app.authBypassEnabled;

								// Effective enforcement requires both: per-app enabled AND global enabled.
								const botEffective = isProtected && botGlobal && botConfigured;
								const ddosEffective = isProtected && ddosGlobal && ddosConfigured;
								const sqliEffective = isProtected && sqliGlobal && sqliConfigured;
								const authBypassEffective = isProtected && authBypassGlobal && authBypassConfigured;
								const fullyProtected = isProtected && botEffective && ddosEffective && sqliEffective && authBypassEffective;

								const botBlockedByGlobal = isProtected && !botGlobal;
								const ddosBlockedByGlobal = isProtected && !ddosGlobal;
								const sqliBlockedByGlobal = isProtected && !sqliGlobal;
								const authBypassBlockedByGlobal = isProtected && !authBypassGlobal;
								return (
									<div key={app.id} className={styles.row}>
										<span className={styles.name}>{name}</span>
										<span
											className={cn(styles.badge, styles.status, {
												[styles.badgeMuted]: !isProtected,
												[styles.badgeGreen]: fullyProtected,
											})}
										>
											{isProtected ? "Protected" : "Monitoring"}
										</span>
										<div className={styles.actions}>
										<HasPermission section={PROXY_HOSTS} permission={MANAGE} hideError>
											<button
												className={styles.toggle}
												type="button"
												disabled={toggle.isPending}
												onClick={() =>
													toggle.mutate({
														id: app.id,
														wafEnabled: !isProtected,
													})
												}
											>
												{isProtected ? "Disable WAF" : "Enable WAF"}
												</button>
												<button
													className={cn(styles.toggle, { [styles.toggleDisabled]: !isProtected })}
													type="button"
													disabled={!isProtected || botBlockedByGlobal || toggle.isPending}
													title={
														!isProtected
															? "Enable WAF first"
															: botBlockedByGlobal
																? "Bot Defense is disabled globally (GlobalGate)."
																: "Toggle Bot Defence"
													}
													onClick={() =>
														toggle.mutate({
															id: app.id,
															wafEnabled: true,
															botDefenseEnabled: !botConfigured,
														})
													}
												>
													{botBlockedByGlobal
														? "Bot Defence (Global OFF)"
														: botEffective
															? "Disable Bot Defence"
															: "Enable Bot Defence"}
												</button>
												<button
													className={cn(styles.toggle, { [styles.toggleDisabled]: !isProtected })}
													type="button"
													disabled={!isProtected || ddosBlockedByGlobal || toggle.isPending}
													title={
														!isProtected
															? "Enable WAF first"
															: ddosBlockedByGlobal
																? "DDoS Shield is disabled globally (GlobalGate)."
																: "Toggle DDoS Shield"
													}
													onClick={() =>
														toggle.mutate({
															id: app.id,
															wafEnabled: true,
															ddosEnabled: !ddosConfigured,
														})
													}
												>
													{ddosBlockedByGlobal ? "DDoS (Global OFF)" : ddosEffective ? "Disable DDoS" : "Enable DDoS"}
												</button>
												<button
													className={cn(styles.toggle, { [styles.toggleDisabled]: !isProtected })}
													type="button"
													disabled={!isProtected || sqliBlockedByGlobal || toggle.isPending}
													title={
														!isProtected
															? "Enable WAF first"
															: sqliBlockedByGlobal
																? "SQL Shield is disabled globally (GlobalGate)."
																: "Toggle SQL Shield"
													}
													onClick={() =>
														toggle.mutate({
															id: app.id,
															wafEnabled: true,
															sqliEnabled: !sqliConfigured,
														})
													}
												>
													{sqliBlockedByGlobal
														? "SQL Shield (Global OFF)"
														: sqliEffective
															? "Disable SQL Shield"
															: "Enable SQL Shield"}
												</button>
												<button
													className={cn(styles.toggle, { [styles.toggleDisabled]: !isProtected })}
													type="button"
													disabled={!isProtected || authBypassBlockedByGlobal || toggle.isPending}
													title={
														!isProtected
															? "Enable WAF first"
															: authBypassBlockedByGlobal
																? "Authenticated Traffic Bypass is disabled globally (GlobalGate)."
																: "If enabled, authenticated users are far less likely to be blocked by protections."
													}
													onClick={() =>
														toggle.mutate({
															id: app.id,
															wafEnabled: true,
															authBypassEnabled: !authBypassConfigured,
														})
													}
												>
													{authBypassBlockedByGlobal
														? "Auth Bypass (Global OFF)"
														: authBypassEffective
															? "Disable Auth Bypass"
															: "Enable Auth Bypass"}
												</button>
											</HasPermission>
										</div>
									</div>
							);
						})
					)}
					{toggle.isError ? (
						<div className="text-danger mt-3">Unable to update WAF status.</div>
					) : null}
				</div>
			</div>
		</div>
	);
};

export default NyxGuardApps;
