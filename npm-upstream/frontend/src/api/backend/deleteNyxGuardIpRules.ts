import { del } from "./base";

export async function deleteNyxGuardIpRules(): Promise<{ deleted: number }> {
	return del({ url: "nyxguard/rules/ip" });
}

