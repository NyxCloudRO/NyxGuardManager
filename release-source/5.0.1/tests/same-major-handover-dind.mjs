// Run inside a disposable Docker-in-Docker fixture. Stages a 5.0.0 -> test
// replacement, then invokes the actual same-major helper with a post-write fault.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import http from "node:http";

assert.equal(process.env.NYX_TASK1A_DISPOSABLE, "1");
const vpnEnabled = process.env.NYX_TASK1A_TOPOLOGY === "vpn";
assert.ok(vpnEnabled || process.env.NYX_TASK1A_TOPOLOGY === "manager-only");
const target = "nyxmael/nyxguardmanager:5.0.1-task1a-test";
const request = (method, endpoint, body) => new Promise((resolve, reject) => {
	const req = http.request({ socketPath: "/var/run/docker.sock", path: `/v1.41${endpoint}`, method,
		headers: body ? { "Content-Type": "application/json" } : undefined }, (res) => {
		let raw = "";
		res.setEncoding("utf8");
		res.on("data", (chunk) => raw += chunk);
		res.on("end", () => {
			if ((res.statusCode || 500) >= 400) return reject(new Error(`${method} ${endpoint}: ${res.statusCode}`));
			try { resolve(raw ? JSON.parse(raw) : {}); } catch { resolve(raw); }
		});
	});
	req.on("error", reject);
	if (body) req.write(JSON.stringify(body));
	req.end();
});
const inspect = (id) => request("GET", `/containers/${id}/json`);
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const oldManager = await inspect("nyxguard-manager");
assert.equal(oldManager.Config.Image, "nyxmael/nyxguardmanager:5.0.0");
assert.equal(oldManager.State.Health.Status, "healthy");
const oldVpn = vpnEnabled ? await inspect("nyxguard-vpn-agent") : null;
if (vpnEnabled) assert.equal(oldVpn.State.Health.Status, "healthy");
else await assert.rejects(inspect("nyxguard-vpn-agent"));
await request("POST", "/volumes/create", { Name: "nyxguard_task1a_evidence" });
await fs.rm("/evidence/modified", { force: true });
const rollbackManagerName = `nyxguard-manager-task1a-rollback-${Date.now()}`;
const rollbackVpnName = `nyxguard-vpn-agent-task1a-rollback-${Date.now()}`;
await request("POST", `/containers/${oldManager.Id}/rename?name=${rollbackManagerName}`);
if (vpnEnabled) await request("POST", `/containers/${oldVpn.Id}/rename?name=${rollbackVpnName}`);
const managerBody = {
	Image: target, Env: oldManager.Config.Env,
	Entrypoint: ["node", "/app/internal/task1a-post-mutation-fault.mjs"], Cmd: [],
	WorkingDir: "/app", Labels: oldManager.Config.Labels,
	Healthcheck: { Test: ["CMD", "false"], Interval: 1_000_000_000, Retries: 1 },
	HostConfig: {
		Binds: [...(oldManager.HostConfig.Binds || []), "nyxguard_task1a_evidence:/evidence:rw"],
		PortBindings: oldManager.HostConfig.PortBindings,
		RestartPolicy: { Name: "no" }, NetworkMode: oldManager.HostConfig.NetworkMode,
		GroupAdd: oldManager.HostConfig.GroupAdd, ExtraHosts: oldManager.HostConfig.ExtraHosts,
		CapAdd: oldManager.HostConfig.CapAdd, Devices: oldManager.HostConfig.Devices,
	},
};
const newManager = await request("POST", "/containers/create?name=nyxguard-manager", managerBody);
let newVpn;
if (vpnEnabled) {
	newVpn = await request("POST", "/containers/create?name=nyxguard-vpn-agent", {
		Image: oldVpn.Config.Image, Env: oldVpn.Config.Env,
		Cmd: oldVpn.Config.Cmd, Entrypoint: oldVpn.Config.Entrypoint,
		Healthcheck: oldVpn.Config.Healthcheck, Labels: oldVpn.Config.Labels,
		HostConfig: { Binds: oldVpn.HostConfig.Binds, NetworkMode: `container:${newManager.Id}`,
			RestartPolicy: { Name: "no" }, CapAdd: oldVpn.HostConfig.CapAdd, Devices: oldVpn.HostConfig.Devices },
	});
}
const helper = await request("POST", `/containers/create?name=nyxguard-task1a-helper-${Date.now()}`, {
	Image: target, Entrypoint: ["node", "/app/internal/update-handover.js"], Cmd: [],
	Env: ["CURRENT_VERSION=5.0.0", "TARGET_VERSION=5.0.1-task1a-test",
		`OLD_MANAGER_ID=${oldManager.Id}`, `NEW_MANAGER_ID=${newManager.Id}`,
		"OLD_MANAGER_NAME=nyxguard-manager",
		...(vpnEnabled ? [`OLD_VPN_ID=${oldVpn.Id}`, `NEW_VPN_ID=${newVpn.Id}`,
			"OLD_VPN_NAME=nyxguard-vpn-agent"] : [])],
	HostConfig: { Binds: ["/var/run/docker.sock:/var/run/docker.sock",
		"nyxguard_data:/handover-data:rw"], NetworkMode: "none" },
});
await request("POST", `/containers/${helper.Id}/start`);
let helperStatus;
for (let i = 0; i < 180; i++) {
	helperStatus = await inspect(helper.Id);
	if (!helperStatus.State.Running) break;
	await wait(1000);
}
assert.equal(helperStatus.State.Running, false, "helper must finish");
assert.equal(helperStatus.State.ExitCode, 1, "post-mutation health failure must fail handover");
for (let i = 0; i < 90; i++) {
	const current = await inspect(oldManager.Id);
	if (current.State.Health?.Status === "healthy") break;
	await wait(1000);
}
assert.equal((await inspect("nyxguard-manager")).Id, oldManager.Id);
assert.equal((await inspect(oldManager.Id)).State.Health?.Status, "healthy");
if (vpnEnabled) {
	assert.equal((await inspect("nyxguard-vpn-agent")).Id, oldVpn.Id);
	assert.equal((await inspect(oldVpn.Id)).State.Health?.Status, "healthy");
	assert.equal((await inspect(oldVpn.Id)).HostConfig.NetworkMode, `container:${oldManager.Id}`);
}
const state = JSON.parse(await fs.readFile("/handover-data/update-manager/state.json", "utf8"));
assert.equal(state.pendingVersion, null);
assert.equal(state.restartPending, false);
assert.equal(state.manualRecoveryRequired, false);
assert.equal(state.lastApplyFailure?.recoveryStatus, "sql_and_volume_restore");
assert.equal((await fs.readFile("/evidence/modified", "utf8")).trim(), "post-mutation failure reached");
console.log(`PASS ${process.env.NYX_TASK1A_TOPOLOGY} post-mutation helper rollback, old runtime healthy, state reconciled`);
