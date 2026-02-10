import { IconLock, IconLogout, IconShieldLock, IconUser } from "@tabler/icons-react";
import { LocalePicker } from "src/components";
import { useAuthState } from "src/context";
import { useUser } from "src/hooks";
import { T } from "src/locale";
import { showChangePasswordModal, showTwoFactorModal, showUserModal } from "src/modals";
import styles from "./SiteHeader.module.css";

export function SiteHeader() {
	const { data: currentUser } = useUser("me");
	const isAdmin = currentUser?.roles.includes("admin");
	const { logout } = useAuthState();

	return (
		<header className={`d-print-none ${styles.topNav}`}>
			<div className={styles.brandRow}>
				<div className="navbar navbar-expand-md">
					<div className="container-fluid px-3 px-lg-4">
					<div className={styles.brandBar}>
						<div className={styles.brandLeft}>
							<button
								className="navbar-toggler"
								type="button"
								data-bs-toggle="collapse"
								data-bs-target="#navbar-menu"
								aria-controls="navbar-menu"
								aria-expanded="false"
								aria-label="Toggle navigation"
							>
								<span className="navbar-toggler-icon" />
							</button>
						</div>
						<div className={styles.brandCenter}>
							<div className="navbar-brand navbar-brand-autodark p-0">
								<div className={styles.brandLink}>
									<div className={styles.logo}>
										<img
											src="/images/favicon/logo-128.png"
											width={40}
											height={40}
											className={`navbar-brand-image ${styles.brandLogo}`}
											alt="NyxGuard"
										/>
									</div>
									<span className={styles.brandText}>
										<span className={styles.brandWordPrimary}>NyxGuard</span>
										<span className={styles.brandWordSecondary}>Manager</span>
									</span>
								</div>
							</div>
						</div>
						<div className={styles.brandRight}>
							<div className={`navbar-nav flex-row ${styles.rightControls}`}>
								<div className="nav-item">
									<LocalePicker />
								</div>
								<div className="nav-item d-md-flex">
									<div className={`nav-item dropdown ${styles.userMenu}`}>
										<a
											href="/"
											className="nav-link d-flex lh-1"
											data-bs-toggle="dropdown"
											aria-label="Open user menu"
										>
											<span
												className="avatar avatar-sm"
												style={{
													backgroundImage: `url(${currentUser?.avatar || "/images/default-avatar.jpg"})`,
												}}
											/>
											<div className="d-none d-xl-block ps-2">
												<div>{currentUser?.nickname}</div>
												<div className="mt-1 small text-secondary">
													<T id={isAdmin ? "role.admin" : "role.standard-user"} />
												</div>
											</div>
										</a>
										<div className="dropdown-menu dropdown-menu-end dropdown-menu-arrow">
											<div className="d-md-none">
												{/* biome-ignore lint/a11y/noStaticElementInteractions lint/a11y/useKeyWithClickEvents: This div is not interactive. */}
												<div className="p-2 pb-1 pe-1 d-flex align-items-center" onClick={e => e.stopPropagation()}>
													<div className="ps-2 pe-1 me-auto">
														<div>{currentUser?.nickname}</div>
														<div className="mt-1 small text-secondary text-nowrap">
															<T id={isAdmin ? "role.admin" : "role.standard-user"} />
														</div>
													</div>
													<div className="d-flex align-items-center">
														<LocalePicker menuAlign="end" />
													</div>
												</div>
												<div className="dropdown-divider" />
											</div>
											<a
												href="?"
												className="dropdown-item"
												onClick={(e) => {
													e.preventDefault();
													showUserModal("me");
												}}
											>
												<IconUser width={18} />
												<T id="user.edit-profile" />
											</a>
											<a
												href="?"
												className="dropdown-item"
												onClick={(e) => {
													e.preventDefault();
													showChangePasswordModal("me");
												}}
											>
												<IconLock width={18} />
												<T id="user.change-password" />
											</a>
											<a
												href="?"
												className="dropdown-item"
												onClick={(e) => {
													e.preventDefault();
													showTwoFactorModal("me");
												}}
											>
												<IconShieldLock width={18} />
												<T id="user.two-factor" />
											</a>
											<div className="dropdown-divider" />
											<a
												href="?"
												className="dropdown-item"
												onClick={(e) => {
													e.preventDefault();
													logout();
												}}
											>
												<IconLogout width={18} />
												<T id="user.logout" />
											</a>
										</div>
									</div>
								</div>
							</div>
						</div>
					</div>
					</div>
				</div>
			</div>
		</header>
	);
}
