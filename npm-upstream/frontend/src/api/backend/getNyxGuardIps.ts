import { get } from "./base";

export interface NyxGuardIpItem {
	ip: string;
	requests: number;
	allowed: number;
	blocked: number;
	lastSeen: string;
	hosts: string[];
	country: string | null;
}

export interface NyxGuardIpsResponse {
	windowMinutes: number;
	now: string;
	items: NyxGuardIpItem[];
}

export async function getNyxGuardIps(minutes = 1440, limit = 200): Promise<NyxGuardIpsResponse> {
	return get({ url: "nyxguard/ips", params: { minutes, limit } });
}

