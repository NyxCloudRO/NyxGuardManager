import { IconCheck, IconPalette } from "@tabler/icons-react";
import cn from "classnames";
import { useTheme } from "src/hooks";
import { intl } from "src/locale";
import styles from "./ThemeSwitcher.module.css";

interface Props {
	className?: string;
	compact?: boolean;
}
function ThemeSwitcher({ className, compact = false }: Props) {
	const { currentTheme, themes, setTheme } = useTheme();

	return (
		<div className={cn("dropdown", className)}>
			<button
				type="button"
				className={cn("btn btn-sm dropdown-toggle", styles.switcherBtn, {
					[styles.compactBtn]: compact,
				})}
				data-bs-toggle="dropdown"
			>
				<IconPalette size={16} />
				<span className={styles.switcherLabel}>
					{intl.formatMessage({ id: "theme.label" })}
					{compact ? "" : ":"} <strong>{currentTheme.displayName}</strong>
				</span>
			</button>
			<div className={cn("dropdown-menu", "dropdown-menu-end", styles.switcherMenu)}>
				{themes.map((theme) => (
					<button
						type="button"
						key={theme.id}
						className={cn("dropdown-item", styles.switcherItem, {
							[styles.active]: currentTheme.id === theme.id,
						})}
						onClick={() => setTheme(theme.id)}
					>
						<span>{theme.displayName}</span>
						{currentTheme.id === theme.id ? <IconCheck size={14} /> : null}
					</button>
				))}
			</div>
		</div>
	);
}

export { ThemeSwitcher };
