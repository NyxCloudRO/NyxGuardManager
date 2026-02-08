import { get } from "./base";

export interface NyxGuardCountryRule {
	id: number;
	enabled: boolean;
	action: "allow" | "deny";
	countryCode: string;
	note: string | null;
	expiresOn: string | null;
	createdOn: string;
	modifiedOn: string;
}

export interface NyxGuardCountryRulesResponse {
	items: NyxGuardCountryRule[];
}

export async function getNyxGuardCountryRules(): Promise<NyxGuardCountryRulesResponse> {
	return get({ url: "nyxguard/rules/country" });
}

