// Host-initiated adapter for the recovery/handover engine shipped in 5.0.0.
// Runs in a short-lived 5.0.0 container; the handover helper outlives it.
import http from "node:http";

const api = (method, endpoint, body = null) => new Promise((resolve, reject) => {
	const request = http.request({ socketPath: "/var/run/docker.sock", path: `/v1.41${endpoint}`, method,
		headers: body ? { "Content-Type": "application/json" } : undefined }, (response) => {
		let raw = "";
		response.setEncoding("utf8");
		response.on("data", (part) => { raw += part; });
		response.on("end", () => {
			if ((response.statusCode || 500) >= 400) return reject(new Error(`Docker ${method} ${endpoint}: ${response.statusCode} ${raw.slice(0, 512)}`));
			try { resolve(raw ? JSON.parse(raw) : {}); } catch { resolve(raw); }
		});
	});
	request.on("error", reject);
	if (body) request.write(JSON.stringify(body));
	request.end();
});
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const q = encodeURIComponent;
const ignore = (work) => work.catch(() => undefined);
const image = "nyxmael/nyxguardmanager:5.0.0";
const vpnImage = "nyxmael/nyxguardmanager-vpn-agent:5.0.0";
let oldManager, oldVpn, newManagerId, newVpnId, renamed = false, helperStarted = false;

async function checkedContainer(name, expectedImage) {
	const container = await api("GET", `/containers/${q(name)}/json`);
	if (!container.State?.Running || container.Config?.Image !== expectedImage) {
		throw new Error(`Expected a running ${expectedImage} container named ${name}`);
	}
	return container;
}

