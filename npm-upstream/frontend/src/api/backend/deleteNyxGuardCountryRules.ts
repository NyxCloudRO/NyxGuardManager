import { del } from "./base";

export async function deleteNyxGuardCountryRules(): Promise<{ deleted: number }> {
	return del({ url: "nyxguard/rules/country" });
}

