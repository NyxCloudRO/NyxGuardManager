# Upgrade and recovery guide: 5.0.9

Run as root inside the installed Manager guest. Verify the published v5.0.9 release before upgrading. Ordinary sudo users prefix privileged commands with `sudo`. Do not run `install.sh` on the existing installation.


## Recovery topology prerequisite

5.0.9 corrects rejection of valid completed historical handover ledgers. It does not silently undo setup left by an earlier failed helper. Before upgrading, verify that canonical Manager and Agent names identify the running original services, with the Agent sharing the Manager network namespace. If names instead identify never-started replacements while originals have rollback names, stop and obtain an installation-specific recovery plan. Preserve all containers and recovery evidence. A previous transaction's completed rollback does not certify a later failed setup attempt. Do not edit ledgers or use baseline acceptance to bypass this condition.

## 1. Read-only preflight

```bash
cd /opt/nyxguardmanager
docker ps --format '{{.Names}} {{.Image}} {{.Status}}'
docker exec nyxguard-manager node -p 'JSON.stringify({version:require("/app/package.json").version,build:process.env.NPM_BUILD_VERSION})'
docker inspect --format '{{.Name}} {{.Image}} {{.State.Status}} {{if .State.Health}}{{.State.Health.Status}}{{end}}' nyxguard-manager nyxguard-db nyxguard-vpn-agent
docker image inspect --format '{{.Id}} {{json .RepoDigests}}' \
  "$(docker inspect -f '{{.Image}}' nyxguard-manager)" \
  "$(docker inspect -f '{{.Image}}' nyxguard-vpn-agent)"
df -h / /var/lib/docker
free -m
cat /sys/fs/cgroup/memory.max /sys/fs/cgroup/memory.events
systemctl is-active nyxguardmanager.service
```

The application version and immutable image metadata determine the source version; a remembered version or host `.version` alone is insufficient. Supported sources are 5.0.0–5.0.8. Stop for an unhealthy Manager/Agent, stopped DB, conflicting version identity or resource shortage.

Read database prerequisites without printing credentials or customer records:

```bash
docker exec nyxguard-db sh -c 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mariadb -N -uroot "$MYSQL_DATABASE" -e "SELECT 1 AS reachable; SELECT COUNT(*) AS migrations FROM migrations; SELECT MAX(is_locked) AS migration_locked FROM migrations_lock; SELECT COUNT(*) AS proxy_hosts FROM proxy_host; SELECT COUNT(*) AS certificates FROM certificate; SELECT COUNT(*) AS orphan_auth FROM auth a LEFT JOIN user u ON a.user_id=u.id WHERE u.id IS NULL; SELECT COUNT(*) AS orphan_permissions FROM user_permission p LEFT JOIN user u ON p.user_id=u.id WHERE u.id IS NULL;"'
docker exec nyxguard-manager nginx -t
```

Expect reachable=1, migration_locked=0, no orphan auth/permissions. Expected migrations: 42 for 5.0.0/5.0.1, 43 for 5.0.2, 45 for 5.0.3–5.0.9. Record host/certificate counts for comparison.

## 2. Previous rollback and backup readiness

```bash
docker exec nyxguard-manager node -e '
const fs=require("fs"),crypto=require("crypto");
const dir="/data/.nyx-handover";
if(fs.existsSync(dir+"/active.json")){
 const active=JSON.parse(fs.readFileSync(dir+"/active.json"));
 if(!/^[a-f0-9]{12,64}$/.test(active.id))throw Error("Invalid active transaction");
 const w=JSON.parse(fs.readFileSync(dir+"/"+active.id+".json"));
 if(crypto.createHash("sha256").update(JSON.stringify(w.transaction)).digest("hex")!==w.sha256)throw Error("Ledger checksum mismatch");
 console.log(JSON.stringify({transaction:active.id,phase:w.transaction.phase}));
 if(!["ROLLBACK_COMPLETE","COMMITTED"].includes(w.transaction.phase))throw Error("Unfinished recovery: stop");
}
const p="/data/update-manager/state.json";
const s=fs.existsSync(p)?JSON.parse(fs.readFileSync(p)):{};
console.log(JSON.stringify({stage:s.stage,manualRecoveryRequired:!!s.manualRecoveryRequired,recoveryCleanupPending:!!s.recoveryCleanupPending}));
if(s.manualRecoveryRequired||s.recoveryCleanupPending||s.activation||s.restartPending)throw Error("Recovery review required: stop");
fs.accessSync("/run/nyxguard-licensing/vault.key",fs.constants.R_OK);
'
docker ps --format '{{.Names}}' | grep -E '^nyxguard-(update-handover|same-major-)|^nyx-sql-' || true
docker volume ls --format '{{.Name}}' | grep -E 'nyxguard.*(data|db|letsencrypt|vpn|recovery)'
```

