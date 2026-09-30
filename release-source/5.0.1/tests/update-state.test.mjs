import assert from "node:assert/strict";
import test from "node:test";
import { STAGES, normalizeState, markDownloaded, markActivating,
  markFailure, classifyInterruption } from "../update-manager/update-state.mjs";

test("legacy pending flags require re-download to pin image identity", () => {
  const state = normalizeState({ currentVersion: "5.0.0", pendingVersion: "5.0.1",
    restartPending: true }, "5.0.0");
  assert.equal(state.stage, STAGES.UPDATE_AVAILABLE);
  assert.equal(state.downloadedVersion, undefined);
  assert.equal(state.pendingVersion, null);
  assert.equal(state.restartPending, false);
});

test("download alone retains running version and requires a pinned image", () => {
  const before = normalizeState({ updateAvailable: true }, "5.0.0");
  assert.throws(() => markDownloaded(before, "5.0.1-dev", null));
  const downloaded = markDownloaded(before, "5.0.1-dev", "sha256:target");
  assert.equal(downloaded.currentVersion, "5.0.0");
  assert.equal(downloaded.stage, STAGES.DOWNLOADED);
  assert.equal(downloaded.restartPending, false);
  assert.equal(downloaded.pendingVersion, null);
  assert.equal(normalizeState(downloaded, "5.0.0").stage, STAGES.DOWNLOADED);
  assert.throws(() => markActivating(before, { targetVersion: "5.0.1-dev" }));
  const activating = markActivating(downloaded, { targetVersion: "5.0.1-dev",
    imageId: "sha256:target", phase: "prepared" });
  assert.equal(activating.stage, STAGES.ACTIVATING);
  assert.equal(activating.restartPending, false);
});

test("failed activation and manual recovery are distinct durable states", () => {
  const downloaded = markDownloaded(normalizeState({}, "5.0.0"), "5.0.1-dev", "sha256:target");
  const failure = markFailure(downloaded, "health failed");
  assert.equal(failure.stage, STAGES.FAILED);
  assert.equal(failure.manualRecoveryRequired, false);
  assert.equal(failure.restartPending, false);
  const blocked = markFailure(downloaded, "restore failed", true);
  assert.equal(blocked.stage, STAGES.RECOVERY_REQUIRED);
  assert.equal(blocked.manualRecoveryRequired, true);
});

test("same-version DEV image rebuild stays downloaded until handover commits", () => {
  const before = normalizeState({ stage: STAGES.SUCCESS }, "5.0.1-dev");
  const downloaded = markDownloaded(before, "5.0.1-dev", "sha256:new-build");
  assert.equal(normalizeState(downloaded, "5.0.1-dev").stage, STAGES.DOWNLOADED);
  assert.equal(downloaded.restartPending, false);
});

test("hard interruption waits for helper and fails closed after replacement writes", () => {
  assert.equal(classifyInterruption({ helperRunning: true }), "wait");
  assert.equal(classifyInterruption({ helperRunning: false, helperExitCode: 1,
    phase: "prepared", oldHealthy: true, newStarted: false }), "failed");
  assert.equal(classifyInterruption({ helperRunning: false, helperExitCode: undefined,
    phase: "prepared", oldHealthy: true, newStarted: false }), "recovery_required");
  assert.equal(classifyInterruption({ helperRunning: false, helperExitCode: 137,
    phase: "replacement_starting", oldHealthy: false, newHealthy: true,
    newStarted: true }), "recovery_required");
});
