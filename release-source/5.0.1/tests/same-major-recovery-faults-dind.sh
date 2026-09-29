#!/bin/sh
# Disposable Docker-in-Docker recovery fault checks; never run on a real host.
set -eu
test "${NYX_TASK1A_DISPOSABLE:-}" = 1
test -f /.dockerenv
test "$(docker inspect nyxguard-manager --format '{{.Config.Image}}')" = nyxmael/nyxguardmanager:5.0.0
fixture_topology=${1:?expected manager-only or vpn}
case "$fixture_topology" in manager-only|vpn) ;; *) exit 2 ;; esac
volumes='[{"key":"data","name":"nyxguard_data"},{"key":"letsencrypt","name":"nyxguard_letsencrypt"}]'
vpn_mounts=''
if test "$fixture_topology" = vpn; then
  volumes='[{"key":"data","name":"nyxguard_data"},{"key":"letsencrypt","name":"nyxguard_letsencrypt"},{"key":"vpn","name":"nyxguard_vpn"},{"key":"vpn_auth","name":"nyxguard_vpn_auth"}]'
  vpn_mounts='-v nyxguard_vpn:/source/vpn:ro -v nyxguard_vpn_auth:/source/vpn_auth:ro'
fi
docker volume create nyxguard_update_recovery >/dev/null
root=$(docker volume inspect nyxguard_update_recovery --format '{{.Mountpoint}}')

run_backup() {
  recovery_id=$1
  shift
  # The arguments below are fixed mounts or test-only overrides.
  # shellcheck disable=SC2086
  docker run --rm --network none --entrypoint node \
    -v /var/run/docker.sock:/var/run/docker.sock:ro \
    -v nyxguard_update_recovery:/recovery:rw -v nyxguard_db:/source/db:ro \
    -v /var/lib/nyxguard-licensing:/host-vault:rw \
    -v nyxguard_data:/source/data:ro -v nyxguard_letsencrypt:/source/letsencrypt:ro \
    $vpn_mounts "$@" -e "RECOVERY_ID=$recovery_id" -e RECOVERY_MODE=backup \
    -e "RECOVERY_VOLUMES=$volumes" nyx-task1a-recovery:test /app/internal/same-major-recovery.js
}

# A one MiB recovery filesystem cannot satisfy the measured size plus reserve.
space_id=task1a_space_$(date +%s)
# shellcheck disable=SC2086
if docker run --rm --network none --entrypoint node \
  -v /var/run/docker.sock:/var/run/docker.sock:ro \
  --tmpfs /recovery:size=1048576 -v nyxguard_db:/source/db:ro \
  -v /var/lib/nyxguard-licensing:/host-vault:rw \
  -v nyxguard_data:/source/data:ro -v nyxguard_letsencrypt:/source/letsencrypt:ro \
  $vpn_mounts -e "RECOVERY_ID=$space_id" -e RECOVERY_MODE=backup \
  -e "RECOVERY_VOLUMES=$volumes" nyx-task1a-recovery:test /app/internal/same-major-recovery.js >/dev/null 2>&1; then
  echo 'Insufficient-space check unexpectedly passed' >&2; exit 1
fi
test ! -e "$root/$space_id/manifest.json"
test "$(docker inspect nyxguard-manager --format '{{.State.Health.Status}}')" = healthy

if test "$fixture_topology" = vpn; then docker stop nyxguard-vpn-agent >/dev/null; fi
docker stop nyxguard-manager >/dev/null

# SQL failure after preflight: the DB is deliberately unavailable.
docker stop nyxguard-db >/dev/null
sql_id=task1a_sql_$(date +%s)
if run_backup "$sql_id" >/dev/null 2>&1; then
  echo 'Unavailable-SQL check unexpectedly passed' >&2; exit 1
fi
test ! -e "$root/$sql_id/manifest.json"
docker start nyxguard-db >/dev/null
attempt=0
until docker exec nyxguard-db sh -lc 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mariadb -uroot "$MYSQL_DATABASE" -N -e "select 1"' >/dev/null 2>&1; do
  attempt=$((attempt + 1)); test "$attempt" -lt 60; sleep 2
done

