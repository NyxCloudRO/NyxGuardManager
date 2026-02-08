import { post } from "./base";
import type { NyxGuardIpRule } from "./getNyxGuardIpRules";

export type CreateNyxGuardIpRule = Pick<NyxGuardIpRule, "action" | "ipCidr"> & {
	enabled?: boolean;
	note?: string | null;
	expiresInDays?: 1 | 7 | 30 | 60 | 90 | 180 | null;
};

export async function createNyxGuardIpRule(data: CreateNyxGuardIpRule): Promise<NyxGuardIpRule> {
	const res = await post({ url: "nyxguard/rules/ip", data });
	return (res as any).item as NyxGuardIpRule;
}
