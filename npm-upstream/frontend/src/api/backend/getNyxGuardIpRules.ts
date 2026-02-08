import { get } from "./base";

export interface NyxGuardIpRule {
	id: number;
	enabled: boolean;
	action: "allow" | "deny";
	ipCidr: string;
	note: string | null;
	expiresOn: string | null;
	createdOn: string;
	modifiedOn: string;
}

export interface NyxGuardIpRulesResponse {
	items: NyxGuardIpRule[];
}

export async function getNyxGuardIpRules(): Promise<NyxGuardIpRulesResponse> {
	return get({ url: "nyxguard/rules/ip" });
}
