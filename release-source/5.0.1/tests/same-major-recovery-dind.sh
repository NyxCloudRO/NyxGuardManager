#!/bin/sh
# Run only inside a disposable Docker-in-Docker fixture with a 5.0.0 Manager.
set -eu
test "${NYX_TASK1A_DISPOSABLE:-}" = 1
test -f /.dockerenv
test "$(docker inspect nyxguard-manager --format '{{.Config.Image}}')" = nyxmael/nyxguardmanager:5.0.0
test "$(docker inspect nyxguard-manager --format '{{.State.Health.Status}}')" = healthy

fixture_topology=${1:?expected manager-only or vpn}
case "$fixture_topology" in manager-only|vpn) ;; *) exit 2 ;; esac
if test "$fixture_topology" = vpn; then
  test "$(docker inspect nyxguard-vpn-agent --format '{{.State.Health.Status}}')" = healthy
  recovery_volumes='[{"key":"data","name":"nyxguard_data"},{"key":"letsencrypt","name":"nyxguard_letsencrypt"},{"key":"vpn","name":"nyxguard_vpn"},{"key":"vpn_auth","name":"nyxguard_vpn_auth"}]'
else
  ! docker inspect nyxguard-vpn-agent >/dev/null 2>&1
  recovery_volumes='[{"key":"data","name":"nyxguard_data"},{"key":"letsencrypt","name":"nyxguard_letsencrypt"}]'
fi

