import { get } from "./base";

export type NyxGuardAttackType = "sqli" | "ddos" | "bot";

export interface NyxGuardAttackBan {
	ruleId: number;
	enabled: boolean;
	expiresOn: string | null; // null means permanent
	modifiedOn: string;
	note: string | null;
}

export interface NyxGuardAttackItem {
	ip: string;
	type: NyxGuardAttackType;
	count: number;
	lastSeen: string;
	ban: NyxGuardAttackBan | null;
}

export interface NyxGuardAttacksResponse {
	days: 1 | 7 | 30;
	items: NyxGuardAttackItem[];
}

export async function getNyxGuardAttacks(days: 1 | 7 | 30, limit = 200, type?: NyxGuardAttackType): Promise<NyxGuardAttacksResponse> {
	const params = new URLSearchParams();
	params.set("days", String(days));
	params.set("limit", String(limit));
	if (type) params.set("type", type);
	return get({ url: `nyxguard/attacks?${params.toString()}` });
}

