import fs from "node:fs/promises";
import http from "node:http";

const env = process.env;
const api = (method, pathname, body = null) =>
	new Promise((resolve, reject) => {
		const req = http.request(
			{
				socketPath: "/var/run/docker.sock",
				path: `/v1.41${pathname}`,
				method,
				headers: body ? { "Content-Type": "application/json" } : undefined,
			},
			(res) => {
				let raw = "";
				res.setEncoding("utf8");
				res.on("data", (chunk) => (raw += chunk));
				res.on("end", () => {
					if ((res.statusCode || 500) >= 400) {
						reject(new Error(`${method} ${pathname}: ${res.statusCode} ${raw}`));
						return;
					}
					try {
						resolve(raw ? JSON.parse(raw) : {});
					} catch {
						resolve(raw);
					}
				});
			},
		);
		req.on("error", reject);
		if (body) req.write(JSON.stringify(body));
		req.end();
	});

const ignore = (promise) => promise.catch(() => undefined);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitHealthy(id, timeoutMs = 120000) {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		const info = await api("GET", `/containers/${id}/json`);
		if (!info.State?.Running) throw new Error(`${id} stopped during startup`);
		const health = info.State.Health?.Status;
		if (health === "healthy" || (!info.State.Health && Date.now() + 5000 < deadline)) {
			if (!info.State.Health) await sleep(5000);
			return;
		}
		if (health === "unhealthy") throw new Error(`${id} became unhealthy`);
		await sleep(2000);
	}
	throw new Error(`${id} did not become healthy in time`);
}

async function updateState(success, error = null) {
	const file = "/handover-data/update-manager/state.json";
	let state = {};
	try {
		state = JSON.parse(await fs.readFile(file, "utf8"));
	} catch {
		// The application recreates defaults if this file did not exist.
	}
	if (success) {
		const record = { from: env.CURRENT_VERSION, to: env.TARGET_VERSION, at: new Date().toISOString() };
		state.currentVersion = env.TARGET_VERSION;
		state.pendingVersion = null;
		state.restartPending = false;
		state.updateAvailable = false;
		state.lastSuccessfulUpdate = record;
		state.updateHistory = Array.isArray(state.updateHistory) ? state.updateHistory : [];
		state.updateHistory.unshift(record);
		state.updateHistory = state.updateHistory.slice(0, 50);
		delete state.lastApplyFailure;
	} else {
		state.restartPending = true;
		state.pendingVersion = env.TARGET_VERSION;
		state.lastApplyFailure = { at: new Date().toISOString(), error: String(error || "handover failed") };
	}
	await fs.mkdir("/handover-data/update-manager", { recursive: true });
	await fs.writeFile(file, JSON.stringify(state, null, 2), "utf8");
}

async function rollback(error) {
	console.error(`Handover failed: ${error instanceof Error ? error.message : String(error)}`);
	await ignore(api("POST", `/containers/${env.NEW_VPN_ID}/stop?t=5`));
	await ignore(api("DELETE", `/containers/${env.NEW_VPN_ID}?force=1`));
	await ignore(api("POST", `/containers/${env.NEW_MANAGER_ID}/stop?t=5`));
	await ignore(api("DELETE", `/containers/${env.NEW_MANAGER_ID}?force=1`));
	await ignore(api("POST", `/containers/${env.OLD_MANAGER_ID}/rename?name=${encodeURIComponent(env.OLD_MANAGER_NAME)}`));
	await ignore(api("POST", `/containers/${env.OLD_VPN_ID}/rename?name=${encodeURIComponent(env.OLD_VPN_NAME)}`));
	await ignore(api("POST", `/containers/${env.OLD_MANAGER_ID}/start`));
	await waitHealthy(env.OLD_MANAGER_ID).catch(() => undefined);
	await ignore(api("POST", `/containers/${env.OLD_VPN_ID}/start`));
	await updateState(false, error).catch(() => undefined);
}

try {
	await sleep(1500);
	await api("POST", `/containers/${env.OLD_VPN_ID}/stop?t=15`);
	await api("POST", `/containers/${env.OLD_MANAGER_ID}/stop?t=20`);
	await api("POST", `/containers/${env.NEW_MANAGER_ID}/start`);
	await waitHealthy(env.NEW_MANAGER_ID);
	await api("POST", `/containers/${env.NEW_VPN_ID}/start`);
	await waitHealthy(env.NEW_VPN_ID);
	await updateState(true);
	await api("DELETE", `/containers/${env.OLD_VPN_ID}?force=1`);
	await api("DELETE", `/containers/${env.OLD_MANAGER_ID}?force=1`);
	console.log(`Handover to v${env.TARGET_VERSION} completed successfully.`);
} catch (error) {
	await rollback(error);
	process.exitCode = 1;
}
