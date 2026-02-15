import { post } from "./base";

export interface RebootAfterImportResponse {
	success: boolean;
	rebooting: boolean;
}

export async function rebootAfterImport(): Promise<RebootAfterImportResponse> {
	return post({ url: "settings/backup/reboot" });
}
