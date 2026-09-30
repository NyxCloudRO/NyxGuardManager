// Guarded 5.0.0 -> 5.0.1-dev bootstrap. Run only from a temporary sidecar
// on the verified DEV host; the old 5.0.0 image cannot run this new updater.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import http from "node:http";
import updateManager from "/app/internal/update-manager.js";

assert.equal(process.env.NYX_TASK1_DEV_BOOTSTRAP, "1");
assert.equal(process.env.NYX_UPDATE_MANAGER_CONTAINER, "nyxguard-manager");
assert.equal(process.env.NYX_UPDATE_DEV_TARGET, "5.0.1-dev");
assert.equal(process.env.NYX_UPDATE_DEV_IMAGE, "nyxguardmanager:5.0.1-dev");
const oldVersion = process.env.NYX_EXPECT_OLD_VERSION || "5.0.0";
assert.ok(["5.0.0", "5.0.1-dev"].includes(oldVersion));
assert.equal(process.env.NPM_BUILD_VERSION, oldVersion);
if (oldVersion === "5.0.1-dev") assert.equal(process.env.NYX_TASK1_DEV_REBUILD, "1");
const mode = process.argv[2];
assert.ok(["download", "activate"].includes(mode));
const request = (endpoint) => new Promise((resolve, reject) => {
  const req = http.get({ socketPath: "/var/run/docker.sock", path: `/v1.41${endpoint}` }, (res) => {
    let raw = "";
    res.on("data", (chunk) => raw += chunk);
    res.on("end", () => res.statusCode >= 400
      ? reject(new Error(`Docker inspect failed: ${res.statusCode}`)) : resolve(JSON.parse(raw)));
  });
  req.on("error", reject);
});
const stateFile = "/data/update-manager/state.json";
const stateOwner = await fs.stat(stateFile);
assert.equal(process.getuid(), stateOwner.uid,
  "DEV bootstrap must run as the Manager state owner");
assert.equal(process.getgid(), stateOwner.gid,
  "DEV bootstrap must run with the Manager state group");
const state = async () => JSON.parse(await fs.readFile(stateFile, "utf8"));
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const old = await request("/containers/nyxguard-manager/json");
const vpn = await request("/containers/nyxguard-vpn-agent/json");
assert.equal(old.Id, process.env.NYX_EXPECT_OLD_MANAGER_ID);
assert.equal(old.Image, process.env.NYX_EXPECT_OLD_IMAGE_ID);
assert.equal(old.State.Health?.Status, "healthy");
assert.equal(vpn.Id, process.env.NYX_EXPECT_OLD_VPN_ID);
assert.equal(vpn.State.Health?.Status, "healthy");
assert.equal(vpn.HostConfig.NetworkMode, `container:${old.Id}`);

if (mode === "download") {
  const available = await updateManager.checkForUpdates(true);
  assert.equal(available.latestVersion, "5.0.1-dev");
  const started = await updateManager.startDownloadJob({ user: { email: "DEV bootstrap" },
    targetVersion: "5.0.1-dev", proceedWithoutManualBackup: true });
  if (!started.alreadyDownloaded) {
    let job;
    for (let i = 0; i < 180; i++) {
      job = await updateManager.getJob(started.jobId);
      if (job.status !== "running") break;
      await pause(500);
    }
    assert.equal(job.status, "success", JSON.stringify(job.result));
  }
  const downloaded = await state();
  assert.equal(downloaded.stage, "downloaded");
  assert.equal(downloaded.currentVersion, oldVersion);
  assert.equal(downloaded.downloadedVersion, "5.0.1-dev");
  assert.equal(downloaded.restartPending, false);
  assert.equal(downloaded.pendingVersion, null);
  assert.ok(downloaded.downloadedImageId?.startsWith("sha256:"));
  assert.equal((await request("/containers/nyxguard-manager/json")).Id, old.Id);
  assert.equal((await request("/containers/nyxguard-vpn-agent/json")).Id, vpn.Id);
  console.log(`DEV download PASS: ${oldVersion} and VPN unchanged; target pinned without restart claim`);
} else {
  const before = await state();
  assert.equal(before.stage, "downloaded");
  assert.equal(before.downloadedVersion, "5.0.1-dev");
  const started = await updateManager.applyPendingUpdate({ user: { email: "DEV bootstrap" } });
  let outcome;
  for (let i = 0; i < 300; i++) {
    outcome = await state();
    if (["success", "failed", "recovery_required"].includes(outcome.stage)) break;
    const job = await updateManager.getJob(started.jobId);
    if (job.status === "failed") throw new Error(JSON.stringify(job.result));
    await pause(1000);
  }
  assert.equal(outcome.stage, "success", JSON.stringify(outcome.lastApplyFailure || {}));
  assert.equal(outcome.currentVersion, "5.0.1-dev");
  assert.equal(outcome.pendingVersion, null);
  assert.equal(outcome.restartPending, false);
  assert.equal(outcome.downloadedVersion, null);
  const manager = await request("/containers/nyxguard-manager/json");
  const agent = await request("/containers/nyxguard-vpn-agent/json");
  assert.equal(manager.Image, before.downloadedImageId);
  assert.equal(manager.State.Health?.Status, "healthy");
  assert.equal(agent.State.Health?.Status, "healthy");
  assert.equal(agent.HostConfig.NetworkMode, `container:${manager.Id}`);
  console.log("DEV activation PASS: accepted same-major handover committed 5.0.1-dev");
}
process.exit(0);
