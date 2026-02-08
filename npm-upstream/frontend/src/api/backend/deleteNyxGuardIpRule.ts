import { del } from "./base";

export async function deleteNyxGuardIpRule(ruleId: number): Promise<void> {
	await del({ url: `nyxguard/rules/ip/${ruleId}` });
}