async function setup() {
	if (process.env.CURRENT_VERSION !== "4.0.18" || process.env.TARGET_VERSION !== "5.0.0") {
		throw new Error("Unsupported CLI handover transition");
	}
	oldManager = await checkedContainer("nyxguard-manager", "nyxmael/nyxguardmanager:4.0.18");
	oldVpn = await checkedContainer("nyxguard-vpn-agent", "nyxmael/nyxguardmanager-vpn-agent:4.0.18");
	const names = (await api("GET", "/containers/json?all=1")).flatMap((item) => item.Names || []);
	if (names.some((name) => /^\/nyxguard-(update-handover|recovery-|manager-rollback-|vpn-agent-rollback-)/.test(name))) {
		throw new Error("An existing handover or rollback container needs review before retrying");
	}
	const data = (oldManager.Mounts || []).find((mount) => mount.Destination === "/data");
	if (!data || !["volume", "bind"].includes(data.Type)) throw new Error("Persistent Manager /data mount not found");
	const dataSource = data.Type === "volume" ? data.Name : data.Source;
	if (!dataSource) throw new Error("Invalid Manager /data mount");
	const token = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
	const oldManagerName = String(oldManager.Name).replace(/^\//, "");
	const oldVpnName = String(oldVpn.Name).replace(/^\//, "");
	const safeLabels = (labels = {}) => Object.fromEntries(Object.entries(labels).filter(([key]) =>
		!["org.opencontainers.image.version", "org.opencontainers.image.revision", "org.opencontainers.image.created"].includes(key)));
	const managerConfig = {
		Image: image,
		Env: (oldManager.Config.Env || []).filter((entry) => !/^NPM_BUILD_(VERSION|COMMIT|DATE)=/.test(entry)),
		Cmd: oldManager.Config.Cmd, Entrypoint: oldManager.Config.Entrypoint,
		WorkingDir: oldManager.Config.WorkingDir, ExposedPorts: oldManager.Config.ExposedPorts,
		Healthcheck: oldManager.Config.Healthcheck, Labels: safeLabels(oldManager.Config.Labels),
		HostConfig: {
			Binds: oldManager.HostConfig.Binds, PortBindings: oldManager.HostConfig.PortBindings,
			RestartPolicy: oldManager.HostConfig.RestartPolicy, NetworkMode: oldManager.HostConfig.NetworkMode,
			GroupAdd: oldManager.HostConfig.GroupAdd, ExtraHosts: oldManager.HostConfig.ExtraHosts,
			LogConfig: oldManager.HostConfig.LogConfig, CapAdd: oldManager.HostConfig.CapAdd,
			Devices: oldManager.HostConfig.Devices,
		},
	};
	const vpnConfig = {
		Image: vpnImage, Env: oldVpn.Config.Env, Cmd: oldVpn.Config.Cmd,
		Entrypoint: oldVpn.Config.Entrypoint, WorkingDir: oldVpn.Config.WorkingDir,
		ExposedPorts: oldVpn.Config.ExposedPorts, Healthcheck: oldVpn.Config.Healthcheck,
		Labels: safeLabels(oldVpn.Config.Labels),
		HostConfig: {
			Binds: oldVpn.HostConfig.Binds, RestartPolicy: oldVpn.HostConfig.RestartPolicy,
			NetworkMode: `container:${oldManager.Id}`, ExtraHosts: oldVpn.HostConfig.ExtraHosts,
			GroupAdd: oldVpn.HostConfig.GroupAdd, LogConfig: oldVpn.HostConfig.LogConfig,
			CapAdd: oldVpn.HostConfig.CapAdd, Devices: oldVpn.HostConfig.Devices,
		},
	};
	await api("POST", `/containers/${oldManager.Id}/rename?name=${q(`${oldManagerName}-rollback-${token}`)}`);
	renamed = true;
	await api("POST", `/containers/${oldVpn.Id}/rename?name=${q(`${oldVpnName}-rollback-${token}`)}`);
	newManagerId = (await api("POST", `/containers/create?name=${q(oldManagerName)}`, managerConfig)).Id;
	vpnConfig.HostConfig.NetworkMode = `container:${newManagerId}`;
	newVpnId = (await api("POST", `/containers/create?name=${q(oldVpnName)}`, vpnConfig)).Id;
	const helper = await api("POST", `/containers/create?name=${q(`nyxguard-update-handover-${token}`)}`, {
		Image: image, Entrypoint: ["node", "/app/internal/update-handover.js"], Cmd: [],
		Env: [
			`OLD_MANAGER_ID=${oldManager.Id}`, `OLD_MANAGER_NAME=${oldManagerName}`,
			`NEW_MANAGER_ID=${newManagerId}`, `OLD_VPN_ID=${oldVpn.Id}`,
			`OLD_VPN_NAME=${oldVpnName}`, `NEW_VPN_ID=${newVpnId}`,
			"CURRENT_VERSION=4.0.18", "TARGET_VERSION=5.0.0",
		],
		HostConfig: { Binds: ["/var/run/docker.sock:/var/run/docker.sock", `${dataSource}:/handover-data`], NetworkMode: "none" },
	});
	await api("POST", `/containers/${helper.Id}/start`);
	helperStarted = true;
	console.log("Verified handover helper started; waiting for recovery and health gates...");
	for (let attempt = 0; attempt < 1800; attempt++) {
		const state = await api("GET", `/containers/${helper.Id}/json`);
		if (!state.State.Running) {
			const logs = await new Promise((resolve, reject) => {
				const request = http.get({ socketPath: "/var/run/docker.sock", path: `/v1.41/containers/${helper.Id}/logs?stdout=1&stderr=1&tail=60` }, (response) => {
					const chunks = []; response.on("data", (chunk) => chunks.push(chunk));
					response.on("end", () => resolve(Buffer.concat(chunks).toString("utf8").replace(/[^\x09\x0A\x0D\x20-\x7E]/g, "")));
				}); request.on("error", reject);
			});
			console.log(logs);
			if (state.State.ExitCode !== 0) throw new Error(`Handover failed (helper exit ${state.State.ExitCode}); inspect persistent recovery state before retrying`);
			console.log("Upgrade complete. Now running: 5.0.0");
			return;
		}
		await sleep(1000);
	}
	throw new Error("Handover helper is still running; inspect it before retrying");
}

try { await setup(); }
catch (error) {
	if (!helperStarted) {
		if (newVpnId) await ignore(api("DELETE", `/containers/${newVpnId}?force=1`));
		if (newManagerId) await ignore(api("DELETE", `/containers/${newManagerId}?force=1`));
		if (renamed && oldManager) await ignore(api("POST", `/containers/${oldManager.Id}/rename?name=nyxguard-manager`));
		if (renamed && oldVpn) await ignore(api("POST", `/containers/${oldVpn.Id}/rename?name=nyxguard-vpn-agent`));
	}
	console.error(`ERROR: ${error instanceof Error ? error.message : String(error)}`);
	process.exitCode = 1;
}
