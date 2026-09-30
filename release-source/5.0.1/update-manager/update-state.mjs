// Durable state for the 5.0.1 update flow. Legacy pendingVersion and
// restartPending are read for migration only; an image pull is never a restart.
export const STAGES = Object.freeze({
  IDLE: "idle", CHECKING: "checking", UPDATE_AVAILABLE: "update_available",
  DOWNLOADING: "downloading", DOWNLOADED: "downloaded",
  ACTIVATING: "activating", RESTART_PENDING: "restart_pending",
  SUCCESS: "success", FAILED: "failed", RECOVERY_REQUIRED: "recovery_required",
});

export function normalizeState(state, currentVersion) {
  const next = { ...state, currentVersion };
  if (!Object.values(STAGES).includes(next.stage)) {
    next.stage = next.pendingVersion && next.restartPending
      ? STAGES.UPDATE_AVAILABLE : next.updateAvailable ? STAGES.UPDATE_AVAILABLE : STAGES.IDLE;
  }
  if (next.stage === STAGES.DOWNLOADED && !next.downloadedImageId) {
    next.stage = STAGES.UPDATE_AVAILABLE;
    next.downloadedVersion = null;
  }
  next.pendingVersion = null;
  next.restartPending = next.stage === STAGES.RESTART_PENDING;
  return next;
}

export function markDownloaded(state, version, imageId) {
  if (!imageId) throw new Error("Downloaded image identity is required");
  return { ...state, stage: STAGES.DOWNLOADED, downloadedVersion: version,
    downloadedImageId: imageId, activation: null, pendingVersion: null,
    restartPending: false, lastApplyFailure: null, manualRecoveryRequired: false };
}

export function markActivating(state, activation) {
  if (state.stage !== STAGES.DOWNLOADED || state.downloadedVersion !== activation.targetVersion)
    throw new Error("Target must be downloaded before activation");
  return { ...state, stage: STAGES.ACTIVATING, activation,
    pendingVersion: null, restartPending: false };
}

export function markFailure(state, error, recoveryRequired = false) {
  return { ...state, stage: recoveryRequired ? STAGES.RECOVERY_REQUIRED : STAGES.FAILED,
    activation: null, pendingVersion: null, restartPending: false,
    manualRecoveryRequired: recoveryRequired,
    lastApplyFailure: { at: new Date().toISOString(), error: String(error) } };
}

export function classifyInterruption({ helperRunning, helperExitCode, phase,
  oldHealthy, newHealthy, newStarted }) {
  if (helperRunning) return "wait";
  if (!newStarted && !["replacement_starting", "replacement_healthy"].includes(phase)
    && oldHealthy && Number.isInteger(helperExitCode) && helperExitCode !== 0) return "failed";
  // A healthy replacement is insufficient proof that the recovery helper
  // committed success or safely discarded the old runtime and backup.
  void newHealthy;
  return "recovery_required";
}
