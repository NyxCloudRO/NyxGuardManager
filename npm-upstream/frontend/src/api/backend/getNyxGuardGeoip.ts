import { del, get, post } from "./base";

export type GeoipProvider = "maxmind" | "ip2location";

export interface GeoipProviderStatus {
	installed: boolean;
	path: string;
	size: number | null;
	modifiedOn: string | null;
}

export interface NyxGuardGeoipStatus {
	installed: boolean;
	path: string;
	size: number | null;
	modifiedOn: string | null;
	updateConfigured?: boolean;
	providers?: {
		maxmind?: GeoipProviderStatus;
		ip2location?: GeoipProviderStatus;
	};
}

export async function getNyxGuardGeoip(): Promise<NyxGuardGeoipStatus> {
	return get({ url: "nyxguard/geoip" });
}

export async function uploadNyxGuardGeoip(mmdb: File, provider: GeoipProvider = "maxmind"): Promise<void> {
	const fd = new FormData();
	fd.append("mmdb", mmdb, mmdb.name);
	await post({ url: `nyxguard/geoip?provider=${encodeURIComponent(provider)}`, data: fd });
}

export async function setNyxGuardGeoipUpdateConfig(accountId: string, licenseKey: string): Promise<void> {
	await post({ url: "nyxguard/geoip/config", data: { accountId, licenseKey } });
}

export async function clearNyxGuardGeoipUpdateConfig(): Promise<void> {
	// backend returns 204
	await del({ url: "nyxguard/geoip/config" });
}
