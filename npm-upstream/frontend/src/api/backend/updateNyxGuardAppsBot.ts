import { put } from "./base";

export const updateNyxGuardAppsBot = async (enabled: boolean) => {
	return put({ url: "nyxguard/apps/bot", data: { enabled } });
};