After a failed attempt, require a checksummed `ROLLBACK_COMPLETE` ledger before retrying. No recovery/helper container may still be running. Preserve stopped evidence containers and all historical recovery artifacts. A previously failed staged schema may remain from an old release; do not delete it to make the upgrade proceed. New attempts use unique restricted staging credentials/schema names.

Retain an independent off-host backup of DB, persistent volumes and licensing vault. Verify it is readable and restorable using your established backup procedure. Stop if independent recovery readiness is uncertain. The updater separately enforces free-space checks, SQL dump, restricted staged restore, full row/schema fingerprints, and protected file/key checks **before migration**. There is no flag to bypass that mandatory gate. If it fails, stop at rollback and collect evidence.

## 3. Download, verify, then upgrade

```bash
set -euo pipefail
RELEASE_DIR="$(mktemp -d /root/nyxguard-5.0.9.XXXXXX)"
chmod 700 "$RELEASE_DIR"
curl -fLsS https://github.com/NyxCloudRO/NyxGuardManager/releases/download/v5.0.9/update.sh -o "$RELEASE_DIR/update.sh"
curl -fLsS https://github.com/NyxCloudRO/NyxGuardManager/releases/download/v5.0.9/SHA256SUMS -o "$RELEASE_DIR/SHA256SUMS"
(cd "$RELEASE_DIR" && grep -E '^[0-9a-f]{64}  update\.sh$' SHA256SUMS | sha256sum -c -)
env INSTALL_DIR=/opt/nyxguardmanager FORCE_TAG=5.0.9 \
  NYXGUARD_AUTO_YES=1 NYXGUARD_REMOVE_OLD_IMAGE=0 \
  bash "$RELEASE_DIR/update.sh" 2>&1 | tee "$RELEASE_DIR/update.log"
```

Stop if a download or checksum fails. This pinned release uses Manager `nyxmael/nyxguardmanager:5.0.9` and Agent `nyxmael/nyxguardmanager-vpn-agent:5.0.1`; immutable digests and source revision are in the release `manifest.json`. Do not accept a version-only success message in place of the final transaction.

Expect `SOURCE_VERIFIED`, `REPLACEMENT_PREPARED`, `BACKUP_STARTING`, `BACKUP_VERIFIED`, `REPLACEMENT_STARTING`, `REPLACEMENT_READY`, `APPLICATION_DATA_VERIFIED`, `COMMITTING`, **`COMMITTED`**. SQL observation warnings are diagnostic; they do not mark backup verified. No observable progress for five minutes or a SQL-helper total deadline of thirty minutes fails the gate. Migration/startup use their existing bounded progress checks.

## 4. Confirm success

Repeat preflight DB/health/version checks. Manager must be **5.0.9**, schema **45**, and Agent healthy on the published compatible digest. Repeat the ledger command: the new active transaction must be **COMMITTED**, with no manual recovery or pending cleanup flags.

Log in and verify Settings, the recorded Proxy Hosts and certificates, HTTPS traffic through representative existing hosts, certificate validity, License status/entitlement, traffic/history, and the configured VPN profile, interface, recent peer handshake and traffic. Healthy Agent HTTP alone does not prove a remote tunnel works. Confirm `systemctl cat nyxguardmanager.service` starts the Agent when enabled. Schedule any reboot in a maintenance window; do not reboot a live installation merely to finish an upgrade.

## 5. Failure: stop and collect evidence

If the updater exits nonzero, stop. Require a healthy original runtime and a checksummed **ROLLBACK_COMPLETE** before considering a reviewed retry. If recovery is incomplete, retain the exact transaction and seek diagnosis; do not start another upgrade.

```bash
docker ps -a --format '{{.Names}} {{.Image}} {{.Status}}'
docker logs --timestamps --tail 300 nyxguard-db
docker logs --timestamps --tail 300 nyxguard-manager
journalctl -u docker -u nyxguardmanager.service --since '1 hour ago' --no-pager
cat /sys/fs/cgroup/memory.events
free -m
df -h / /var/lib/docker
```

Also collect `docker logs --timestamps <retained-handover-name>`, `<retained-backup-worker-name>` and `<retained-nyx-sql-helper-name>` from the inventory, the updater's `update.log`, active ledger/checksum and sanitized updater state. Share logs privately and redact credentials, domains/IPs or SQL record values where present. Do not share `.env`, SQL dumps, vault keys, certificates' private keys, or VPN keys.

**Do not retry blindly, delete recovery artifacts, bypass backup verification, or manually force a migration.** Supported resume of an unfinished new-release helper is `env INSTALL_DIR=/opt/nyxguardmanager FORCE_TAG=5.0.9 NYXGUARD_RESUME=1 bash "$RELEASE_DIR/update.sh"`, only after review confirms exactly that helper/transaction owns the recovery. Completed rollback is retried through the normal command, preserving its historical ledger.
