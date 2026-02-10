import type React from "react";
import { SiteSidebar } from "src/components/SiteSidebar";
import styles from "./AppShell.module.css";

export function AppShell({ children }: { children: React.ReactNode }) {
	return (
		<div className={styles.shell}>
			<div className={styles.sidebarWrap}>
				<SiteSidebar />
			</div>
			<div className={styles.main}>{children}</div>
		</div>
	);
}
