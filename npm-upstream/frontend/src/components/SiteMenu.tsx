import {
	IconActivityHeartbeat,
	IconBook,
	IconDeviceDesktop,
	IconHome,
	IconLock,
	IconSettings,
	IconShield,
	IconUser,
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
		icon: IconActivityHeartbeat,
		label: "nyxguard",
		items: [
			{
				to: "/nyxguard",
				label: "nyxguard",
			},
			{
				to: "/nyxguard/traffic",
				label: "nyxguard-traffic",
			},
			{
				to: "/nyxguard/ips",
				label: "nyxguard-ips",
			},
			{
				to: "/nyxguard/rules",
				label: "nyxguard-rules",
			},
			{
				to: "/nyxguard/apps",
				label: "nyxguard-apps",
			},
		],
	},
	{
		icon: IconDeviceDesktop,
		label: "hosts",
		items: [
			{
				to: "/nyxguard/proxy",
				label: "proxy-hosts",
				permissionSection: PROXY_HOSTS,
				permission: VIEW,
			},
			{
				to: "/nyxguard/redirection",
				label: "redirection-hosts",
				permissionSection: REDIRECTION_HOSTS,
				permission: VIEW,
			},
			{
				to: "/nyxguard/stream",
				label: "streams",
				permissionSection: STREAMS,
				permission: VIEW,
			},
			{
				to: "/nyxguard/404",
				label: "dead-hosts",
				permissionSection: DEAD_HOSTS,
				permission: VIEW,
			},
		],
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

	return (
		<HasPermission
			key={`item-${item.label}`}
			section={item.permissionSection}
			permission={item.permission || VIEW}
			hideError
		>
			<li className="nav-item">
				{item.to?.startsWith("http") ? (
					<a className={linkClassName} href={item.to} target="_blank" rel="noreferrer">
						<span className="nav-link-icon d-md-none d-lg-inline-block">
							{item.icon && React.createElement(item.icon, { height: 24, width: 24 })}
						</span>
						<span className="nav-link-title">
							<T id={item.label} />
						</span>
					</a>
				) : (
					<NavLink to={item.to} onClick={onClick} className={linkClassName}>
						<span className="nav-link-icon d-md-none d-lg-inline-block">
							{item.icon && React.createElement(item.icon, { height: 24, width: 24 })}
						</span>
						<span className="nav-link-title">
							<T id={item.label} />
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
			<li className={cns}>
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

export function SiteMenu() {
	const closeMenu = () =>
		setTimeout(() => {
			const navbarToggler = document.querySelector<HTMLElement>(".navbar-toggler");
			const navbarMenu = document.querySelector("#navbar-menu");
			if (navbarToggler && navbarMenu?.classList.contains("show")) {
				navbarToggler.click();
			}
		}, 300);

	return (
		<ul className="navbar-nav mx-auto">
			{menuItems.length > 0 &&
				menuItems.map((item) => {
					return getMenuItem(item, closeMenu);
				})}
		</ul>
	);
}
