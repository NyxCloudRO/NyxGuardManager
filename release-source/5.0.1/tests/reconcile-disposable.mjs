import assert from "node:assert/strict";
import fs from "node:fs/promises";
import updateManager from "/app/internal/update-manager.js";

assert.equal(process.env.NYX_TASK1_DISPOSABLE, "1");
const file = "/data/update-manager/state.json";
const before = JSON.parse(await fs.readFile(file, "utf8"));
assert.equal(before.stage, "activating");
assert.equal(before.activation.phase, "replacement_starting");
await updateManager.reconcileStartup();
const after = JSON.parse(await fs.readFile(file, "utf8"));
assert.equal(after.stage, "recovery_required");
assert.equal(after.manualRecoveryRequired, true);
assert.equal(after.restartPending, false);
assert.equal(after.pendingVersion, null);
assert.equal(after.interruptedActivation.recoveryId, before.activation.recoveryId);
console.log("PASS hard interruption reconciled to recovery_required with retained evidence");
process.exit(0);
