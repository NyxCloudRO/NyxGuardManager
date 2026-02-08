import { put } from "./base";
import type { NyxGuardIpRule } from "./getNyxGuardIpRules";

export type UpdateNyxGuardIpRule = Partial<
	Pick<NyxGuardIpRule, "enabled" | "action" | "ipCidr" | "note" | "expiresOn"> & {
		expiresInDays: 1 | 7 | 30 | 60 | 90 | 180 | null;
	}
>;

export async function updateNyxGuardIpRule(ruleId: number, patch: UpdateNyxGuardIpRule): Promise<void> {
	await put({ url: `nyxguard/rules/ip/${ruleId}`, data: patch });
}
