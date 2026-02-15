import { post } from "./base";

export interface ImportConfigurationResponse {
	success: boolean;
	version: string;
	message: string;
}

export async function importConfiguration(file: File): Promise<ImportConfigurationResponse> {
	const formData = new FormData();
	formData.append("backup", file);
	return post({ url: "settings/backup/import", data: formData });
}
