# Release source map

## Development checkout

On this DEV machine, `/home/ubuntu/NyxGuardManager/upstream` is the only
authorized NyxGuard Manager development worktree. Reconcile that checkout if
it is dirty, behind, divergent, or broken; do not use another clone as a
workaround. Keep disposable test fixtures disposable and remove temporary
acceptance artifacts after use. `release-source/` is intentional versioned
source and must remain. DEV tasks never imply changes to the separate PROD
installation.

The 5.0.1 frontend source includes an asserted patch for two form controls
and certificate list ordering inherited from older React work. Apply and test
that patch against the validated compiled base when constructing a future
5.0.1 image; it has not been deployed by this repository cleanup.

The published Manager and VPN images are the customer runtime. `install.sh`
pulls those images; `update.sh` downloads the SHA-256-pinned
`upgrade/cli-bootstrap.mjs`, selects a release route, and uses the handover
worker already inside the 5.0.0 Manager image. Neither customer script reads
this directory from GitHub at runtime.

| Source | Build input | Image/runtime result |
| --- | --- | --- |
| `4.0.18/{custom-location-port,threat-activity-pagination,developer-message}` | `docker/4.0.18/Dockerfile` | Historical 4.0.18 Manager used as the supported handover starting point. Feature tests and fixtures remain beside their source. |
| `5.0.0/licensing`, `5.0.0/routes`, `5.0.0/migrations` | `5.0.0/Dockerfile` | Entitlement verification, Support routes, and migration 42 inside the Manager image. |
| `5.0.0/professional-support` | `5.0.0/Dockerfile` | Diagnostics, redaction, support bundle, and compiled frontend overlay inside the Manager image. These files are authoritative source, including the build patch. |
| `5.0.0/update-manager` | `5.0.0/Dockerfile` | In-app updater, major handover, and recovery workers inside the Manager image. |
| `5.0.0/tests` and `5.0.0/professional-support/*.test.mjs` | Automated verification | Source and build behavior tests; not customer runtime files. |

The 5.0.0 Dockerfile layers on the validated local
`nyxguardmanager:4.0.18-clean-rc` image (`sha256:c45403bf3ed25c31b59c49e32e09ac55ddcf7bb1f7311705562ca1b32712e75a`).
That exact base image is an external build prerequisite and differs in image
identity from the published 4.0.18 tag. A clean checkout contains every
tracked build input, but it cannot reproduce the historical 5.0.0 image from
source alone without that validated base. `5.0.0/build-dev.sh` checks its
identity before building. Do not silently replace the base or repoint the
immutable `v5.0.0` tag or published images.

The 5.0.0 frontend is an overlay on validated compiled assets. Its patch
assertions are part of the release build and must remain until a future
release supplies a complete native frontend source and its own validated
build path. New product work belongs in a separately versioned source area;
the 5.0.0 source and tests remain available for maintenance and recovery.
