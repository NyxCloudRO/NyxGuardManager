import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getNyxGuardSettings, updateNyxGuardSettings } from "src/api/backend";
import styles from "./index.module.css";

const NyxGuardBot = () => {
	const qc = useQueryClient();
	const settings = useQuery({
		queryKey: ["nyxguard", "settings"],
		queryFn: () => getNyxGuardSettings(),
	});
	const save = useMutation({
		mutationFn: (botDefenseEnabled: boolean) => updateNyxGuardSettings({ botDefenseEnabled }),
		onSuccess: () => qc.invalidateQueries({ queryKey: ["nyxguard", "settings"] }),
	});

	const enabled = settings.data?.botDefenseEnabled ?? false;

	return (
		<div className={styles.page}>
			<div className="container-xl">
				<div className={styles.card}>
					<h2 className={styles.title}>Bot Defense</h2>
					<p className={styles.subtitle}>
						Enable bot detection, behavioral scoring, and advanced challenges.
					</p>
					<div className={styles.toggle}>
						<span>Bot Defense Status</span>
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
							Enable Bot Defense
						</button>
						<button
							className={styles.ghost}
							type="button"
							disabled={settings.isLoading || save.isPending}
							onClick={() => save.mutate(false)}
						>
							Disable Bot Defense
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

export default NyxGuardBot;
