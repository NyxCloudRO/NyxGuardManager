# Update Manager 4.0.18 → 5.0.0 disposable acceptance

Status: **PASS**, 2026-09-27, disposable Proxmox LXC 109.

The tested path was the 4.0.18 application's own `startDownloadJob` and
`applyPendingUpdate` path, with the 5.0.0 target image supplying the versioned
handover helper. Candidate images were served through an isolated local Docker
registry mirror; the public 5.0.0 tag was not used for the test.

## Measured cause and fix

The LXC Docker socket was root:GID 991, mode 0660. The 4.0.18 backend ran as
UID/GID 1000:1000 with no supplemental group; its `_ping` failed with
`EACCES`. The same request as 1000:991 returned HTTP 200. The disposable
Compose runtime supplied the socket's numeric GID to the application with
`group_add`, and the updater then pulled images successfully. The handover
preserves that group and writes it into the replacement Compose definition.
Do not change the socket to mode 0666. Docker API access is effectively host
privilege; Update Manager routes require administrator authorization.

## Recovery contract

The target-image helper stops the old Manager and VPN agent before taking the
recovery point. A separate `nyxguard_update_recovery` volume holds a MariaDB
SQL dump, archives of all five named volumes, Compose and environment files,
the exact old image tar, the protected vault key and a SHA-256 manifest.
Preparation rejects an unexpected pre-upgrade migration count or invalid vault
key. The DB archive is supplementary; the SQL dump is authoritative for a
post-migration rollback. The helper creates or validates the persistent
32-byte vault key, records its previous existence, and mounts it read-only in
the new Manager. It changes both Compose image references before starting the
new Manager, then starts VPN only after Manager health and migration 42 are
verified. VPN health and the current Manager namespace are checked before
success is recorded.

On failure before new Manager startup, the old runtime resumes at migration
41. On failure after startup, the helper verifies the recovery manifest,
restores the SQL database and non-DB volumes and Compose, and only then starts
the old 4.0.18 Manager and VPN. If full recovery cannot be verified, it leaves
the old runtime stopped and marks manual recovery required. Data written after
the recovery point would be lost if a later operator rollback used that set.
The in-app configuration export is not a database recovery asset.

## Disposable observations

- A restricted external five-volume baseline and exact images were saved and
  checked. Its SQL dump was imported into an isolated MariaDB and showed
  migration 41 and the expected user count.
- An image-pull failure before migration left 4.0.18, MariaDB and VPN healthy
  at migration 41.
- An invalid existing vault key was rejected before new Manager startup; the
  old runtime resumed at migration 41. The original key was restored.
- A test image whose health check failed after migration 42 triggered full
  automatic SQL and non-DB-volume restore. The old Manager and VPN were healthy
  again at migration 41. The state recorded `post_migration` and
  `full_db_and_volume_restore` with no manual recovery required. This was
  repeated against the final candidate helper.
- After a clean baseline restore, the automatic 4.0.18 → 5.0.0 handover was
  repeated successfully. The final Manager and VPN were healthy with zero
  restarts, MariaDB at migration 42, valid Compose, a 32-byte mode-0600 vault
  key, and VPN attached to the new Manager namespace. Four non-DB volume
  marker hashes and the user-table fingerprint matched the baseline.
- The 5.0.0 Update Manager checked for updates without Docker `EACCES`.
  Manager and VPN Compose recreation preserved the installation ID and vault
  key fingerprints, health and migration 42.

The tested backup LXC had one user and no configured proxy hosts or
certificates, so production customer configuration requires its own preflight
and post-upgrade comparison. The temporary local mirror is test infrastructure,
not a customer requirement. The host-side `update.sh` still rejects a major
upgrade; use the validated in-app handover or an operator runbook with the full
recovery set.

## Source regression checks

The final source passed 51 Node tests, including Docker socket group access,
host and installer major-version guards, and six Docker-API handover simulations
for ordering, success, backup failure, post-start health failure, failed
restore, ambiguous backup inspection, and old VPN restart failure. The paired
VPN agent passed four tests. Shell syntax, Compose validation, and the shared
licensing-platform Go suites passed. The LXC fault-injection results above are
the integration evidence for actual MariaDB and volume restoration; the mock
tests exercise orchestration decisions without replacing those live checks.
