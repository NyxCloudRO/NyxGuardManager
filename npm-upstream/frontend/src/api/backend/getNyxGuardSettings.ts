import { get } from "./base";

export interface NyxGuardSettings {
	botDefenseEnabled: boolean;
	ddosEnabled: boolean;
	logRetentionDays: 30 | 60 | 90 | 180;
}

export async function getNyxGuardSettings(): Promise<NyxGuardSettings> {
	return get({ url: "nyxguard/settings" });
}
