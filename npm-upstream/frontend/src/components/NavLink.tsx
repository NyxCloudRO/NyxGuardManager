import { Link } from "react-router-dom";

interface Props {
	children: React.ReactNode;
	to?: string;
	isDropdownItem?: boolean;
	onClick?: () => void;
	className?: string;
}
export function NavLink({ children, to, isDropdownItem, onClick, className }: Props) {
	return (
		<Link
			className={className || (isDropdownItem ? "dropdown-item" : "nav-link")}
			to={to || "#"}
			onClick={(e) => {
				if (!to) {
					e.preventDefault();
				}
				if (onClick) {
					onClick();
				}
			}}
		>
			{children}
		</Link>
	);
}
