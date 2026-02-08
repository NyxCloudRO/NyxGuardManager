import { put } from "./base";

export interface UpdateNyxGuardAppResponse {
	id: number;
	wafEnabled: boolean;
}

export async function updateNyxGuardApp(hostId: number, wafEnabled: boolean): Promise<UpdateNyxGuardAppResponse> {
	return put({ url: `nyxguard/apps/${hostId}`, data: { wafEnabled } });
}

