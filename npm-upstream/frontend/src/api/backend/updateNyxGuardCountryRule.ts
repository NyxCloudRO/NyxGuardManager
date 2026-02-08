import { put } from "./base";
import type { NyxGuardCountryRule } from "./getNyxGuardCountryRules";

export type UpdateNyxGuardCountryRule = Partial<
	Pick<NyxGuardCountryRule, "enabled" | "action" | "countryCode" | "note" | "expiresOn"> & {
		expiresInDays: 1 | 7 | 30 | 60 | 90 | 180 | null;
	}
>;

export async function updateNyxGuardCountryRule(ruleId: number, patch: UpdateNyxGuardCountryRule): Promise<void> {
	await put({ url: `nyxguard/rules/country/${ruleId}`, data: patch });
}

