import { HasPermission } from "src/components";
import { ADMIN, VIEW } from "src/modules/Permissions";
import styles from "./index.module.css";
import TableWrapper from "./TableWrapper";

const AuditLog = () => {
	return (
		<HasPermission section={ADMIN} permission={VIEW} pageLoading loadingNoLogo>
			<div className={styles.page}>
				<div className="container-xl nyx-scroll-theme">
					<TableWrapper />
				</div>
			</div>
		</HasPermission>
	);
};

export default AuditLog;
