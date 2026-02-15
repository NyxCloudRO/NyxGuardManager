import { IconCheck, IconLanguage } from "@tabler/icons-react";
import cn from "classnames";
import { useLocaleState } from "src/context";
import { changeLocale, intl, localeOptions } from "src/locale";
import styles from "./LocalePicker.module.css";

interface Props {
	menuAlign?: "start" | "end";
	compact?: boolean;
}

function LocalePicker({ menuAlign = "start", compact = false }: Props) {
	const { locale, setLocale } = useLocaleState();
	const selected = localeOptions.find((item) => item.code === (locale || "en").slice(0, 2)) || localeOptions[0];

	const changeTo = (lang: string) => {
		changeLocale(lang);
		setLocale(lang);
		location.reload();
	};

	const classes = ["btn", "dropdown-toggle", "btn-sm", styles.btn, compact ? styles.compactBtn : ""];
	const cns = cn(...classes, "btn-ghost-dark");

	return (
		<div className="dropdown">
			<button type="button" className={cns} data-bs-toggle="dropdown" aria-label="Select language">
				<IconLanguage size={16} />
				<span className={styles.label}>
					{intl.formatMessage({ id: "language.label" })}
					{compact ? "" : ":"} <strong>{selected.label}</strong>
				</span>
			</button>
			<div
				className={cn("dropdown-menu", styles.menu, {
					"dropdown-menu-end": menuAlign === "end",
				})}
			>
				{localeOptions.map((item) => (
					<button
						type="button"
						className="dropdown-item"
						key={`locale-${item.code}`}
						onClick={() => changeTo(item.code)}
					>
						<span>{item.label}</span>
						{selected.code === item.code ? <IconCheck size={14} /> : null}
					</button>
				))}
			</div>
		</div>
	);
}

export { LocalePicker };
