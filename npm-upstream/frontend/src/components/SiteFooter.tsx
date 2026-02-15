import styles from "./SiteFooter.module.css";

const APP_VERSION = "4.0.0";

export function SiteFooter() {
	return (
		<footer className={styles.footer}>
			<div className={styles.inner}>NyxGuard Manager · v{APP_VERSION}</div>
		</footer>
	);
}
