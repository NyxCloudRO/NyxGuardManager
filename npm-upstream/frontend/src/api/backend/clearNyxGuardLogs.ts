import { post } from "./base";

export type NyxGuardLogClearTarget = "traffic" | "ips" | "attacks";

export interface ClearNyxGuardLogsPayload {
	target: NyxGuardLogClearTarget;
	minutes?: number;
	days?: 1 | 7 | 30 | 60 | 90;
}

export interface ClearNyxGuardLogsResponse {
	target: NyxGuardLogClearTarget;
	deletedRows: number;
	clearedFiles: number;
}

export async function clearNyxGuardLogs(payload: ClearNyxGuardLogsPayload): Promise<ClearNyxGuardLogsResponse> {
	return post({ url: "nyxguard/logs/clear", data: payload });
}
