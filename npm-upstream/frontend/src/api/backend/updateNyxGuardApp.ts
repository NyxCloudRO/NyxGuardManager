import { put } from "./base";

export interface UpdateNyxGuardAppResponse {
	id: number;
	wafEnabled: boolean;
	botDefenseEnabled: boolean;
	ddosEnabled: boolean;
	sqliEnabled: boolean;
	authBypassEnabled: boolean;
}

export interface UpdateNyxGuardAppRequest {
	wafEnabled: boolean;
	botDefenseEnabled?: boolean;
	ddosEnabled?: boolean;
	sqliEnabled?: boolean;
	authBypassEnabled?: boolean;
}

export async function updateNyxGuardApp(hostId: number, patch: UpdateNyxGuardAppRequest): Promise<UpdateNyxGuardAppResponse> {
	return put({ url: `nyxguard/apps/${hostId}`, data: patch });
}
