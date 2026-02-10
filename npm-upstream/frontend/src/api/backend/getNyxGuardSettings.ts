import { get } from "./base";

export interface NyxGuardSettings {
	botDefenseEnabled: boolean;
	ddosEnabled: boolean;
	sqliEnabled: boolean;
	logRetentionDays: 30 | 60 | 90 | 180;
	ddosRateRps: number;
	ddosBurst: number;
	ddosConnLimit: number;
	botUaTokens: string;
	botPathTokens: string;
	sqliThreshold: number;
	sqliMaxBody: number;
	sqliProbeMinScore: number;
	sqliProbeBanScore: number;
	sqliProbeWindowSec: number;
	authfailThreshold: number;
	authfailWindowSec: number;
	authfailBanHours: number;
	authBypassEnabled: boolean;
}

export async function getNyxGuardSettings(): Promise<NyxGuardSettings> {
	return get({ url: "nyxguard/settings" });
}
