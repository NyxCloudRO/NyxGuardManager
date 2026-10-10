# Advanced recovery

Ordinary updates use the [canonical root/sudo commands](../README.md#updates-and-recovery). Do not use recovery commands for a healthy ordinary upgrade.

## Restore a retained host backup

The 5.0.10 host updater retains verified cold backups under the installation's `.upgrade/backup-*` directories. Review the root-only `manifest.json` and `result.json` to select the correct pre-upgrade point. Restore uses the exact installation storage paths, previous application identities and matching database files; it does not create a parallel database or application stack.

As root, download the current updater, then select a backup from this installation:

```bash
curl -fsSL https://raw.githubusercontent.com/NyxCloudRO/NyxGuardManager/main/update.sh -o /tmp/nyxguard-update.sh
bash /tmp/nyxguard-update.sh --restore-backup /opt/nyxguardmanager/.upgrade/backup-<timestamp>
```

The restore asks for confirmation. Later writes will be lost. Never switch an old Manager image onto an incompatible newer schema. A checksum or restore verification failure preserves the pending record and returns an error; retain the backup for investigation. For a custom installation set `INSTALL_DIR` to its existing directory.

## Historical recovery through 5.0.9

The material below describes the previous recovery implementation and historical major transitions. It does not describe the normal 5.0.10 upgrade workflow.

# Advanced recovery and independent installations

5.0.9 uses one release compatibility policy, Compose service metadata, a verified restorable backup, bounded migration progress, application/data checks and a durable commit or verified rollback. Migration progress never counts as healthy application startup. Existing operational records and secrets remain protected; only reviewed traffic counter history permits normal retention and live increments. Expired security rules remain stored and inactive.

A healthy installation trapped by unavailable historical recovery artifacts can explicitly accept a **fresh verified current baseline**. This preserves the old ledger and raw state with historical rollback unverified; it does not certify the missing original recovery point.

```bash
UPDATE_DIR="$(mktemp -d)"
chmod 700 "$UPDATE_DIR"
curl -fsSLo "$UPDATE_DIR/update.sh" https://raw.githubusercontent.com/NyxCloudRO/NyxGuardManager/v5.0.9/update.sh
env INSTALL_DIR=/opt/nyxguardmanager FORCE_TAG=5.0.9 NYXGUARD_BASELINE_PLAN=1 bash "$UPDATE_DIR/update.sh"
# Review the installation-bound challenge, then explicitly authorize acceptance:
env INSTALL_DIR=/opt/nyxguardmanager FORCE_TAG=5.0.9 NYXGUARD_AUTO_YES=1 \
  NYXGUARD_ACCEPT_BASELINE='<reviewed challenge>' \
  NYXGUARD_BASELINE_REASON='<administrator reason>' bash "$UPDATE_DIR/update.sh"
```

The commands above are shown for root; ordinary users with sudo privileges prefix `env` with `sudo`.

For an interrupted transaction, use the official updater with `FORCE_TAG` matching that transaction’s original target and `NYXGUARD_RESUME=1`. For a 5.0.9 transaction, use `FORCE_TAG=5.0.9 NYXGUARD_RESUME=1`. It resumes the original durable helper under the shared installation lock; an uncommitted migration returns to the verified source before a fresh retry. Do not clear recovery flags manually or manufacture manifests. Retain recovery volumes and baseline receipts.

Fresh independent installations can use `NYXGUARD_INSTANCE`, `NYXGUARD_VAULT_DIR`, `NYXGUARD_HTTP_PORT`, `NYXGUARD_HTTPS_PORT` and `NYXGUARD_ADMIN_PORT`; defaults preserve the existing installation layout. The installer refuses to overwrite an existing installation directory.

Never resume a helper that failed before acquiring its own durable ledger. A completed rollback uses a new normal guarded upgrade, after reviewing service topology. Do not use baseline acceptance to bypass a valid historical-ledger compatibility defect. See the [current upgrade and recovery guide](upgrade-5.0.9.md).
