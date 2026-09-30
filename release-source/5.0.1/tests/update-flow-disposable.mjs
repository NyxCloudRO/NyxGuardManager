// Run only inside a disposable Docker-in-Docker fixture. The 5.0.1 updater
// sidecar drives the old 5.0.0 Manager through download and accepted handover.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import http from "node:http";
import updateManager from "/app/internal/update-manager.js";

assert.equal(process.env.NYX_TASK1_DISPOSABLE, "1");
assert.equal(process.env.NYX_UPDATE_MANAGER_CONTAINER, "nyxguard-manager");
assert.equal(process.env.NPM_BUILD_VERSION, "5.0.0");
const mode = process.argv[2];
assert.ok(["download", "activate"].includes(mode));
const stateFile = "/data/update-manager/state.json";
const docker = (endpoint) => new Promise((resolve, reject) => {
  const req = http.get({ socketPath: "/var/run/docker.sock", path: `/v1.41${endpoint}` }, (res) => {
    let raw = "";
    res.on("data", (chunk) => raw += chunk);
    res.on("end", () => res.statusCode >= 400 ? reject(new Error(`Docker ${res.statusCode}`)) : resolve(JSON.parse(raw)));
  });
  req.on("error", reject);
});
const state = async () => JSON.parse(await fs.readFile(stateFile, "utf8"));
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const old = await docker("/containers/nyxguard-manager/json");
assert.equal(old.Config.Image, "nyxmael/nyxguardmanager:5.0.0");
assert.equal(old.State.Health.Status, "healthy");

if (mode === "download") {
  const check = await updateManager.checkForUpdates(true);
  assert.equal(check.latestVersion, "5.0.1-dev");
  assert.ok(["update_available", "downloaded", "failed"].includes(check.stage));
  const started = await updateManager.startDownloadJob({ user: { email: "fixture" },
    targetVersion: "5.0.1-dev", proceedWithoutManualBackup: true });
  let job;
  if (check.stage === "downloaded") assert.equal(started.alreadyDownloaded, true);
  else {
    for (let i = 0; i < 120; i++) {
      job = await updateManager.getJob(started.jobId);
      if (job.status !== "running") break;
      await pause(500);
    }
    assert.equal(job.status, "success", JSON.stringify(job.result));
  }
  const after = await state();
  assert.equal(after.stage, "downloaded");
  assert.equal(after.currentVersion, "5.0.0");
  assert.equal(after.downloadedVersion, "5.0.1-dev");
  assert.equal(after.restartPending, false);
  assert.equal(after.pendingVersion, null);
  assert.ok(after.downloadedImageId?.startsWith("sha256:"));
  const status = await updateManager.getStatusForUser({ id: 1, roles: ["admin"] });
  assert.equal(status.current, "5.0.0");
  assert.equal(status.stage, "downloaded");
  assert.equal(status.downloadedVersion, "5.0.1-dev");
  assert.equal(status.restartPending, false);
  assert.equal((await docker("/containers/nyxguard-manager/json")).Id, old.Id);
  console.log("PASS download-only: 5.0.0 still healthy, 5.0.1-dev pinned, no restart claim");
} else {
	const before = await state();
	assert.equal(before.stage, "downloaded");
  const started = await updateManager.applyPendingUpdate({ user: { email: "fixture" } });
  let outcome;
  for (let i = 0; i < 300; i++) {
    outcome = await state();
    if (outcome.stage === "success" || outcome.stage === "failed" || outcome.stage === "recovery_required") break;
    const job = await updateManager.getJob(started.jobId);
    if (job.status === "failed") throw new Error(JSON.stringify(job.result));
    await pause(1000);
  }
  assert.equal(outcome.stage, "success", JSON.stringify(outcome.lastApplyFailure || {}));
  assert.equal(outcome.currentVersion, "5.0.1-dev");
  assert.equal(outcome.pendingVersion, null);
  assert.equal(outcome.restartPending, false);
  assert.equal(outcome.downloadedVersion, null);
  const current = await docker("/containers/nyxguard-manager/json");
  assert.equal(current.State.Health.Status, "healthy");
	assert.equal(current.Image, before.downloadedImageId, "target image identity");
  console.log("PASS activation: accepted handover committed 5.0.1-dev healthy");
}
process.exit(0);