data_dir=$(docker volume inspect nyxguard_data --format '{{.Mountpoint}}')
cert_dir=$(docker volume inspect nyxguard_letsencrypt --format '{{.Mountpoint}}')
test -f /var/lib/nyxguard-licensing/vault.key
vault_hash=$(sha256sum /var/lib/nyxguard-licensing/vault.key | cut -d' ' -f1)
baseline_migrations=$(docker exec nyxguard-db sh -lc 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mariadb -uroot "$MYSQL_DATABASE" -N -e "select count(*) from migrations"')
test "$baseline_migrations" = 42
settings_hash=$(docker exec nyxguard-db sh -lc 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mariadb -uroot "$MYSQL_DATABASE" -N -e "select * from setting order by id" | sha256sum | cut -d" " -f1')

docker exec nyxguard-db sh -lc 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mariadb -uroot "$MYSQL_DATABASE" -e "CREATE TABLE IF NOT EXISTS task1a_recovery_marker (id INTEGER PRIMARY KEY, value VARCHAR(32)) ENGINE=Aria; REPLACE INTO task1a_recovery_marker VALUES (1, '\''before'\'')"'
printf 'before\n' > "$data_dir/task1a-marker"
printf 'before\n' > "$cert_dir/task1a-marker"
if test "$fixture_topology" = vpn; then
  vpn_dir=$(docker volume inspect nyxguard_vpn --format '{{.Mountpoint}}')
  auth_dir=$(docker volume inspect nyxguard_vpn_auth --format '{{.Mountpoint}}')
  printf 'before\n' > "$vpn_dir/task1a-marker"
  printf 'before\n' > "$auth_dir/task1a-marker"
  docker stop nyxguard-vpn-agent >/dev/null
fi
docker stop nyxguard-manager >/dev/null

docker volume create nyxguard_update_recovery >/dev/null
recovery_id="task1a_${fixture_topology}_$(date +%s)"
common_mounts=''
for pair in data:nyxguard_data letsencrypt:nyxguard_letsencrypt; do
  key=${pair%%:*}; name=${pair#*:}
  common_mounts="$common_mounts -v $name:/source/$key:ro"
done
if test "$fixture_topology" = vpn; then
  common_mounts="$common_mounts -v nyxguard_vpn:/source/vpn:ro -v nyxguard_vpn_auth:/source/vpn_auth:ro"
fi

# Splitting common_mounts is intentional: it contains only fixed volume arguments.
# shellcheck disable=SC2086
docker run --rm --network none --entrypoint node \
  -v /var/run/docker.sock:/var/run/docker.sock:ro \
  -v nyxguard_update_recovery:/recovery:rw -v nyxguard_db:/source/db:ro \
  -v /var/lib/nyxguard-licensing:/host-vault:rw $common_mounts \
  -e "RECOVERY_ID=$recovery_id" -e RECOVERY_MODE=backup \
  -e "RECOVERY_VOLUMES=$recovery_volumes" \
  nyx-task1a-recovery:test /app/internal/same-major-recovery.js

recovery_dir="$(docker volume inspect nyxguard_update_recovery --format '{{.Mountpoint}}')/$recovery_id"
test -f "$recovery_dir/manifest.json"
test "$(stat -c %a "$recovery_dir")" = 700
for item in "$recovery_dir"/*; do test "$(stat -c %a "$item")" = 600; done

# A disposable replacement container writes after the backup, then fails.
if test "$fixture_topology" = vpn; then
  docker run --rm --entrypoint sh -v nyxguard_data:/data:rw -v nyxguard_letsencrypt:/etc/letsencrypt:rw \
    -v nyxguard_vpn:/var/lib/nyxguard-vpn:rw -v nyxguard_vpn_auth:/run/nyxguard-vpn-auth:rw \
    nyx-task1a-recovery:test -c 'printf "after\n" > /data/task1a-marker; printf "after\n" > /etc/letsencrypt/task1a-marker; printf "after\n" > /var/lib/nyxguard-vpn/task1a-marker; printf "after\n" > /run/nyxguard-vpn-auth/task1a-marker; exit 1' && exit 1 || true
else
  docker run --rm --entrypoint sh -v nyxguard_data:/data:rw -v nyxguard_letsencrypt:/etc/letsencrypt:rw \
    nyx-task1a-recovery:test -c 'printf "after\n" > /data/task1a-marker; printf "after\n" > /etc/letsencrypt/task1a-marker; exit 1' && exit 1 || true
fi
docker exec nyxguard-db sh -lc 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mariadb -uroot "$MYSQL_DATABASE" -e "UPDATE task1a_recovery_marker SET value = '\''after'\'' WHERE id = 1; CREATE TABLE task1a_after_start (id INT) ENGINE=Aria"'
test "$(cat "$data_dir/task1a-marker")" = after
test "$(cat "$cert_dir/task1a-marker")" = after
test "$(docker exec nyxguard-db sh -lc 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mariadb -uroot "$MYSQL_DATABASE" -N -e "select value from task1a_recovery_marker where id = 1"')" = after

restore_mounts=''
for pair in data:nyxguard_data letsencrypt:nyxguard_letsencrypt; do
  key=${pair%%:*}; name=${pair#*:}
  restore_mounts="$restore_mounts -v $name:/source/$key:rw"
done
if test "$fixture_topology" = vpn; then
  restore_mounts="$restore_mounts -v nyxguard_vpn:/source/vpn:rw -v nyxguard_vpn_auth:/source/vpn_auth:rw"
fi
# shellcheck disable=SC2086
docker run --rm --network none --entrypoint node \
  -v /var/run/docker.sock:/var/run/docker.sock:ro \
  -v nyxguard_update_recovery:/recovery:rw -v nyxguard_db:/source/db:ro \
  -v /var/lib/nyxguard-licensing:/host-vault:rw $restore_mounts \
  -e "RECOVERY_ID=$recovery_id" -e RECOVERY_MODE=restore \
  -e "RECOVERY_VOLUMES=$recovery_volumes" \
  nyx-task1a-recovery:test /app/internal/same-major-recovery.js

test "$(cat "$data_dir/task1a-marker")" = before
test "$(cat "$cert_dir/task1a-marker")" = before
if test "$fixture_topology" = vpn; then
  test "$(cat "$vpn_dir/task1a-marker")" = before
  test "$(cat "$auth_dir/task1a-marker")" = before
fi
test "$(sha256sum /var/lib/nyxguard-licensing/vault.key | cut -d' ' -f1)" = "$vault_hash"
test "$(docker exec nyxguard-db sh -lc 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mariadb -uroot "$MYSQL_DATABASE" -N -e "select value from task1a_recovery_marker where id = 1"')" = before
test "$(docker exec nyxguard-db sh -lc 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mariadb -uroot "$MYSQL_DATABASE" -N -e "select count(*) from migrations"')" = "$baseline_migrations"
test "$(docker exec nyxguard-db sh -lc 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mariadb -uroot "$MYSQL_DATABASE" -N -e "select * from setting order by id" | sha256sum | cut -d" " -f1')" = "$settings_hash"
test "$(docker exec nyxguard-db sh -lc 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mariadb -uroot "$MYSQL_DATABASE" -N -e "select count(*) from information_schema.tables where table_schema=database() and table_name=\"task1a_after_start\""')" = 0

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
  manager_id=$(docker inspect nyxguard-manager --format '{{.Id}}')
  test "$(docker inspect nyxguard-vpn-agent --format '{{.HostConfig.NetworkMode}}')" = "container:$manager_id"
fi
printf 'PASS topology=%s migration=%s SQL+volumes+vault restored, old runtime healthy\n' "$fixture_topology" "$baseline_migrations"
