import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import cn from "classnames";
import { getNyxGuardApps, updateNyxGuardApp } from "src/api/backend";
import styles from "./index.module.css";

const NyxGuardApps = () => {
	const qc = useQueryClient();
	const apps = useQuery({
		queryKey: ["nyxguard", "apps"],
		queryFn: () => getNyxGuardApps(),
		refetchInterval: 15000,
	});
	const toggle = useMutation({
		mutationFn: (args: { id: number; wafEnabled: boolean; botDefenseEnabled?: boolean; ddosEnabled?: boolean }) =>
			updateNyxGuardApp(args.id, {
				wafEnabled: args.wafEnabled,
				botDefenseEnabled: args.botDefenseEnabled,
				ddosEnabled: args.ddosEnabled,
			}),
		onSuccess: () => qc.invalidateQueries({ queryKey: ["nyxguard", "apps"] }),
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
							const botEnabled = app.botDefenseEnabled;
							const ddosEnabled = app.ddosEnabled;
							return (
								<div key={app.id} className={styles.row}>
									<span>{name}</span>
									<div className={styles.actions}>
										<span className={isProtected ? styles.badge : styles.badgeMuted}>
											{isProtected ? "Protected" : "Monitoring"}
										</span>
										<button
											className={styles.toggle}
											type="button"
											disabled={toggle.isPending}
											onClick={() =>
												toggle.mutate({
													id: app.id,
													wafEnabled: !isProtected,
													botDefenseEnabled: botEnabled,
													ddosEnabled,
												})
											}
										>
											{isProtected ? "Disable WAF" : "Enable WAF"}
										</button>
										<button
											className={cn(styles.toggle, { [styles.toggleDisabled]: !isProtected })}
											type="button"
											disabled={!isProtected || toggle.isPending}
											title={!isProtected ? "Enable WAF first" : "Toggle Bot Defence"}
											onClick={() =>
												toggle.mutate({
													id: app.id,
													wafEnabled: true,
													botDefenseEnabled: !botEnabled,
													ddosEnabled,
												})
											}
										>
											{botEnabled ? "Disable Bot Defence" : "Enable Bot Defence"}
										</button>
										<button
											className={cn(styles.toggle, { [styles.toggleDisabled]: !isProtected })}
											type="button"
											disabled={!isProtected || toggle.isPending}
											title={!isProtected ? "Enable WAF first" : "Toggle DDoS Shield"}
											onClick={() =>
												toggle.mutate({
													id: app.id,
													wafEnabled: true,
													botDefenseEnabled: botEnabled,
													ddosEnabled: !ddosEnabled,
												})
											}
										>
											{ddosEnabled ? "Disable DDoS" : "Enable DDoS"}
										</button>
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
