import type React from "react";
import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from "react";
import { DEFAULT_THEME_ID, getThemeById, type AppTheme, type AppThemeId, themes } from "./themes";

const StorageKey = "app_theme";

const TOKEN_TO_CSS_VAR: Record<string, string> = {
	background: "--app-background",
	pageGradient: "--app-page-gradient",
	bodyOverlayA: "--app-body-overlay-a",
	bodyOverlayB: "--app-body-overlay-b",
	bodyOverlayAPosition: "--app-body-overlay-a-pos",
	bodyOverlayBPosition: "--app-body-overlay-b-pos",
	surface: "--app-surface",
	surface2: "--app-surface-2",
	textPrimary: "--app-text-primary",
	textSecondary: "--app-text-secondary",
	primary: "--app-primary",
	secondary: "--app-secondary",
	border: "--app-border",
	success: "--app-success",
	warning: "--app-warning",
	error: "--app-error",
	sidebarTop: "--app-sidebar-top",
	sidebarBottom: "--app-sidebar-bottom",
	sidebarOverlayA: "--app-sidebar-overlay-a",
	sidebarOverlayB: "--app-sidebar-overlay-b",
	cardStart: "--app-card-start",
	cardEnd: "--app-card-end",
	dropdownBackground: "--app-dropdown-bg",
	dropdownHover: "--app-dropdown-hover",
	modalBackground: "--app-modal-bg",
	inputBackground: "--app-input-bg",
	focusRing: "--app-focus-ring",
	ctaGradient: "--app-cta-gradient",
	ctaText: "--app-cta-text",
};

export interface ThemeContextType {
	currentTheme: AppTheme;
	themeId: AppThemeId;
	themes: AppTheme[];
	setTheme: (themeId: AppThemeId) => void;
	getTheme: () => AppThemeId;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

interface ThemeProviderProps {
	children: ReactNode;
}

const readStoredTheme = (): AppThemeId => {
	if (typeof window === "undefined") {
		return DEFAULT_THEME_ID;
	}
	const stored = localStorage.getItem(StorageKey);
	const selected = getThemeById(stored);
	return selected.id;
};

const applyThemeVariables = (theme: AppTheme) => {
	if (typeof document === "undefined") return;
	const root = document.documentElement;
	root.setAttribute("data-app-theme", theme.id);
	root.setAttribute("data-bs-theme", "dark");
	document.body.dataset.theme = theme.id;
	document.body.classList.remove("light", "dark");
	document.body.classList.add("dark");

	for (const [tokenKey, cssVar] of Object.entries(TOKEN_TO_CSS_VAR)) {
		const tokenValue = theme.tokens[tokenKey as keyof typeof theme.tokens];
		root.style.setProperty(cssVar, tokenValue);
	}
};

export const ThemeProvider: React.FC<ThemeProviderProps> = ({ children }) => {
	const [themeId, setThemeId] = useState<AppThemeId>(() => readStoredTheme());

	useEffect(() => {
		const selectedTheme = getThemeById(themeId);
		applyThemeVariables(selectedTheme);
		localStorage.setItem(StorageKey, selectedTheme.id);
	}, [themeId]);

	const contextValue = useMemo<ThemeContextType>(() => {
		const currentTheme = getThemeById(themeId);
		return {
			currentTheme,
			themeId: currentTheme.id,
			themes,
			setTheme: (nextThemeId: AppThemeId) => setThemeId(nextThemeId),
			getTheme: () => currentTheme.id,
		};
	}, [themeId]);

	return <ThemeContext.Provider value={contextValue}>{children}</ThemeContext.Provider>;
};

export function useTheme(): ThemeContextType {
	const context = useContext(ThemeContext);
	if (!context) {
		throw new Error("useTheme must be used within a ThemeProvider");
	}
	return context;
}
