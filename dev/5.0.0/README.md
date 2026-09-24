# NyxGuard Manager 5.0.0 development candidate

This is an application-side development build over the validated running 4.0.18
image identity `sha256:c45403bf3ed25c31b59c49e32e09ac55ddcf7bb1f7311705562ca1b32712e75a`.
The matching 4.0.18 React source is unavailable. The 5.0.0 UI therefore uses
the established, assertion-protected frontend overlay; it is not a complete
React-source build. `build-dev.sh` refuses a changed local base image and builds
only the local `nyxguardmanager:5.0.0-dev` tag. No image is pushed.

## Application integration map

| NyxGuard component | NyxCloud contract | Local state and gate | Failure behavior |
| --- | --- | --- | --- |
| Claim/activation | `/api/v1/nyxguard/claims/exchange`, `/activations` | One installation UUID; encrypted proof and refresh credential | No grant until signed NyxGuard envelope verifies |
| Refresh | `/api/v1/nyxguard/entitlements/refresh` | Encrypted envelope and monotonic revision floor; 12-hour refresh threshold | Explicit denial revokes; invalid response fails closed; outage uses only signed, unexpired grace |
| Recovery/replace/deactivate | NyxGuard recovery and activation routes | Rebound installation and cleared old grant | Error leaves feature unavailable or prior verified state as contract permits |
| Diagnostics and bundle | Verified `nyxguard_diagnostics_support` | Backend admin and entitlement gate on every route | Core proxy, WAF, certificates, and administration remain independent |
| Upload | `POST /v1/nyxguard/support-bundles` | Fresh refresh, encrypted pending exact bytes, SHA-256 and stable idempotency key | No upload during offline grace; retry same pending bytes; server chooses storage |

The trust root is the reviewed platform Ed25519 public key embedded in
`licensing/verify.mjs`. The verifier requires the exact product
`nyxguard-manager-professional-support`, capability
`nyxguard_diagnostics_support`, canonical signed payload, active status,
installation and activation binding, revision, validity interval, and signature.
Unknown products, capabilities, or keys fail closed. The private signing key
never enters this application. The browser receives only derived status.

`NYXCLOUD_AUTHORITY_URL` and `NYXCLOUD_SUPPORT_URL` must be approved fixed
HTTPS origins. HTTP is accepted only for loopback mock integration. The
`NYXCLOUD_LICENSE_VAULT_KEY_PATH` file must contain exactly 32 bytes, have no
group/other permission bits, and persist independently of the container. The
application reads it from a mounted file; it is not a build argument or image
layer. Without these settings the Support status is `NOT_CONFIGURED` and core
NyxGuard remains usable. Do not point a DEV build at unapproved live services.

## Diagnostics and support data

The backend loads proxy hosts and certificates by database ID after fresh
admin authorization. The 502 workflow accepts an existing proxy host ID only;
it never accepts a URL. DNS resolves once, the connection pins that address,
redirects are not followed, HTTP uses `HEAD /`, and timeout/header bounds are
2 seconds/4 KiB. Diagnostics represent unknown observations as `SKIPPED`.
System checks include backend, database, migration, OpenResty, resource, disk,
version, uptime, and configuration state. Route and TLS collectors avoid raw
credentials and private certificate material.

`nyxguard-support-bundle-v1` is one UTF-8 JSON object with a recent UTC time,
`nyxguard-support-record-v1`, version, installation UUID, and structured
system/routing/TLS/troubleshooting results. A schema allowlist selects numeric
evidence, then a central recursive redactor rejects unsafe data. Maximum size
is 1 MiB locally and 1,000,000 bytes for upload. It contains no logs, raw
configuration archives, keys, credentials, customer content, bucket, storage
endpoint, or object prefix. The Support ID is returned by the platform in the
`NYX-YYYYMMDD-<24 base32 characters>` form; the client does not generate it.
The future platform storage namespace is server-controlled `nyxguard/` in
`nyxguard-support`. No live S3 identity or storage is provisioned here.

## Upgrade and rollback

The single 5.0.0 migration adds `nyxcloud_license_state` and
`nyxcloud_support_upload`. It leaves every 4.0.18 table intact and has a
non-destructive down operation so rollback does not erase licensing or pending
upload state. It was run after all 41 prior migrations on an isolated MariaDB,
with seeded user, proxy host, certificate, and setting records; those records
survived, and a second migration run applied zero migrations.

Before replacing any DEV runtime, create and verify a fresh restorable backup
of all five named persistent volumes, the MariaDB database, Compose definition,
and the exact running image ID. Preserve the vault key file with access controls.
The current local `nyxmael/nyxguardmanager:4.0.18` tag differs from the running
image, so rollback must pin the saved running image ID, never the drifting tag.
The app and VPN share a network namespace; inspect the Compose plan and VPN
impact before replacement. Replace only the application workload when an
operator has a tested restore, then verify old customer records, login, proxy,
TLS, WAF, settings, OpenResty, MariaDB, and VPN health. The 4.0.18 application
cannot safely use the migration-42 database. A rollback to 4.0.18 requires
the verified pre-upgrade database backup as well as the exact rollback image
and previous Compose configuration. Do not run `compose down -v` or recreate
MariaDB storage during this DEV deployment.

## Verification and limits

The candidate tests cover cross-product denial, wrong capability/binding,
invalid signature, expiry, revoked status, stale revision, offline grace,
authority failure, encrypted state, exact-byte upload retry, SSRF target
validation, and seeded-secret redaction. Existing custom port, Threat Activity,
VPN agent, and Developer Message regressions are retained. The Developer
Message image test's sole 4.0.18 version assertion must be adapted to 5.0.0 in
an image-specific regression copy; its original file remains unchanged.

The lower navigation adds `License` and `Diagnostics & Support` after
Preferences. The latter renders Overview, Diagnostics, Troubleshooting, and
Support Bundle in the normal main content area. The existing lower
`Support NyxGuard` control remains a separate commercial action, and Community
retains its destination. The main sidebar remains unchanged. The exact React
source is unavailable, so the native content view is mounted by the bounded,
assertion-protected frontend overlay. The footer, Settings and backup labels
show 5.0.0; the backend package version controls backup export metadata and
the exact-version import gate. Live
Support API, Authority, S3, Cloudflare path, and production acceptance remain
separate controlled work.
