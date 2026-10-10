# Release source map

Current Manager release: **5.0.10**, compatible VPN Agent **5.0.1**, schema **45**. The [5.0.10 build](5.0.10/README.md) sanitizes the pinned public filesystem and creates fresh layers without inherited runtime credentials. The host updater is self-contained; normal upgrades use existing MariaDB and storage. Versioned directories below retain historical build, compatibility and regression inputs.

`release-source/` contains the versioned build inputs, asserted compiled
frontend patches, and tests for supported releases. Disposable test output
belongs outside the repository.

The 5.0.1 frontend source includes asserted patches for inherited form controls,
certificate list ordering, version display, and responsive layout. Its release
build uses the validated compiled base and checks the resulting image.

The published Manager and VPN images are the customer runtime. `install.sh` selects the latest stable GitHub release and pulls the official Docker images. Current `update.sh` embeds its host implementation; it does not fetch this source directory, bootstrap modules or container handover workers. See [application lifecycle](../docs/application-lifecycle.md).

## Historical build and recovery inputs through 5.0.9

The former major transition used `upgrade/cli-bootstrap.mjs`; former same-major releases used `upgrade/same-major-bootstrap.mjs` and packaged handover workers. These remain release-specific historical inputs, not the normal 5.0.10 workflow.

| Source | Build input | Image/runtime result |
| --- | --- | --- |
| `4.0.18/{custom-location-port,threat-activity-pagination,developer-message}` | `docker/4.0.18/Dockerfile` | Historical 4.0.18 Manager used as the supported handover starting point. Feature tests and fixtures remain beside their source. |
| `5.0.0/licensing`, `5.0.0/routes`, `5.0.0/migrations` | `5.0.0/Dockerfile` | Entitlement verification, Support routes, and migration 42 inside the Manager image. |
| `5.0.0/professional-support` | `5.0.0/Dockerfile` | Diagnostics, redaction, support bundle, and compiled frontend overlay inside the Manager image. These files are authoritative source, including the build patch. |
| `5.0.0/update-manager` | `5.0.0/Dockerfile` | In-app updater, major handover, and recovery workers inside the Manager image. |
| `5.0.0/tests` and `5.0.0/professional-support/*.test.mjs` | Automated verification | Source and build behavior tests; not customer runtime files. |
| `5.0.1` | `5.0.1/Dockerfile` via `5.0.1/build-release.sh` | Guarded 5.0.1 Manager image with same-major update recovery, diagnostics, support, VPN UI, and layout fixes. The matching VPN Agent tag reuses the unchanged 5.0.0 Agent image. |
| `5.0.2` | `5.0.2/Dockerfile` via `5.0.2/build-release.sh` | Audit integrity, legacy threat-history recovery, security-state lifecycle, responsive presentation, and traffic-selection performance. Requires the validated public 5.0.1 image. |

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

The `5.0.3` overlay builds with `5.0.3/build-release.sh` on the validated public
5.0.2 image: audit intelligence, complete-window historical retrieval, shared
application shell, and guarded update compatibility. VPN Agent remains 5.0.1.

The `5.0.4` corrective runtime keeps schema 45 and VPN Agent 5.0.1. Its
`product/` overlay contains the shared AppPage integration and effective
expiration state for IP rules. The product build layers on the corrective runtime built from the immutable
public base pinned in `5.0.4/Dockerfile`. Build both stages from the repository
root, using the same full source revision:

```bash
revision=$(git rev-parse HEAD)
docker build --build-arg NYXGUARD_SOURCE_REVISION="$revision" \
  -f release-source/5.0.4/Dockerfile -t nyxguardmanager:5.0.4-corrective-base .
docker build --build-arg NYXGUARD_SOURCE_REVISION="$revision" \
  -f release-source/5.0.4/product/Dockerfile -t nyxguardmanager:5.0.4 .
```

The intermediate image is a local build prerequisite, not an end-user registry tag. Browser sessions and acceptance output stay
outside this tree. See [5.0.4 release notes](5.0.4/RELEASE-NOTES.md).

Manager 5.0.10 uses the self-contained host updater and sanitized release build described in [application lifecycle](../docs/application-lifecycle.md). Historical handover sources remain for historical recovery only.
