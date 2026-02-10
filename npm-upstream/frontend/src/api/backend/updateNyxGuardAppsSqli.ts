import { put } from "./base";

export const updateNyxGuardAppsSqli = async (enabled: boolean) => {
	return put({ url: "nyxguard/apps/sqli", data: { enabled } });
};

