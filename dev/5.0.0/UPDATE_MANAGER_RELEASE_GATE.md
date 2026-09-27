# Update Manager 5.0.0 release gate

Status: **BLOCKED**. Do not publish or roll out 5.0.0 based on the current updater work.

## Findings

- The failing in-app pull uses the Docker Unix socket from the backend process. The backend runs as UID 1000 with the configured PGID; the socket is normally mode 0660. `connect EACCES` means the effective process credentials or socket ACL did not grant access. The exact GID and process credentials on the backup VM have not been captured, so the particular mismatch there remains to be confirmed. The host-side `update.sh` runs as root and therefore does not exercise this permission path.
- The Docker socket grants broad host control even when mounted `:ro`; the suffix makes the socket mount read-only in the filesystem, but does not restrict Docker API methods. Long-term, the web process should call a narrowly authorized host-side update service instead of holding the host Docker socket. Do not use mode 0666 as a workaround.
- The in-app backup is a JSON export of application tables. It excludes the migration table and does not contain MariaDB physical state, named volumes, certificates, VPN state, or the vault key. It is not a full rollback artifact.
- The 4.0.18 in-app updater executes from the 4.0.18 container during a 4.0.18 to 5.0.0 update. A fix packaged only in the 5.0.0 image cannot protect that first handover. A validated bridge updater or host-side major-version procedure is required.
- The current handover's Docker API creates containers independently of the Compose files. A subsequent Compose operation can reconcile them back to the old image. The replacement also needs all persistent mounts and the Docker group. The VPN agent must attach to the replacement Manager namespace.
- After migration 42, automatic image-only rollback to 4.0.18 is unsafe. Recovery requires the matching pre-upgrade MariaDB and volume set, Compose files, and exact rollback image.

## Source changes prepared

The 5.0.0 image overlay reports Docker socket access failures with UID/GID details, preserves `GroupAdd` and health checks during a same-major handover, treats Docker pull stream errors as failures, and rejects a major-version in-app handover without a full recovery set. The copy of the historical updater comes from the accepted 4.0.18 base image; the frontend remains the documented assertion-protected overlay.

These are source safeguards, **not** Update Manager acceptance. The current design still lacks a narrowly authorized host updater, Compose synchronization, and a validated database-aware rollback. The source must not be tagged or published until those issues are resolved and tested.

## Required disposable acceptance

1. Record the backup VM's socket owner/mode/GID, backend UID/GID/groups, mount, and Compose environment. Reproduce the failure, then prove access under corrected runtime credentials without changing host socket mode.
2. Verify automatic backup and an independently restorable MariaDB plus all-volume recovery set. Prepare the persistent vault key before 5.0.0 startup.
3. Exercise 4.0.x to a supported target and the actual 4.0.18 to 5.0.0 candidate route. Inspect every replacement mount, namespace, Docker group, health check, Compose image reference, and systemd startup definition.
4. Confirm migration 42 runs once; users, proxies, certificates, access lists, security settings, VPN data, authentication, and vault survive. Verify UI, DB, app, VPN, and restart counts.
5. Inject a pre-migration failure and verify automatic restoration. Inject a post-migration failure and verify that 4.0.18 is started only after the pre-upgrade database and volumes are restored. Record exact rollback artifacts and hashes.
