export type AppThemeId = "nyx-aurora" | "nyx-ember" | "forest" | "midnight" | "oceanic";

export interface ThemeTokens {
	background: string;
	surface: string;
	surface2: string;
	textPrimary: string;
	textSecondary: string;
	primary: string;
	secondary: string;
	border: string;
	success: string;
	warning: string;
	error: string;
	sidebarTop: string;
	sidebarBottom: string;
	sidebarOverlayA: string;
	sidebarOverlayB: string;
	cardStart: string;
	cardEnd: string;
	dropdownBackground: string;
	dropdownHover: string;
	modalBackground: string;
	inputBackground: string;
	focusRing: string;
}

export interface AppTheme {
	id: AppThemeId;
	displayName: string;
	tokens: ThemeTokens;
}

export const themes: AppTheme[] = [
	{
		id: "nyx-aurora",
		displayName: "Nyx Aurora",
		tokens: {
			background: "#0a1029",
			surface: "rgba(0, 0, 0, 0.16)",
			surface2: "rgba(0, 0, 0, 0.22)",
			textPrimary: "rgba(243, 247, 255, 0.92)",
			textSecondary: "rgba(206, 219, 255, 0.78)",
			primary: "#4b8bff",
			secondary: "#ff2bbd",
			border: "rgba(255, 255, 255, 0.12)",
			success: "#45d284",
			warning: "#ffa642",
			error: "#ff5c92",
			sidebarTop: "rgba(10, 14, 34, 0.86)",
			sidebarBottom: "rgba(10, 14, 34, 0.58)",
			sidebarOverlayA: "rgba(75, 139, 255, 0.16)",
			sidebarOverlayB: "rgba(255, 43, 189, 0.10)",
			cardStart: "rgba(255, 255, 255, 0.06)",
			cardEnd: "rgba(255, 255, 255, 0.03)",
			dropdownBackground: "rgba(10, 14, 34, 0.86)",
			dropdownHover: "linear-gradient(90deg, rgba(75, 139, 255, 0.20), rgba(255, 43, 189, 0.10))",
			modalBackground: "linear-gradient(180deg, rgba(6, 12, 34, 0.96), rgba(10, 18, 46, 0.94))",
			inputBackground: "rgba(255, 255, 255, 0.06)",
			focusRing: "rgba(43, 98, 255, 0.16)",
		},
	},
	{
		id: "nyx-ember",
		displayName: "Nyx Ember",
		tokens: {
			background: "#1c1207",
			surface: "rgba(38, 22, 10, 0.70)",
			surface2: "rgba(51, 27, 12, 0.82)",
			textPrimary: "rgba(255, 245, 232, 0.95)",
			textSecondary: "rgba(246, 212, 175, 0.82)",
			primary: "#ff9f1a",
			secondary: "#ff5f2e",
			border: "rgba(255, 188, 123, 0.28)",
			success: "#8ad66c",
			warning: "#ffc34d",
			error: "#ff6d52",
			sidebarTop: "rgba(42, 22, 9, 0.88)",
			sidebarBottom: "rgba(28, 16, 8, 0.72)",
			sidebarOverlayA: "rgba(255, 159, 26, 0.22)",
			sidebarOverlayB: "rgba(255, 95, 46, 0.18)",
			cardStart: "rgba(255, 176, 96, 0.12)",
			cardEnd: "rgba(255, 112, 57, 0.08)",
			dropdownBackground: "rgba(41, 23, 10, 0.94)",
			dropdownHover: "linear-gradient(90deg, rgba(255, 159, 26, 0.26), rgba(255, 95, 46, 0.20))",
			modalBackground: "linear-gradient(180deg, rgba(46, 25, 10, 0.95), rgba(33, 18, 8, 0.93))",
			inputBackground: "rgba(255, 185, 133, 0.10)",
			focusRing: "rgba(255, 159, 26, 0.22)",
		},
	},
	{
		id: "forest",
		displayName: "Forest Core",
		tokens: {
			background: "#07160f",
			surface: "rgba(12, 37, 24, 0.70)",
			surface2: "rgba(11, 46, 28, 0.82)",
			textPrimary: "rgba(230, 252, 241, 0.94)",
			textSecondary: "rgba(176, 227, 203, 0.84)",
			primary: "#3dbb79",
			secondary: "#7ccf5a",
			border: "rgba(116, 214, 162, 0.30)",
			success: "#62d889",
			warning: "#e6c44d",
			error: "#ff6f7d",
			sidebarTop: "rgba(9, 36, 24, 0.88)",
			sidebarBottom: "rgba(7, 26, 18, 0.72)",
			sidebarOverlayA: "rgba(61, 187, 121, 0.22)",
			sidebarOverlayB: "rgba(124, 207, 90, 0.18)",
			cardStart: "rgba(61, 187, 121, 0.14)",
			cardEnd: "rgba(124, 207, 90, 0.08)",
			dropdownBackground: "rgba(8, 30, 20, 0.94)",
			dropdownHover: "linear-gradient(90deg, rgba(61, 187, 121, 0.24), rgba(124, 207, 90, 0.16))",
			modalBackground: "linear-gradient(180deg, rgba(8, 33, 22, 0.95), rgba(6, 22, 15, 0.93))",
			inputBackground: "rgba(84, 194, 142, 0.11)",
			focusRing: "rgba(61, 187, 121, 0.22)",
		},
	},
	{
		id: "midnight",
		displayName: "Midnight Steel",
		tokens: {
			background: "#0e1118",
			surface: "rgba(21, 26, 38, 0.74)",
			surface2: "rgba(24, 31, 46, 0.84)",
			textPrimary: "rgba(236, 241, 251, 0.93)",
			textSecondary: "rgba(178, 191, 217, 0.82)",
			primary: "#8ea0bf",
			secondary: "#637194",
			border: "rgba(153, 169, 197, 0.30)",
			success: "#70c79f",
			warning: "#d7b56a",
			error: "#ef7f86",
			sidebarTop: "rgba(20, 25, 36, 0.88)",
			sidebarBottom: "rgba(16, 20, 30, 0.74)",
			sidebarOverlayA: "rgba(142, 160, 191, 0.18)",
			sidebarOverlayB: "rgba(99, 113, 148, 0.16)",
			cardStart: "rgba(142, 160, 191, 0.11)",
			cardEnd: "rgba(99, 113, 148, 0.08)",
			dropdownBackground: "rgba(18, 22, 33, 0.95)",
			dropdownHover: "linear-gradient(90deg, rgba(142, 160, 191, 0.24), rgba(99, 113, 148, 0.18))",
			modalBackground: "linear-gradient(180deg, rgba(20, 25, 36, 0.95), rgba(14, 18, 27, 0.93))",
			inputBackground: "rgba(152, 172, 205, 0.10)",
			focusRing: "rgba(142, 160, 191, 0.21)",
		},
	},
	{
		id: "oceanic",
		displayName: "Oceanic Pulse",
		tokens: {
			background: "#04131b",
			surface: "rgba(6, 30, 41, 0.72)",
			surface2: "rgba(7, 40, 55, 0.84)",
			textPrimary: "rgba(228, 250, 255, 0.95)",
			textSecondary: "rgba(168, 221, 234, 0.84)",
			primary: "#00c8b4",
			secondary: "#2dd8ff",
			border: "rgba(123, 222, 235, 0.30)",
			success: "#51d6a4",
			warning: "#ffd05a",
			error: "#ff6f8b",
			sidebarTop: "rgba(6, 32, 44, 0.88)",
			sidebarBottom: "rgba(4, 22, 30, 0.74)",
			sidebarOverlayA: "rgba(0, 200, 180, 0.24)",
			sidebarOverlayB: "rgba(45, 216, 255, 0.20)",
			cardStart: "rgba(0, 200, 180, 0.12)",
			cardEnd: "rgba(45, 216, 255, 0.08)",
			dropdownBackground: "rgba(4, 27, 37, 0.95)",
			dropdownHover: "linear-gradient(90deg, rgba(0, 200, 180, 0.24), rgba(45, 216, 255, 0.18))",
			modalBackground: "linear-gradient(180deg, rgba(5, 30, 41, 0.95), rgba(3, 20, 29, 0.93))",
			inputBackground: "rgba(92, 208, 220, 0.10)",
			focusRing: "rgba(45, 216, 255, 0.20)",
		},
	},
];

export const DEFAULT_THEME_ID: AppThemeId = "nyx-aurora";

export const getThemeById = (id: string | null | undefined): AppTheme =>
	themes.find((theme) => theme.id === id) || themes[0];

