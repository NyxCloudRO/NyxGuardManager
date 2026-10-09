# Historical upgrade guidance: 4.0.18 to 5.0.0

This document describes the historical version boundary. Use the official guarded updater and review the destination release compatibility before changing an installation. Do not replace the Manager image manually to bypass backup verification.

Before upgrading, record the installed application version, image digest and migration level. Version 4.0.18 uses migration 41; 5.0.0 uses migration 42. Preserve an independent, verified recovery set containing the SQL dump, persistent volumes, Compose configuration, rollback image and licensing vault key. Stop writes for filesystem snapshots; a hot database volume archive does not replace a consistent SQL backup. Verify a restore before proceeding.

The vault key must remain protected and persistent, mounted read-only at `/run/nyxguard-licensing/vault.key`. Never regenerate an existing key. Follow [vault operations](VAULT_OPERATIONS.md) for backup and restore, and [license recovery](CUSTOMER_LICENSE_RECOVERY.md) for supported activation. Claims and installation identities belong to one installation and must not be reused.

Use the [official updater](https://github.com/NyxCloudRO/NyxGuardManager/blob/main/update.sh) for supported version transitions. A 5.0.0 installation can then follow the [5.0.7 upgrade and recovery guide](../../docs/upgrade-5.0.7.md). Keep the Manager and Agent versions paired according to the destination manifest.

Verify migrations, database/application health, existing hosts and certificates, licensing entitlement and VPN behavior. If an upgrade fails, retain evidence and follow its supported recovery workflow. Do not run a 4.0.18 application against migration 42, or treat healthy containers alone as proof of data preservation.
