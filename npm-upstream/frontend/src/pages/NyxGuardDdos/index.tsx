import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getNyxGuardSettings, updateNyxGuardSettings } from "src/api/backend";
import styles from "./index.module.css";

const NyxGuardDdos = () => {
	const qc = useQueryClient();
	const settings = useQuery({
		queryKey: ["nyxguard", "settings"],
		queryFn: () => getNyxGuardSettings(),
	});
	const save = useMutation({
		mutationFn: (ddosEnabled: boolean) => updateNyxGuardSettings({ ddosEnabled }),
		onSuccess: () => qc.invalidateQueries({ queryKey: ["nyxguard", "settings"] }),
	});

	const enabled = settings.data?.ddosEnabled ?? false;

	return (
		<div className={styles.page}>
			<div className="container-xl">
				<div className={styles.card}>
					<h2 className={styles.title}>DDoS Protection</h2>
					<p className={styles.subtitle}>
						Enable global rate limits, spike detection, and emergency blocks.
					</p>
					<div className={styles.toggle}>
						<span>Shield Status</span>
						<span className={enabled ? styles.badgeActive : styles.badge}>
							{enabled ? "Active" : "Inactive"}
						</span>
					</div>
					<div className={styles.actions}>
						<button
							className={styles.primary}
							type="button"
							disabled={settings.isLoading || save.isPending}
							onClick={() => save.mutate(true)}
						>
							Activate Shield
						</button>
						<button
							className={styles.ghost}
							type="button"
							disabled={settings.isLoading || save.isPending}
							onClick={() => save.mutate(false)}
						>
							Disable Shield
						</button>
					</div>
					{settings.isError ? (
						<div className="text-danger mt-3">Unable to load settings.</div>
					) : null}
				</div>
			</div>
		</div>
	);
};

export default NyxGuardDdos;
