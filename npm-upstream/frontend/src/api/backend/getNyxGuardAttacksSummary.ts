import { get } from "./base";
import type { NyxGuardAttackType } from "./getNyxGuardAttacks";

export interface NyxGuardAttacksSummaryResponse {
	minutes: number;
	total: number;
	byType: Record<NyxGuardAttackType, number>;
	last: { type: NyxGuardAttackType; ip: string; createdOn: string } | null;
}

export async function getNyxGuardAttacksSummary(minutes: number): Promise<NyxGuardAttacksSummaryResponse> {
	return get({ url: `nyxguard/attacks/summary?minutes=${encodeURIComponent(String(minutes))}` });
}

