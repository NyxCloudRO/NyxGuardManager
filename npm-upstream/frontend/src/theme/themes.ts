export type AppThemeId =
	| "nyx-aurora"
	| "nyx-ember"
	| "forest"
	| "midnight"
	| "oceanic"
	| "crimson-noir"
	| "frost-glyph"
	| "solar-flare";

export interface ThemeTokens {
	background: string;
	pageGradient: string;
	bodyOverlayA: string;
	bodyOverlayB: string;
	bodyOverlayAPosition: string;
	bodyOverlayBPosition: string;
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
	ctaGradient: string;
	ctaText: string;
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
			pageGradient: "radial-gradient(120% 120% at 10% 10%, #2b6bff 0%, #1b2a6b 40%, #5b1d84 70%, #a31a78 100%)",
			bodyOverlayA: "rgba(75, 139, 255, 0.16)",
			bodyOverlayB: "rgba(255, 43, 189, 0.10)",
			bodyOverlayAPosition: "10% 0%",
			bodyOverlayBPosition: "90% 10%",
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
			ctaGradient: "linear-gradient(120deg, #4b8bff, #ff2bbd)",
			ctaText: "#f7fbff",
		},
	},
	{
		id: "nyx-ember",
		displayName: "Ember Forge",
		tokens: {
			background: "#1c1207",
			pageGradient: "linear-gradient(135deg, #2a1108 0%, #3d170b 38%, #7b3012 72%, #ff9f1a 100%)",
			bodyOverlayA: "rgba(255, 159, 26, 0.20)",
			bodyOverlayB: "rgba(255, 95, 46, 0.16)",
			bodyOverlayAPosition: "88% 92%",
			bodyOverlayBPosition: "74% 84%",
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
			ctaGradient: "linear-gradient(120deg, #ff9f1a, #ff5f2e)",
			ctaText: "#fff9ef",
		},
	},
	{
		id: "forest",
		displayName: "Forest Core",
		tokens: {
			background: "#07160f",
			pageGradient: "linear-gradient(135deg, #081b12 0%, #0d2a1c 38%, #1d5b3c 72%, #3dbb79 100%)",
			bodyOverlayA: "rgba(61, 187, 121, 0.18)",
			bodyOverlayB: "rgba(124, 207, 90, 0.14)",
			bodyOverlayAPosition: "88% 92%",
			bodyOverlayBPosition: "74% 84%",
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
			ctaGradient: "linear-gradient(120deg, #3dbb79, #7ccf5a)",
			ctaText: "#f2fff8",
		},
	},
	{
		id: "midnight",
		displayName: "Midnight Steel",
		tokens: {
			background: "#0e1118",
			pageGradient: "linear-gradient(135deg, #101620 0%, #172130 38%, #324056 72%, #8ea0bf 100%)",
			bodyOverlayA: "rgba(142, 160, 191, 0.18)",
			bodyOverlayB: "rgba(99, 113, 148, 0.14)",
			bodyOverlayAPosition: "88% 92%",
			bodyOverlayBPosition: "74% 84%",
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
			ctaGradient: "linear-gradient(120deg, #8ea0bf, #637194)",
			ctaText: "#f4f7ff",
		},
	},
	{
		id: "oceanic",
		displayName: "Oceanic Pulse",
		tokens: {
			background: "#04131b",
			pageGradient: "linear-gradient(135deg, #051a24 0%, #0a2a38 38%, #136078 72%, #00c8b4 100%)",
			bodyOverlayA: "rgba(0, 200, 180, 0.20)",
			bodyOverlayB: "rgba(45, 216, 255, 0.16)",
			bodyOverlayAPosition: "88% 92%",
			bodyOverlayBPosition: "74% 84%",
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
			ctaGradient: "linear-gradient(120deg, #00c8b4, #2dd8ff)",
			ctaText: "#f2ffff",
		},
	},
	{
		id: "crimson-noir",
		displayName: "Crimson Noir",
		tokens: {
			background: "#17080c",
			pageGradient: "linear-gradient(135deg, #1d090f 0%, #2f0f18 38%, #5a1427 72%, #bf3658 100%)",
			bodyOverlayA: "rgba(191, 54, 88, 0.20)",
			bodyOverlayB: "rgba(255, 126, 86, 0.14)",
			bodyOverlayAPosition: "88% 92%",
			bodyOverlayBPosition: "74% 84%",
			surface: "rgba(34, 10, 18, 0.72)",
			surface2: "rgba(44, 13, 24, 0.84)",
			textPrimary: "rgba(255, 236, 242, 0.95)",
			textSecondary: "rgba(236, 185, 198, 0.84)",
			primary: "#bf3658",
			secondary: "#ff7e56",
			border: "rgba(244, 141, 163, 0.30)",
			success: "#66d59d",
			warning: "#ffc75f",
			error: "#ff7a90",
			sidebarTop: "rgba(36, 11, 19, 0.88)",
			sidebarBottom: "rgba(22, 8, 12, 0.74)",
			sidebarOverlayA: "rgba(191, 54, 88, 0.24)",
			sidebarOverlayB: "rgba(255, 126, 86, 0.18)",
			cardStart: "rgba(191, 54, 88, 0.12)",
			cardEnd: "rgba(255, 126, 86, 0.08)",
			dropdownBackground: "rgba(30, 10, 16, 0.95)",
			dropdownHover: "linear-gradient(90deg, rgba(191, 54, 88, 0.24), rgba(255, 126, 86, 0.16))",
			modalBackground: "linear-gradient(180deg, rgba(38, 11, 20, 0.96), rgba(24, 8, 14, 0.94))",
			inputBackground: "rgba(224, 120, 144, 0.11)",
			focusRing: "rgba(191, 54, 88, 0.22)",
			ctaGradient: "linear-gradient(120deg, #bf3658, #ff7e56)",
			ctaText: "#fff7f9",
		},
	},
	{
		id: "frost-glyph",
		displayName: "Frost Glyph",
		tokens: {
			background: "#0a1520",
			pageGradient: "linear-gradient(135deg, #0e1b29 0%, #183043 38%, #2f6683 72%, #7ed4ee 100%)",
			bodyOverlayA: "rgba(126, 212, 238, 0.18)",
			bodyOverlayB: "rgba(112, 164, 223, 0.14)",
			bodyOverlayAPosition: "88% 92%",
			bodyOverlayBPosition: "74% 84%",
			surface: "rgba(14, 33, 46, 0.72)",
			surface2: "rgba(18, 44, 61, 0.84)",
			textPrimary: "rgba(233, 247, 255, 0.95)",
			textSecondary: "rgba(178, 209, 226, 0.84)",
			primary: "#7ed4ee",
			secondary: "#70a4df",
			border: "rgba(154, 206, 230, 0.30)",
			success: "#69d4b3",
			warning: "#ffd272",
			error: "#ff8ca3",
			sidebarTop: "rgba(15, 35, 49, 0.88)",
			sidebarBottom: "rgba(10, 22, 33, 0.74)",
			sidebarOverlayA: "rgba(126, 212, 238, 0.22)",
			sidebarOverlayB: "rgba(112, 164, 223, 0.16)",
			cardStart: "rgba(126, 212, 238, 0.12)",
			cardEnd: "rgba(112, 164, 223, 0.08)",
			dropdownBackground: "rgba(13, 30, 42, 0.95)",
			dropdownHover: "linear-gradient(90deg, rgba(126, 212, 238, 0.24), rgba(112, 164, 223, 0.18))",
			modalBackground: "linear-gradient(180deg, rgba(17, 39, 55, 0.96), rgba(10, 24, 35, 0.94))",
			inputBackground: "rgba(133, 196, 226, 0.11)",
			focusRing: "rgba(126, 212, 238, 0.22)",
			ctaGradient: "linear-gradient(120deg, #7ed4ee, #70a4df)",
			ctaText: "#f3fbff",
		},
	},
	{
		id: "solar-flare",
		displayName: "Solar Flare",
		tokens: {
			background: "#170e06",
			pageGradient: "linear-gradient(135deg, #211208 0%, #3d1d0b 38%, #89320f 72%, #ffd048 100%)",
			bodyOverlayA: "rgba(255, 208, 72, 0.18)",
			bodyOverlayB: "rgba(255, 106, 41, 0.16)",
			bodyOverlayAPosition: "88% 92%",
			bodyOverlayBPosition: "74% 84%",
			surface: "rgba(45, 22, 9, 0.72)",
			surface2: "rgba(59, 28, 11, 0.84)",
			textPrimary: "rgba(255, 244, 228, 0.95)",
			textSecondary: "rgba(236, 206, 167, 0.84)",
			primary: "#ffd048",
			secondary: "#ff6a29",
			border: "rgba(236, 180, 104, 0.30)",
			success: "#7bd89f",
			warning: "#ffd96f",
			error: "#ff8b7f",
			sidebarTop: "rgba(47, 23, 9, 0.88)",
			sidebarBottom: "rgba(25, 14, 8, 0.74)",
			sidebarOverlayA: "rgba(255, 208, 72, 0.22)",
			sidebarOverlayB: "rgba(255, 106, 41, 0.16)",
			cardStart: "rgba(255, 208, 72, 0.12)",
			cardEnd: "rgba(255, 106, 41, 0.08)",
			dropdownBackground: "rgba(35, 18, 9, 0.95)",
			dropdownHover: "linear-gradient(90deg, rgba(255, 208, 72, 0.24), rgba(255, 106, 41, 0.16))",
			modalBackground: "linear-gradient(180deg, rgba(48, 23, 10, 0.96), rgba(28, 16, 9, 0.94))",
			inputBackground: "rgba(236, 176, 101, 0.11)",
			focusRing: "rgba(255, 208, 72, 0.22)",
			ctaGradient: "linear-gradient(120deg, #ffd048, #ff6a29)",
			ctaText: "#fff9ee",
		},
	},
];

export const DEFAULT_THEME_ID: AppThemeId = "nyx-aurora";

export const getThemeById = (id: string | null | undefined): AppTheme =>
	themes.find((theme) => theme.id === id) || themes[0];
