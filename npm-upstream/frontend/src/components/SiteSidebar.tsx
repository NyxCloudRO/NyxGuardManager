import {
	IconChevronUp,
	IconCloudDownload,
	IconLock,
	IconLogout,
	IconSettings,
	IconShieldLock,
	IconUser,
	IconDotsVertical,
} from "@tabler/icons-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useQuery } from "@tanstack/react-query";
import { getUpdateManagerStatus } from "src/api/backend";
import { FloatingSelect } from "src/components/FloatingSelect";
import { SiteMenu } from "src/components";
import { useAuthState, useLocaleState } from "src/context";
import { useTheme, useUser } from "src/hooks";
import type { AppThemeId } from "src/theme/themes";
import { T, changeLocale, localeOptions } from "src/locale";
import { showChangePasswordModal, showTwoFactorModal, showUserModal } from "src/modals";
import headerStyles from "./SiteHeader.module.css";

// ── Preferences overlay panel ─────────────────────────────────────────────
function PreferencesDropdown() {
	const { locale, setLocale } = useLocaleState();
	const { currentTheme, themes, setTheme } = useTheme();

	const [open, setOpen] = useState(false);
	const [openSelect, setOpenSelect] = useState<"language" | "theme" | null>(null);
	const [panelStyle, setPanelStyle] = useState<React.CSSProperties>({});
	const btnRef = useRef<HTMLButtonElement>(null);
	const panelRef = useRef<HTMLDivElement>(null);

	const currentLang = (locale || "en").slice(0, 2);

	const langOptions = localeOptions.map((l) => ({ value: l.code, label: l.label }));
	const themeOptions = themes.map((t) => ({ value: t.id, label: t.displayName }));

	const changeLang = (lang: string) => {
		changeLocale(lang);
		setLocale(lang);
		location.reload();
	};

	const reposition = useCallback(() => {
		if (!btnRef.current) return;
		const rect = btnRef.current.getBoundingClientRect();
		const panelH = panelRef.current?.offsetHeight ?? 160;
		const sidebarEl = btnRef.current.closest(`.${headerStyles.sideMenu}`) as HTMLElement | null;
		const sidebarRect = sidebarEl?.getBoundingClientRect();
		const containerMinX = sidebarRect ? sidebarRect.left + 8 : 8;
		const containerMaxX = sidebarRect ? sidebarRect.right - 8 : window.innerWidth - 8;
		const containerWidth = Math.max(180, containerMaxX - containerMinX);
		const panelW = Math.min(Math.max(rect.width, 220), containerWidth);
		const leftIdeal = rect.right - panelW;
		const left = Math.min(
			Math.max(containerMinX, leftIdeal),
			Math.max(containerMinX, containerMaxX - panelW),
		);
		setPanelStyle({
			position: "fixed",
			left,
			width: panelW,
			top: Math.max(8, rect.top - panelH - 8),
			zIndex: 9999,
		});
	}, []);

	useLayoutEffect(() => {
		if (open) reposition();
	}, [open, reposition]);

	useEffect(() => {
		if (!open) {
			setOpenSelect(null);
		}
	}, [open]);

	useEffect(() => {
		if (!open) return;
		const onPointer = (e: PointerEvent) => {
			if (
				btnRef.current?.contains(e.target as Node) ||
				panelRef.current?.contains(e.target as Node)
			) return;
			// FloatingSelect lists use portal/absolute rendering and must not close the panel when clicked
			const t = e.target as HTMLElement;
			if (t.closest(`.${headerStyles.prefsSelectList}`)) return;
			setOpen(false);
		};
		const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
		document.addEventListener("pointerdown", onPointer, true);
		document.addEventListener("keydown", onKey, true);
		window.addEventListener("resize", reposition);
		return () => {
			document.removeEventListener("pointerdown", onPointer, true);
			document.removeEventListener("keydown", onKey, true);
			window.removeEventListener("resize", reposition);
		};
	}, [open, reposition]);

	const panel = (
		<div
			ref={panelRef}
			className={headerStyles.prefsPanel}
			style={panelStyle}
		>
			{/* Header */}
			<div className={headerStyles.prefsPanelHeader}>
				<IconSettings size={12} className={headerStyles.prefsPanelHeaderIcon} />
				<span><T id="preferences.label" /></span>
			</div>

			{/* Language row */}
			<div className={headerStyles.prefsRow}>
				<div className={headerStyles.prefsRowMeta}>
					<span className={headerStyles.prefsRowLabel}><T id="language.label" /></span>
					<span className={headerStyles.prefsRowHint}><T id="preferences.language-hint" /></span>
				</div>
				<FloatingSelect
					strategy="absolute"
					portalRoot={panelRef.current}
					placement="top-end"
					minWidth={0}
					maxWidth={176}
					maxHeight={176}
					open={openSelect === "language"}
					onOpenChange={(next) => setOpenSelect(next ? "language" : null)}
					value={currentLang}
					options={langOptions}
					onChange={changeLang}
					ariaLabel="Select language"
					classNames={{
						wrap: headerStyles.prefsSelectWrap,
						trigger: headerStyles.prefsSelectTrigger,
						value: headerStyles.prefsSelectValue,
						chevron: headerStyles.prefsSelectChevron,
						list: headerStyles.prefsSelectList,
						item: headerStyles.prefsSelectItem,
						itemActive: headerStyles.prefsSelectItemActive,
						itemText: headerStyles.prefsSelectItemText,
					}}
				/>
			</div>

			{/* Theme row */}
			<div className={headerStyles.prefsRow}>
				<div className={headerStyles.prefsRowMeta}>
					<span className={headerStyles.prefsRowLabel}><T id="theme.label" /></span>
					<span className={headerStyles.prefsRowHint}><T id="preferences.theme-hint" /></span>
				</div>
				<FloatingSelect
					strategy="absolute"
					portalRoot={panelRef.current}
					placement="top-end"
					minWidth={0}
					maxWidth={176}
					maxHeight={176}
					open={openSelect === "theme"}
					onOpenChange={(next) => setOpenSelect(next ? "theme" : null)}
					value={currentTheme.id}
					options={themeOptions}
					onChange={(v) => setTheme(v as AppThemeId)}
					ariaLabel="Select theme"
					classNames={{
						wrap: headerStyles.prefsSelectWrap,
						trigger: headerStyles.prefsSelectTrigger,
						value: headerStyles.prefsSelectValue,
						chevron: headerStyles.prefsSelectChevron,
						list: headerStyles.prefsSelectList,
						item: headerStyles.prefsSelectItem,
						itemActive: headerStyles.prefsSelectItemActive,
						itemText: headerStyles.prefsSelectItemText,
					}}
				/>
			</div>
		</div>
	);

	return (
		<div className={headerStyles.prefsDropdown}>
			<button
				ref={btnRef}
				type="button"
				className={headerStyles.prefsToggle}
				aria-expanded={open}
				aria-label="Open preferences"
				onClick={() => setOpen((v) => !v)}
			>
				<IconSettings size={14} className={headerStyles.prefsIcon} />
				<span className={headerStyles.prefsLabel}>
					<T id="preferences.label" />
				</span>
				<IconChevronUp
					size={12}
					className={headerStyles.prefsChevron}
					style={{ transform: open ? "rotate(180deg)" : undefined }}
				/>
			</button>

			{open ? createPortal(panel, document.body) : null}
		</div>
	);
}

