import { put } from "./base";
import type { NyxGuardSettings } from "./getNyxGuardSettings";

export async function updateNyxGuardSettings(patch: Partial<NyxGuardSettings>): Promise<NyxGuardSettings> {
	return put({ url: "nyxguard/settings", data: patch });
}

