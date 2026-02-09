import { get } from "./base";

export interface NyxGuardSummaryHost {
	host: string;
	requests: number;
	allowed: number;
	blocked: number;
	uniqueIps: number;
}

export interface NyxGuardSummaryRecent {
	ts: number;
	iso: string;
	host: string;
	uri: string;
	method: string;
	scheme: string;
	status: number | null;
	ip: string;
	country?: string | null;
}

export interface NyxGuardSummary {
	windowMinutes: number;
	now: string;
	requests: number;
	allowed: number;
	blocked: number;
	uniqueIps: number;
	hosts: NyxGuardSummaryHost[];
	recent: NyxGuardSummaryRecent[];
	truncated?: boolean;
}

export async function getNyxGuardSummary(minutes = 15, limit = 50): Promise<NyxGuardSummary> {
	return get({ url: "nyxguard/summary", params: { minutes, limit } });
}
