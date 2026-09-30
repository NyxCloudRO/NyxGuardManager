# 5.0.1 update state contract

`/data/update-manager/state.json` is durable. The running version comes from
the Manager image's `NPM_BUILD_VERSION`; a download never changes it. Image
identity is recorded as `downloadedImageId` and checked again at activation.
State writes use a temporary file and rename. The historical
`pendingVersion`/`restartPending` pair is accepted as a migration input, then
cleared. The same-major handover has no user-triggered restart step.

| Stage | Meaning and target | Downloaded | Activation started | Restart required | Retry and UI action | Recovery evidence |
| --- | --- | --- | --- | --- | --- | --- |
| `idle` | Running version current; no newer target | No | No | No | Check | None |
| `checking` | Registry check in progress | No | No | No | Wait | None |
| `update_available` | Newer verified target; running version unchanged | No | No | No | Download | None |
| `downloading` | Configuration export and image pull in progress | No | No | No | Wait | None |
| `downloaded` | Target image ID pinned; running version unchanged | Yes | No | No | Activate or repeat Download safely | None |
| `activating` | Handover helper identified; phase and container IDs durable | Yes | Yes | No | Wait; do not start another update | Recovery ID appears before quiescence |
| `restart_pending` | Reserved for a future operation that truly needs a separate restart | Depends on operation | Depends on operation | Yes | Restart only when explicitly implemented | Operation-specific |
| `success` | Replacement healthy and update committed; running version is target | Cleared | Complete | No | Check; acknowledge change log | `recoveryCleanupPending` identifies deferred cleanup if any |
| `failed` | Download failed, or handover rolled back to a healthy old runtime | Target may remain cached | No active handover | No | Download again when safe | Failure details, no automatic data mutation |
| `recovery_required` | Interrupted/failed handover cannot be proven safe automatically | Target may remain cached | Incomplete | No | Operator recovery; update disabled | `interruptedActivation` and retained recovery ID/material |

For both topologies, activation creates replacement containers but does not
start them. The accepted Task 1A helper quiesces the old runtime, creates the
MariaDB/volume/vault recovery point, starts and checks the replacement, then
commits success. The Manager-only path never inspects or creates a VPN Agent
or VPN state volume. With VPN, the existing Agent image and state volumes are
reused and the replacement Agent joins the new Manager namespace.

At startup, an active helper is allowed to finish. If a stopped helper has
failed before replacement startup and the old runtime is healthy, the state
becomes `failed`. Missing helper evidence, any possible replacement write, or
ambiguous runtime health becomes `recovery_required`. No automatic restore is
attempted from uncertain evidence, and retained recovery material is kept.
After a health commit, recovery cleanup is tracked separately so a hard stop
between commit and cleanup does not make a successful version look pending.

The optional `NYX_UPDATE_DEV_TARGET`/`NYX_UPDATE_DEV_IMAGE` pair is restricted
to a local `X.Y.Z-dev` image. A controlled updater sidecar can set
`NYX_UPDATE_MANAGER_CONTAINER=nyxguard-manager` to drive the existing 5.0.0
DEV Manager through this path. Published stable releases continue to use the
registry check and pull path.
An explicitly guarded DEV image rebuild may set `NYX_TASK1_DEV_REBUILD=1` to
replace a running image with another image ID carrying the same `X.Y.Z-dev`
version. The updater refuses this when the candidate ID already runs.
