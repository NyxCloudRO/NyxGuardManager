# NyxGuard Manager 5.0.10 — Reliable persistent-volume upgrades

Installation provisions persistent storage once. Normal upgrades replace Manager application code through Compose, reuse the existing MariaDB container and named volumes, run required migrations, and verify health and durable data. Recovery restores data only after a failure or an explicit administrator request.

The root and sudo update commands are documented in the [README](../../README.md#updates-and-recovery). No recovery identifiers, container renaming, parallel databases or privileged in-app upgrade helpers are required for an ordinary healthy installation. The updater retains a verified pre-migration cold backup and handles interruption through the same saved host implementation. Systemd stops services without removing their containers, preserving identities across reboot.

Manager remains on schema 45 and uses the compatible VPN Agent 5.0.1. The Manager image is rebuilt with a sanitized filesystem and fresh layer history. Historical release tags and image digests remain unchanged; historical image security remediation is separate.

See [live-host qualification](../../docs/validation-5.0.10.md) and [architecture/limitations](../../docs/application-lifecycle.md).
