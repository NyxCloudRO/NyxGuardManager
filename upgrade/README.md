# Public host updater

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
