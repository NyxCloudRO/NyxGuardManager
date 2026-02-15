import AuthStore from "src/modules/AuthStore";

export interface ExportConfigurationResult {
	filename: string;
}

function authHeaders(): Record<string, string> {
	if (!AuthStore.token?.token) return {};
	return { Authorization: `Bearer ${AuthStore.token.token}` };
}

export async function exportConfiguration(): Promise<ExportConfigurationResult> {
	const response = await fetch("/api/settings/backup/export", {
		method: "GET",
		headers: authHeaders(),
	});

	if (!response.ok) {
		let message = `Export failed (${response.status})`;
		try {
			const payload = await response.json();
			message = payload?.error?.message || message;
		} catch {
			// ignore
		}
		throw new Error(message);
	}

	const blob = await response.blob();
	const cd = response.headers.get("content-disposition") || "";
	const match = cd.match(/filename="([^"]+)"/i);
	const filename = match?.[1] || "nyxguard-backup.json";

	const objectUrl = window.URL.createObjectURL(blob);
	const link = document.createElement("a");
	link.href = objectUrl;
	link.download = filename;
	document.body.appendChild(link);
	link.click();
	link.remove();
	window.URL.revokeObjectURL(objectUrl);

	return { filename };
}
