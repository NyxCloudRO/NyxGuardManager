import styles from "./index.module.css";

const WafDashboard = () => {
	return (
		<div className={styles.wrapper}>
			<div className={styles.panel}>
				<h2 className={styles.title}>WAF Dashboard</h2>
				<p className={styles.subtitle}>
					Placeholder view. Traffic, IP insights, and rules will appear here.
				</p>
			</div>
		</div>
	);
};

export default WafDashboard;