# Fail tar AFTER a successful SQL dump. No manifest may be written.
printf '#!/bin/sh\nexit 4\n' > /tmp/task1a-failing-tar
chmod 700 /tmp/task1a-failing-tar
tar_id=task1a_tar_$(date +%s)
if run_backup "$tar_id" -v /tmp/task1a-failing-tar:/usr/local/bin/tar:ro >/dev/null 2>&1; then
  echo 'Volume-archive failure unexpectedly passed' >&2; exit 1
fi
test -s "$root/$tar_id/database.sql"
test ! -e "$root/$tar_id/manifest.json"

# A corrupt recovery archive must fail validation before changing any volume.
good_id=task1a_good_$(date +%s)
run_backup "$good_id" >/dev/null
restore_vpn_mounts=''
if test "$fixture_topology" = vpn; then
  restore_vpn_mounts='-v nyxguard_vpn:/source/vpn:rw -v nyxguard_vpn_auth:/source/vpn_auth:rw'
fi
run_restore() {
  # shellcheck disable=SC2086
  docker run --rm --network none --entrypoint node \
    -v /var/run/docker.sock:/var/run/docker.sock:ro \
    -v nyxguard_update_recovery:/recovery:rw -v nyxguard_db:/source/db:ro \
    -v /var/lib/nyxguard-licensing:/host-vault:rw \
    -v nyxguard_data:/source/data:rw -v nyxguard_letsencrypt:/source/letsencrypt:rw \
    $restore_vpn_mounts -e "RECOVERY_ID=$good_id" -e RECOVERY_MODE=restore \
    -e "RECOVERY_VOLUMES=$volumes" nyx-task1a-recovery:test /app/internal/same-major-recovery.js
}

# Restore volumes, then fail at SQL because MariaDB is unavailable. The old
# runtime must remain stopped until a second, complete restore succeeds.
data_dir=$(docker volume inspect nyxguard_data --format '{{.Mountpoint}}')
printf 'after\n' > "$data_dir/task1a-marker"
docker stop nyxguard-db >/dev/null
if run_restore >/dev/null 2>&1; then
  echo 'Unavailable-SQL restore unexpectedly passed' >&2; exit 1
fi
test -f "$root/$good_id/manifest.json"
test "$(docker inspect nyxguard-manager --format '{{.State.Running}}')" = false
docker start nyxguard-db >/dev/null
attempt=0
until docker exec nyxguard-db sh -lc 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mariadb -uroot "$MYSQL_DATABASE" -N -e "select 1"' >/dev/null 2>&1; do
  attempt=$((attempt + 1)); test "$attempt" -lt 60; sleep 2
done
run_restore >/dev/null
test "$(cat "$data_dir/task1a-marker")" = before

cp "$root/$good_id/data.tar" /tmp/task1a-data.tar
printf x >> "$root/$good_id/data.tar"
if run_restore >/dev/null 2>&1; then
  echo 'Corrupt-archive restore unexpectedly passed' >&2; exit 1
fi
test -f "$root/$good_id/manifest.json"
test "$(docker inspect nyxguard-manager --format '{{.State.Running}}')" = false
cp /tmp/task1a-data.tar "$root/$good_id/data.tar"
rm /tmp/task1a-data.tar /tmp/task1a-failing-tar

docker start nyxguard-manager >/dev/null
attempt=0
until test "$(docker inspect nyxguard-manager --format '{{.State.Health.Status}}')" = healthy; do
  attempt=$((attempt + 1)); test "$attempt" -lt 60; sleep 2
done
if test "$fixture_topology" = vpn; then
  docker start nyxguard-vpn-agent >/dev/null
  attempt=0
  until test "$(docker inspect nyxguard-vpn-agent --format '{{.State.Health.Status}}')" = healthy; do
    attempt=$((attempt + 1)); test "$attempt" -lt 60; sleep 2
  done
fi
docker run --rm --network none --entrypoint node \
  -v nyxguard_update_recovery:/recovery:rw \
  -e "RECOVERY_ID=$good_id" -e RECOVERY_MODE=cleanup \
  -e "RECOVERY_VOLUMES=$volumes" nyx-task1a-recovery:test /app/internal/same-major-recovery.js
test ! -e "$root/$good_id"
printf 'PASS topology=%s insufficient-space, SQL, tar, corrupt-restore fail closed\n' "$fixture_topology"
