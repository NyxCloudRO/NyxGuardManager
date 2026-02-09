import { put } from "./base";

export const updateNyxGuardAppsDdos = async (enabled: boolean) => {
	return put({ url: "nyxguard/apps/ddos", data: { enabled } });
};

