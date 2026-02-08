import { del } from "./base";

export async function deleteNyxGuardCountryRule(ruleId: number): Promise<void> {
	await del({ url: `nyxguard/rules/country/${ruleId}` });
}

