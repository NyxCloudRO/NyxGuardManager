import { post } from "./base";
import type { NyxGuardCountryRule } from "./getNyxGuardCountryRules";

export type CreateNyxGuardCountryRule = Pick<NyxGuardCountryRule, "action" | "countryCode"> & {
	enabled?: boolean;
	note?: string | null;
	expiresInDays?: 1 | 7 | 30 | 60 | 90 | 180 | null;
};

export async function createNyxGuardCountryRule(data: CreateNyxGuardCountryRule): Promise<NyxGuardCountryRule> {
	const res = await post({ url: "nyxguard/rules/country", data });
	return (res as any).item as NyxGuardCountryRule;
}
