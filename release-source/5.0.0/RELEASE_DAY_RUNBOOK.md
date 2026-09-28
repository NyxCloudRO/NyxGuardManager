# NyxGuard 5.0.0 PROD release day

This procedure is for the authorized controlled change on the production host.
The observed starting point is image `sha256:d5ec6137e6b48731a0c971e9fe76f744cee3a82f257bd7b078680474a4d7edf2`,
NyxGuard 4.0.18, 41 migrations, and five named volumes. Recheck every identity
before proceeding. Preserve the database and vault key as one recovery set.

1. Put the customer system in a maintenance window. On PROD, create a restricted
   backup directory and save the exact configuration and rollback image:

   ```sh
   set -eu
   cd /opt/nyxguardmanager
   export BACKUP_DIR=/root/nyxguard-5-release-backup
   install -d -m 0700 "$BACKUP_DIR"
   cp -a docker-compose.yml docker-compose.vpn.yml .env "$BACKUP_DIR/"
   docker inspect nyxguard-manager > "$BACKUP_DIR/app-inspect.json"
   docker image inspect sha256:d5ec6137e6b48731a0c971e9fe76f744cee3a82f257bd7b078680474a4d7edf2 > "$BACKUP_DIR/rollback-image-inspect.json"
   docker image save sha256:d5ec6137e6b48731a0c971e9fe76f744cee3a82f257bd7b078680474a4d7edf2 -o "$BACKUP_DIR/rollback-4.0.18.tar"
   docker exec nyxguard-db sh -lc 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mariadb-dump -uroot --single-transaction --routines --events "$MYSQL_DATABASE"' > "$BACKUP_DIR/database.sql"
   for volume in nyxguard_data nyxguard_db nyxguard_letsencrypt nyxguard_vpn nyxguard_vpn_auth; do
     source_dir="$(docker volume inspect "$volume" --format '{{.Mountpoint}}')"
     tar -C "$source_dir" -cf "$BACKUP_DIR/$volume.tar" .
   done
   sha256sum "$BACKUP_DIR"/*.tar "$BACKUP_DIR/database.sql" > "$BACKUP_DIR/SHA256SUMS"
   (cd "$BACKUP_DIR" && sha256sum -c SHA256SUMS)
   test -s "$BACKUP_DIR/database.sql"
   test -s "$BACKUP_DIR/rollback-4.0.18.tar"
   ```

   Stop writes while taking volume archives and verify an isolated restore of
   the SQL dump, all volume archives, Compose files and rollback image before
   changing the application. Do not treat a hot `nyxguard_db` archive as the
   consistent DB backup; use the SQL dump for database rollback.

2. Provision the persistent protected vault key before first 5.0.0 start.
   Mount `/var/lib/nyxguard-licensing/vault.key` read-only at
   `/run/nyxguard-licensing/vault.key`. Set the app's
   `NYXCLOUD_LICENSE_VAULT_KEY_PATH` to that container path. Follow
   [VAULT_OPERATIONS.md](VAULT_OPERATIONS.md) for ownership, backup and restore.
   Never regenerate an existing key. Save the key with restricted backup access.

3. Configure `NYXCLOUD_AUTHORITY_URL=https://licensing.nyxcloud.ro` and the
   validated public SupportStorage origin in the protected PROD Compose config.
   Install the validated 5.0.0 image by immutable digest, retaining the saved
   4.0.18 image. Set `DOCKER_SOCK_GID` from the numeric GID of the host Docker
   socket and add that supplemental group to the Manager. Review
   `docker compose --env-file .env -f docker-compose.yml -f docker-compose.vpn.yml
   config` without printing secrets into the change record. Stop the old VPN
   agent before replacing the Manager; start the new Manager and wait for health
   and migration 42 before recreating the VPN agent against its new namespace.
   Verify the VPN agent is healthy. Do not recreate MariaDB or named volumes.

4. Confirm migration 42, application and DB health, zero unexpected restart
   loop, existing customer functions, and public licensing connectivity. Read
   the new installation UUID from the local licensing state through the
   approved operator method. Do not guess or reuse a DEV UUID.

5. On the licensing Primary, use the protected operator environment and the
   exact `nyxguard-owner-prod-provision` command in
   `docs/NYXGUARD_OWNER_OPERATIONS.md` in the shared licensing platform source.
   Supply the verified PROD UUID, `nyxguard-manager-professional-support`,
   `nyxguard_diagnostics_support`, and ten years. The command emails the
   one-time claim; it does not create a BMAC purchase. Enter that claim in the
   ordinary License page, activate, and refresh through the public authority.

6. Confirm `Active`, the correct product/capability/expiry, Authority Available,
   and Diagnostics & Support unlocked. Recreate only the app under the
   established Compose procedure, then refresh again. Generate a redacted
   support bundle, upload it, read it back through SupportStorage, record the
   Support ID, and repeat final health/customer-function checks.

## Rollback

If the 5.0.0 gate fails, stop the 5.0.0 app and prevent new customer writes.
Preserve the failed state for investigation. Restore the verified pre-upgrade
SQL database and all five named volumes from the restricted backup, restore
the saved Compose/configuration, and load the exact saved 4.0.18 image with
   `docker image load -i "$BACKUP_DIR/rollback-4.0.18.tar"`. Pin the restored
Compose image to the saved immutable image ID, then start the previous stack.
Verify 4.0.18, migration 41, health, customer functions and VPN. A 4.0.18 app
must not run against the migration-42 database. Preserve the 5.0.0 vault key
and incident evidence; do not revoke or reuse an issued claim without an
explicit authority reconciliation step.
