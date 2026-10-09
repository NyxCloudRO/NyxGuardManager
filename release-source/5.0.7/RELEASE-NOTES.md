# NyxGuard Manager 5.0.7

Fixes the backup verification monitor and official VPN activation workflow. A transient five-second SQL monitoring deadline no longer terminates a progressing staged import. Monitoring uses a separate connection and avoids opening importer tables; idle and total limits remain enforced. Only a complete row/schema fingerprint match accepts the recovery backup.

Current-version VPN repair reuses the existing Compose Agent, verifies TUN interface creation, and updates systemd startup without restarting Manager or DB. Root users do not need sudo. Debian/Ubuntu require systemd and Compose v2.

Manager 5.0.7 remains on schema 45 and pairs with VPN Agent 5.0.1. Supported guarded sources: 5.0.0–5.0.6. Published 5.0.6 artifacts remain unchanged.

See the [upgrade and recovery guide](../../docs/upgrade-5.0.7.md) and [validation coverage](../../docs/validation-5.0.7.md).

Known limitation: a retained completed 5.0.6-target ledger may be rejected before a new transaction is initialized. Stop and retain evidence pending a reviewed correction; do not bypass ledger validation.
