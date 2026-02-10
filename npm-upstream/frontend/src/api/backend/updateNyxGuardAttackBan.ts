import { put } from "./base";

export type NyxGuardBanDuration = "24h" | "30d" | "permanent";

export interface UpdateNyxGuardAttackBanResponse {
	ip: string;
	duration: NyxGuardBanDuration;
	expiresOn: string | null;
}

export async function updateNyxGuardAttackBan(ip: string, duration: NyxGuardBanDuration): Promise<UpdateNyxGuardAttackBanResponse> {
	return put({ url: "nyxguard/attacks/ban", data: { ip, duration } });
}