function SidebarBottom() {
	const { data: currentUser } = useUser("me");
	const isAdmin = currentUser?.roles.includes("admin");
	const { logout } = useAuthState();

	const updateStatus = useQuery({
		queryKey: ["update-manager", "status"],
		queryFn: () => getUpdateManagerStatus(),
		enabled: !!isAdmin,
		refetchInterval: 60_000,
	});

	const showUpdateBadge = !!isAdmin && !!updateStatus.data?.updateAvailable;

	return (
		<div className={headerStyles.sidebarFooter}>
			{showUpdateBadge ? (
				<button
					type="button"
					className={headerStyles.sideUpdateBadge}
					onClick={() => window.dispatchEvent(new CustomEvent("nyxguard:open-update"))}
				>
					<IconCloudDownload size={13} />
					<span>
						<T id="site-header.update-available" />
						{updateStatus.data?.latest ? ` v${updateStatus.data.latest}` : ""}
					</span>
				</button>
			) : null}

			<div className={`dropdown dropup ${headerStyles.userCard}`}>
				<button
					type="button"
					className={headerStyles.userCardTrigger}
					data-bs-toggle="dropdown"
					aria-label="Open user menu"
				>
					<span
						className={`avatar ${headerStyles.userCardAvatar}`}
						style={{
							backgroundImage: `url(${currentUser?.avatar || "/images/default-avatar.jpg"})`,
						}}
					/>
					<div className={headerStyles.userCardInfo}>
						<span className={headerStyles.userCardName}>{currentUser?.nickname}</span>
						<span className={headerStyles.userCardRole}>
							<T id={isAdmin ? "role.admin" : "role.standard-user"} />
						</span>
					</div>
					<IconDotsVertical size={14} className={headerStyles.userCardChevron} />
				</button>
				<div className="dropdown-menu">
					<a
						href="?"
						className="dropdown-item"
						onClick={(e) => { e.preventDefault(); showUserModal("me"); }}
					>
						<IconUser width={16} />
						<T id="user.edit-profile" />
					</a>
					<a
						href="?"
						className="dropdown-item"
						onClick={(e) => { e.preventDefault(); showChangePasswordModal("me"); }}
					>
						<IconLock width={16} />
						<T id="user.change-password" />
					</a>
					<a
						href="?"
						className="dropdown-item"
						onClick={(e) => { e.preventDefault(); showTwoFactorModal("me"); }}
					>
						<IconShieldLock width={16} />
						<T id="user.two-factor" />
					</a>
					<div className="dropdown-divider" />
					<a
						href="?"
						className="dropdown-item"
						onClick={(e) => { e.preventDefault(); logout(); }}
					>
						<IconLogout width={16} />
						<T id="user.logout" />
					</a>
				</div>
			</div>

			<PreferencesDropdown />
		</div>
	);
}

export function SiteSidebar() {
	return (
		<aside className={headerStyles.sideMenu} aria-label="Main navigation">
			<div className={`${headerStyles.sideMenuNav} collapse d-md-block`} id="navbar-menu">
				<SiteMenu variant="side" />
			</div>
			<SidebarBottom />
		</aside>
	);
}
