import {
	IconActivityHeartbeat,
	IconAlertTriangle,
	IconArrowsCross,
	IconBook,
	IconChartLine,
	IconDeviceDesktop,
	IconDisc,
	IconHome,
	IconLock,
	IconSettings,
	IconShield,
	IconShieldCheck,
	IconUser,
	IconWorld,
} from "@tabler/icons-react";
import cn from "classnames";
import React from "react";
import { HasPermission, NavLink } from "src/components";
import { T } from "src/locale";
import {
	ACCESS_LISTS,
	ADMIN,
	CERTIFICATES,
	DEAD_HOSTS,
	PROXY_HOSTS,
	REDIRECTION_HOSTS,
	type Section,
	STREAMS,
	VIEW,
} from "src/modules/Permissions";

interface MenuItem {
	label: string;
	icon?: React.ElementType;
	to?: string;
	items?: MenuItem[];
	permissionSection?: Section | typeof ADMIN;
	permission?: typeof VIEW;
}

const menuItems: MenuItem[] = [
	{
		to: "/",
		icon: IconHome,
		label: "dashboard",
	},
	{
		to: "/nyxguard",
		icon: IconActivityHeartbeat,
		label: "nyxguard",
	},
	{
		to: "/nyxguard/traffic",
		icon: IconChartLine,
		label: "nyxguard-traffic",
	},
	{
		to: "/nyxguard/ips",
		icon: IconWorld,
		label: "nyxguard-ips",
	},
	{
		to: "/nyxguard/rules",
		icon: IconArrowsCross,
		label: "nyxguard-rules",
	},
	{
		to: "/nyxguard/apps",
		icon: IconDisc,
		label: "nyxguard-apps",
	},
	{
		to: "/nyxguard/attacks",
		icon: IconAlertTriangle,
		label: "nyxguard-attacks",
	},
	{
		to: "/nyxguard/globalgate",
		icon: IconShieldCheck,
		label: "nyxguard-globalgate",
	},
	{
		to: "/nyxguard/proxy",
		icon: IconDeviceDesktop,
		label: "proxy-hosts",
		permissionSection: PROXY_HOSTS,
		permission: VIEW,
	},
	{
		to: "/nyxguard/redirection",
		icon: IconArrowsCross,
		label: "redirection-hosts",
		permissionSection: REDIRECTION_HOSTS,
		permission: VIEW,
	},
	{
		to: "/nyxguard/stream",
		icon: IconChartLine,
		label: "streams",
		permissionSection: STREAMS,
		permission: VIEW,
	},
	{
		to: "/nyxguard/404",
		icon: IconAlertTriangle,
		label: "dead-hosts",
		permissionSection: DEAD_HOSTS,
		permission: VIEW,
	},
	{
		to: "/access",
		icon: IconLock,
		label: "access-lists",
		permissionSection: ACCESS_LISTS,
		permission: VIEW,
	},
	{
		to: "/certificates",
		icon: IconShield,
		label: "certificates",
		permissionSection: CERTIFICATES,
		permission: VIEW,
	},
	{
		to: "/users",
		icon: IconUser,
		label: "users",
		permissionSection: ADMIN,
	},
	{
		to: "/audit-log",
		icon: IconBook,
		label: "auditlogs",
		permissionSection: ADMIN,
	},
	{
		to: "/settings",
		icon: IconSettings,
		label: "settings",
		permissionSection: ADMIN,
	},
	{
		to: "https://buymeacoffee.com/nyxmael",
		icon: IconBook,
		label: "support-nyxguard",
	},
];

const getMenuItem = (item: MenuItem, onClick?: () => void) => {
	if (item.items && item.items.length > 0) {
		return getMenuDropown(item, onClick);
	}

	const isSupport = item.label === "support-nyxguard";
	const linkClassName = isSupport ? "nav-link support-nyxguard" : "nav-link";
	const menuTitle = item.label === "proxy-hosts" ? "NyxGate Proxy Hosts" : <T id={item.label} />;

	return (
		<HasPermission
			key={`item-${item.label}`}
			section={item.permissionSection}
			permission={item.permission || VIEW}
			hideError
		>
			<li className="nav-item" data-menu={item.label}>
				{item.to?.startsWith("http") ? (
					<a className={linkClassName} href={item.to} target="_blank" rel="noreferrer">
					<span className="nav-link-icon d-md-none d-lg-inline-block">
						{item.icon && React.createElement(item.icon, { height: 24, width: 24 })}
					</span>
					<span className="nav-link-title">
						{menuTitle}
					</span>
				</a>
			) : (
				<NavLink to={item.to} onClick={onClick} className={linkClassName}>
					<span className="nav-link-icon d-md-none d-lg-inline-block">
						{item.icon && React.createElement(item.icon, { height: 24, width: 24 })}
					</span>
					<span className="nav-link-title">
						{menuTitle}
					</span>
				</NavLink>
			)}
		</li>
	</HasPermission>
	);
};

const getMenuDropown = (item: MenuItem, onClick?: () => void) => {
	const cns = cn("nav-item", "dropdown");
	return (
		<HasPermission
			key={`item-${item.label}`}
			section={item.permissionSection}
			permission={item.permission || VIEW}
			hideError
		>
			<li className={cns} data-menu={item.label}>
				<a
					className="nav-link dropdown-toggle"
					href={item.to}
					data-bs-toggle="dropdown"
					data-bs-auto-close="outside"
					aria-expanded="false"
					role="button"
				>
					<span className="nav-link-icon d-md-none d-lg-inline-block">
						{item.icon && React.createElement(item.icon, { height: 24, width: 24 })}
					</span>
					<span className="nav-link-title">
						<T id={item.label} />
					</span>
				</a>
				<div className="dropdown-menu">
					{item.items?.map((subitem, idx) => {
						return (
							<HasPermission
								key={`${idx}-${subitem.to}`}
								section={subitem.permissionSection}
								permission={subitem.permission || VIEW}
								hideError
							>
								<NavLink to={subitem.to} isDropdownItem onClick={onClick}>
									<T id={subitem.label} />
								</NavLink>
							</HasPermission>
						);
					})}
				</div>
			</li>
		</HasPermission>
	);
};

export function SiteMenu({ variant = "top" }: { variant?: "top" | "side" }) {
	const closeMenu = () =>
		setTimeout(() => {
			const navbarToggler = document.querySelector<HTMLElement>(".navbar-toggler");
			const navbarMenu = document.querySelector("#navbar-menu");
			if (navbarToggler && navbarMenu?.classList.contains("show")) {
				navbarToggler.click();
			}
		}, 300);

	return (
		<ul className={cn("navbar-nav", variant === "side" && "flex-column")}>
			{menuItems.length > 0 &&
				menuItems.map((item) => {
					return getMenuItem(item, closeMenu);
				})}
		</ul>
	);
}
