import { del, get, post } from "./base";

export interface NyxGuardGeoipStatus {
	installed: boolean;
	path: string;
	size: number | null;
	modifiedOn: string | null;
	updateConfigured?: boolean;
}

export async function getNyxGuardGeoip(): Promise<NyxGuardGeoipStatus> {
	return get({ url: "nyxguard/geoip" });
}

export async function uploadNyxGuardGeoip(mmdb: File): Promise<void> {
	const fd = new FormData();
	fd.append("mmdb", mmdb, mmdb.name);
	await post({ url: "nyxguard/geoip", data: fd });
}

export async function setNyxGuardGeoipUpdateConfig(accountId: string, licenseKey: string): Promise<void> {
	await post({ url: "nyxguard/geoip/config", data: { accountId, licenseKey } });
}

export async function clearNyxGuardGeoipUpdateConfig(): Promise<void> {
	// backend returns 204
	await del({ url: "nyxguard/geoip/config" });
}
