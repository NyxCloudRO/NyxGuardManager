import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { exportConfiguration, importConfiguration, rebootAfterImport } from "src/api/backend";
import { Button } from "src/components";
import { intl, T } from "src/locale";
import { showError, showSuccess } from "src/notifications";
import styles from "./layout.module.css";

const APP_VERSION = "4.0.0";

export default function Layout() {
	const [backupFile, setBackupFile] = useState<File | null>(null);

	const exportMutation = useMutation({
		mutationFn: () => exportConfiguration(),
		onSuccess: (data) => {
			showSuccess(intl.formatMessage({ id: "settings.backup.export-success" }, { filename: data.filename }));
		},
		onError: (err: any) => {
			showError(err instanceof Error ? err.message : intl.formatMessage({ id: "settings.backup.export-failed" }));
		},
	});

	const rebootMutation = useMutation({
		mutationFn: () => rebootAfterImport(),
		onSuccess: () => {
			showSuccess(intl.formatMessage({ id: "settings.backup.rebooting" }));
			setTimeout(() => {
				window.location.reload();
			}, 1000);
		},
		onError: (err: any) => {
			showError(err instanceof Error ? err.message : intl.formatMessage({ id: "settings.backup.reboot-failed" }));
		},
	});

	const importMutation = useMutation({
		mutationFn: () => {
			if (!backupFile) {
				throw new Error(intl.formatMessage({ id: "settings.backup.file-required" }));
			}
			return importConfiguration(backupFile);
		},
		onSuccess: (result) => {
			showSuccess(result.message || intl.formatMessage({ id: "settings.backup.import-success" }));
			const confirmReboot = window.confirm(intl.formatMessage({ id: "settings.backup.reboot-confirm" }));
			if (confirmReboot) {
				rebootMutation.mutate();
			}
		},
		onError: (err: any) => {
			showError(err instanceof Error ? err.message : intl.formatMessage({ id: "settings.backup.import-failed" }));
		},
	});

	return (
		<div className={styles.pageWrap}>
			<div className="container-xl">
				<div className={styles.card}>
					<div className={styles.headerRow}>
						<h2 className={styles.title}>
							<T id="settings" />
						</h2>
						<div className={styles.versionTag}>
							<T id="settings.backup.current-version" data={{ version: APP_VERSION }} />
						</div>
					</div>

					<p className={styles.subtitle}>
						<T id="settings.backup.subtitle" />
					</p>

					<div className={styles.notice}>
						<strong>
							<T id="settings.backup.version-lock-title" />
						</strong>
						<span>
							<T id="settings.backup.version-lock-description" data={{ version: APP_VERSION }} />
						</span>
					</div>

					<div className={styles.grid}>
						<section className={styles.panel}>
							<h3 className={styles.panelTitle}>
								<T id="settings.backup.export-title" />
							</h3>
							<p className={styles.panelText}>
								<T id="settings.backup.export-description" />
							</p>
							<Button
								className="btn-primary"
								onClick={() => exportMutation.mutate()}
								disabled={exportMutation.isPending || importMutation.isPending || rebootMutation.isPending}
								isLoading={exportMutation.isPending}
							>
								<T id="settings.backup.export-button" />
							</Button>
						</section>

						<section className={styles.panel}>
							<h3 className={styles.panelTitle}>
								<T id="settings.backup.import-title" />
							</h3>
							<p className={styles.panelText}>
								<T id="settings.backup.import-description" />
							</p>
							<div className={styles.importRow}>
								<input
									type="file"
									accept="application/json,.json"
									className="form-control"
									onChange={(e) => setBackupFile(e.target.files?.[0] ?? null)}
									disabled={importMutation.isPending || rebootMutation.isPending}
								/>
								<Button
									className="btn-primary"
									onClick={() => importMutation.mutate()}
									disabled={!backupFile || importMutation.isPending || rebootMutation.isPending}
									isLoading={importMutation.isPending}
								>
									<T id="settings.backup.import-button" />
								</Button>
							</div>
						</section>
					</div>
				</div>
			</div>
		</div>
	);
}
