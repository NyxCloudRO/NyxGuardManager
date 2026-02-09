import { put } from "./base";

export interface UpdateNyxGuardAppsWafResponse {
	updated: number;
}

export async function updateNyxGuardAppsWaf(enabled: boolean): Promise<UpdateNyxGuardAppsWafResponse> {
	return put({ url: "nyxguard/apps/waf", data: { enabled } });
}

