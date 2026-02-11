import { SiteMenu } from "src/components";
import headerStyles from "./SiteHeader.module.css";

export function SiteSidebar() {
	// Uses the same `#navbar-menu` id as the header toggler, but renders it as a left sidebar
	// so dropdowns do not overlap the dashboard content.
	return (
		<aside className={headerStyles.sideMenu} aria-label="Main navigation">
			<div className="collapse d-md-block" id="navbar-menu">
				<SiteMenu variant="side" />
			</div>
		</aside>
	);
}
