# Public host updater

Current Manager release: **5.0.9**, compatible VPN Agent **5.0.1**, schema **45**. Guarded sources are 5.0.0–5.0.7. Current updates use the checksum-pinned same-major bootstrap and durable backup/restore, historical-ledger and application-data gates. VPN-only repair uses its separate current-version path. See the [current upgrade guide](../docs/upgrade-5.0.9.md).

## Historical adapter and runtime provenance

Manager and VPN Agent versions are separate release contracts. `update.sh`
explicitly maps Manager 5.0.2 to VPN Agent 5.0.1; an unknown Manager version
is refused until its Agent compatibility is defined. No Agent 5.0.2 image
is required or published.

The host 5.0.1 → 5.0.2 path runs the checksum-pinned
`same-major-bootstrap.mjs` in the published target Manager image. It identifies
the installed Compose services, preserves Manager-only installations, and pins
replacement containers to the pulled image IDs. An installed Agent must match
the published compatible 5.0.1 image.

The adapter invokes the existing `/app/internal/update-handover.js` engine.
That engine quiesces services, backs up SQL, application/certificate volumes,
VPN/auth volumes when installed, and the local licensing vault key before
starting the replacement. Health gates commit the update; startup failure
restores persistent state and verifies the old runtime. Recovery failures
remain available for operator review. The host updates Compose and `.version`
only after a successful handover, and retains the previous image for recovery.

The published Manager image, migration 43 and v5.0.2 release tag are unchanged.

The public updater determines the installed Manager version from one healthy
Compose Manager container associated with the installation's resolved project
and configuration path. It inspects that container's immutable image ID and
reconciles image version metadata with the application package and runtime build
version. Conflicting versions, ambiguous containers, or unresolved handover and
recovery state stop discovery before any upgrade work.

Built-in updates replace the runtime through Docker's API and may leave the host
Compose image tag and `.version` unchanged. These fields describe configuration,
not the running version. A verified current runtime returns an already-current
result without pulling images, creating a lock, rewriting configuration,
preparing VPN/TUN, running migrations, or recreating services. Explicit
`NYXGUARD_REPAIR_VPN=1` retains the existing opt-in repair behavior.

Runtime reconciliation regression tests require Bash, jq and Python 3:

```sh
python3 release-source/5.0.1/tests/public-updater-runtime.test.py
```
