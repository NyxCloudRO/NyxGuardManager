import { get } from "./base";

export interface NyxGuardAppsSummary {
	totalApps: number;
	protectedCount: number;
}

export async function getNyxGuardAppsSummary(): Promise<NyxGuardAppsSummary> {
	return get({ url: "nyxguard/apps/summary" });
}

