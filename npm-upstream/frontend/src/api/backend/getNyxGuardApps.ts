import { get } from "./base";

export interface NyxGuardAppItem {
	id: number;
	enabled: boolean;
	domains: string[];
	forwardHost: string | null;
	forwardPort: number | null;
	wafEnabled: boolean;
	botDefenseEnabled: boolean;
	ddosEnabled: boolean;
}

export interface NyxGuardAppsResponse {
	items: NyxGuardAppItem[];
}

export async function getNyxGuardApps(): Promise<NyxGuardAppsResponse> {
	return get({ url: "nyxguard/apps" });
}
