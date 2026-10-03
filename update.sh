#!/usr/bin/env bash
# NyxGuard Manager updater (Docker-only, auto-latest)
# Intended usage:
#   curl -fsSL <update.sh-url> | sudo bash
set -euo pipefail

INSTALL_DIR="${INSTALL_DIR:-/opt/nyxguardmanager}"
IMAGE_REPO="${IMAGE_REPO:-nyxmael/nyxguardmanager}"
VPN_AGENT_REPO="${VPN_AGENT_REPO:-nyxmael/nyxguardmanager-vpn-agent}"
FORCE_TAG="${FORCE_TAG:-}"        # Optional explicit target tag override.
AUTO_YES="${NYXGUARD_AUTO_YES:-0}" # Set to 1 for non-interactive mode.
REMOVE_OLD_IMAGE="${NYXGUARD_REMOVE_OLD_IMAGE:-1}" # Set to 0 to keep the previous image for rollback.
REQUIRE_VPN="${NYXGUARD_REQUIRE_VPN:-0}" # Set to 1 to abort when /dev/net/tun is unavailable.
CLI_BOOTSTRAP_URL="https://raw.githubusercontent.com/NyxCloudRO/NyxGuardManager/main/upgrade/cli-bootstrap.mjs"
CLI_BOOTSTRAP_SHA256="89eb4165bfdde3664a07d4a25385cc442ff0862bb01829e0783a817a5a2f38c3"
MANAGER_ONLY_URL="https://raw.githubusercontent.com/NyxCloudRO/NyxGuardManager/main/upgrade/manager-only-handover.mjs"
MANAGER_ONLY_SHA256="8a374930d5f421d5296886bc9b05141a79fafb6522d2bd8870b41d1cb476a470"

SAME_MAJOR_URL="https://raw.githubusercontent.com/NyxCloudRO/NyxGuardManager/main/upgrade/same-major-bootstrap.mjs"
SAME_MAJOR_SHA256="18a2e0930aba6706b85fb3544e1e747bcdf2fd94455f11f75f36799935d82745"

# Published release contracts; new Manager tags require an explicit Agent decision.
vpn_agent_tag_for_manager() {
  case "$(normalize_semver "$1")" in
    5.0.2|5.0.1) echo 5.0.1 ;;
    5.0.0) echo 5.0.0 ;;
    4.0.14|4.0.15|4.0.16|4.0.17|4.0.18) normalize_semver "$1" ;;
    *) echo "ERROR: No published VPN compatibility contract for Manager $1." >&2; return 1 ;;
  esac
}

need_root() {
  if [[ "${EUID}" -ne 0 ]]; then
    echo "ERROR: Run as root (or with sudo)." >&2
    exit 1
  fi
}

have_cmd() { command -v "$1" >/dev/null 2>&1; }

is_semver() {
  [[ "$1" =~ ^v?[0-9]+\.[0-9]+\.[0-9]+$ ]]
}

normalize_semver() {
  local t="$1"
  echo "${t#v}"
}

dockerhub_latest_tag() {
  local repo="$1"
  local current="${2:-}"

  if [[ "${repo}" != */* ]]; then
    echo "ERROR: IMAGE_REPO must be in '<namespace>/<name>' format." >&2
    return 1
  fi

  local ns name url json next
  ns="${repo%%/*}"
  name="${repo##*/}"
  url="https://hub.docker.com/v2/repositories/${ns}/${name}/tags?page_size=100"

  local semver_tags=""

  while [[ -n "${url}" && "${url}" != "null" ]]; do
    json="$(curl -fsSL "${url}")"

    while IFS= read -r tag; do
      if is_semver "${tag}" && [[ "$(upgrade_route "$current" "$tag")" != unsupported ]]; then
        semver_tags+="${tag}"$'\n'
      fi
    done < <(echo "${json}" | jq -r '.results[].name')

    next="$(echo "${json}" | jq -r '.next')"
    url="${next}"
  done

  if [[ -z "${semver_tags}" ]]; then
    if is_semver "$current"; then
      echo "$current"
      return 0
    fi
    echo "ERROR: No supported published release found for current version ${current}." >&2
    return 1
  fi

  local best_norm best_tag
  best_norm="$(printf '%s' "${semver_tags}" | sed '/^$/d;s/^v//' | sort -V | tail -n 1)"

  if printf '%s' "${semver_tags}" | grep -qx "${best_norm}"; then
    best_tag="${best_norm}"
  else
    best_tag="v${best_norm}"
  fi

  echo "${best_tag}"
}

require_commands() {
  local missing=0
  for c in curl jq docker flock sha256sum; do
    if ! have_cmd "$c"; then
      echo "ERROR: Missing required command: $c" >&2
      missing=1
    fi
  done

  if [[ "$missing" -ne 0 ]]; then
    exit 1
  fi

  if ! (docker compose version >/dev/null 2>&1 || have_cmd docker-compose); then
    echo "ERROR: Docker Compose is not available." >&2
    exit 1
  fi
}

require_install_files() {
  if [[ ! -f "${INSTALL_DIR}/docker-compose.yml" ]]; then
    echo "ERROR: ${INSTALL_DIR}/docker-compose.yml not found." >&2
    echo "Run install.sh first." >&2
    exit 1
  fi

  if [[ ! -f "${INSTALL_DIR}/.env" ]]; then
    echo "ERROR: ${INSTALL_DIR}/.env not found." >&2
    echo "Run install.sh first." >&2
    exit 1
  fi
}

read_current_image_ref() {
  awk '
    $1 == "image:" && $2 ~ /nyxguardmanager:/ {
      print $2
      exit
    }
  ' "${INSTALL_DIR}/docker-compose.yml"
}

update_compose_image_ref() {
  local new_ref="$1"
  local tmp
  tmp="$(mktemp)"

  awk -v img="${new_ref}" '
    {
      if (!done && $1 == "image:" && $2 ~ /nyxguardmanager:/) {
        match($0, /^[[:space:]]*/)
        indent = substr($0, RSTART, RLENGTH)
        print indent "image: " img
        done = 1
      } else if ($1 == "NPM_BUILD_VERSION:" || $1 == "NPM_BUILD_COMMIT:" || $1 == "NPM_BUILD_DATE:") {
        # Image metadata is authoritative after an update. Repository Compose
        # examples may contain release-specific overrides from the old image.
        next
      } else {
        print
      }
    }
  ' "${INSTALL_DIR}/docker-compose.yml" >"${tmp}"

  mv -f "${tmp}" "${INSTALL_DIR}/docker-compose.yml"
}

version_is_newer() {
  local current="$1"
  local target="$2"

  if [[ "${current}" == "${target}" ]]; then
    return 1
  fi

  if is_semver "${current}" && is_semver "${target}"; then
    local c t
    c="$(normalize_semver "${current}")"
    t="$(normalize_semver "${target}")"
    [[ "$(printf '%s\n%s\n' "${c}" "${t}" | sort -V | tail -n1)" == "${t}" ]] && [[ "${c}" != "${t}" ]]
    return
  fi

  # Fallback for non-semver tags: treat changed tag as newer.
  return 0
}

version_at_least() {
  local version minimum
  version="$(normalize_semver "$1")"
  minimum="$(normalize_semver "$2")"
  [[ "$(printf '%s\n%s\n' "${version}" "${minimum}" | sort -V | tail -n1)" == "${version}" ]]
}

tun_is_usable() {
  [[ -c /dev/net/tun ]] && (exec 9<>/dev/net/tun) 2>/dev/null
}

prepare_tun_device() {
  if tun_is_usable; then
    return 0
  fi

  # Normal VMs and bare-metal hosts can usually load TUN themselves. In an
  # LXC container the Proxmox host must pass the device through instead.
  if have_cmd modprobe; then
    modprobe tun >/dev/null 2>&1 || true
  fi

  if [[ ! -c /dev/net/tun && -e /sys/class/misc/tun/dev ]]; then
    mkdir -p /dev/net
    mknod /dev/net/tun c 10 200 >/dev/null 2>&1 || true
    chmod 666 /dev/net/tun >/dev/null 2>&1 || true
  fi

  tun_is_usable
}

print_tun_warning() {
  local virt="unknown"
  if have_cmd systemd-detect-virt; then
    virt="$(systemd-detect-virt 2>/dev/null || true)"
  fi

  echo ""
  echo "WARNING: WireGuard VPN Client was not started because /dev/net/tun is unavailable."
  echo "NyxGuard Manager will continue running normally; only VPN Client is disabled."
  if [[ "${virt}" == "lxc" ]]; then
    echo "Detected Proxmox/LXC. On the Proxmox HOST, load TUN and add these lines to the CT config:"
    echo "  modprobe tun"
    echo "  lxc.cgroup2.devices.allow: c 10:200 rwm"
    echo "  lxc.mount.entry: /dev/net/tun dev/net/tun none bind,create=file"
    echo "Then restart the LXC container and run update.sh again."
  else
    echo "Load the host TUN module (modprobe tun), confirm /dev/net/tun exists, then run update.sh again."
  fi
  echo "Set NYXGUARD_REQUIRE_VPN=1 if a missing TUN device should abort instead of degrading safely."
  echo ""
}

disable_vpn_systemd_override() {
  local override="/etc/systemd/system/nyxguardmanager.service.d/vpn-stack.conf"
  if [[ -f "${override}" ]]; then
    rm -f "${override}"
    systemctl daemon-reload
  fi
}

start_manager_without_vpn() {
  disable_vpn_systemd_override
  rm -f "${INSTALL_DIR}/docker-compose.vpn.yml"
  docker compose --env-file "${INSTALL_DIR}/.env" -f "${INSTALL_DIR}/docker-compose.yml" up -d --remove-orphans nyxguard-manager db
}

write_vpn_compose_overlay() {
  local vpn_agent_ref="$1"

  cat >"${INSTALL_DIR}/docker-compose.vpn.yml" <<'YAML'
services:
  nyxguard-manager:
    environment:
      NYXGUARD_VPN_AGENT_URL: "http://127.0.0.1:3198"
      NYXGUARD_VPN_AGENT_TOKEN_PATH: "/run/nyxguard-vpn-auth/token"
    volumes:
      - nyxguard_vpn_auth:/run/nyxguard-vpn-auth:ro

  vpn-client-agent:
    container_name: nyxguard-vpn-agent
    image: __VPN_AGENT_IMAGE_REF__
    restart: unless-stopped
    network_mode: "service:nyxguard-manager"
    cap_add:
      - NET_ADMIN
    devices:
      - /dev/net/tun:/dev/net/tun
    environment:
      NYXGUARD_BACKEND_UID: "${PUID:-1000}"
    volumes:
      - nyxguard_vpn:/var/lib/nyxguard-vpn
      - nyxguard_vpn_auth:/run/nyxguard-vpn-auth
      - /etc/localtime:/etc/localtime:ro
    depends_on:
      nyxguard-manager:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "node", "-e", "const fs=require('fs');fetch('http://127.0.0.1:3198/status',{headers:{'X-NyxGuard-VPN-Token':fs.readFileSync('/run/nyxguard-vpn-auth/token','utf8').trim()}}).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 10s

volumes:
  nyxguard_vpn:
    name: nyxguard_vpn
  nyxguard_vpn_auth:
    name: nyxguard_vpn_auth
YAML

  sed -i "s|__VPN_AGENT_IMAGE_REF__|${vpn_agent_ref}|g" "${INSTALL_DIR}/docker-compose.vpn.yml"
}

install_vpn_systemd_override() {
  if [[ ! -f /etc/systemd/system/nyxguardmanager.service ]]; then
    return
  fi

  mkdir -p /etc/systemd/system/nyxguardmanager.service.d
  cat >/etc/systemd/system/nyxguardmanager.service.d/vpn-stack.conf <<UNIT
[Service]
ExecStart=
ExecStart=/usr/bin/docker compose --env-file ${INSTALL_DIR}/.env -f ${INSTALL_DIR}/docker-compose.yml -f ${INSTALL_DIR}/docker-compose.vpn.yml up -d --remove-orphans
ExecStop=
ExecStop=/usr/bin/docker compose --env-file ${INSTALL_DIR}/.env -f ${INSTALL_DIR}/docker-compose.yml -f ${INSTALL_DIR}/docker-compose.vpn.yml down
UNIT
  systemctl daemon-reload
}

wait_for_manager_vpn_agent() {
  local attempt
  for attempt in {1..20}; do
    if docker exec nyxguard-manager node -e '
      const fs = require("fs");
      const token = fs.readFileSync("/run/nyxguard-vpn-auth/token", "utf8").trim();
      fetch("http://127.0.0.1:3198/status", { headers: { "X-NyxGuard-VPN-Token": token } })
        .then((response) => process.exit(response.ok ? 0 : 1))
        .catch(() => process.exit(1));
    ' >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done

  echo "ERROR: VPN agent is not reachable from the NyxGuard Manager network namespace." >&2
  return 1
}

start_vpn_stack() {
  local compose_args=(
    --env-file "${INSTALL_DIR}/.env"
    -f "${INSTALL_DIR}/docker-compose.yml"
    -f "${INSTALL_DIR}/docker-compose.vpn.yml"
  )

  docker compose "${compose_args[@]}" up -d --remove-orphans

  # network_mode: service:nyxguard-manager binds the agent to the manager's
  # concrete network namespace. Compose does not automatically recreate the
  # dependent agent when only the manager image/container changes.
  docker compose "${compose_args[@]}" up -d --no-deps --force-recreate vpn-client-agent
  wait_for_manager_vpn_agent
}

confirm_update() {
  local current_ref="$1"
  local target_ref="$2"

  echo ""
  echo "IMPORTANT NOTE"
  echo "- This update preserves existing production data."
  echo "- It does NOT remove Docker volumes (DB/config/certs stay intact)."
  echo "- Only container image/service version is updated."
  echo ""
  echo "Current image: ${current_ref}"
  echo "Target image : ${target_ref}"

  if [[ "${AUTO_YES}" == "1" ]]; then
    return 0
  fi

  local answer
  if [[ -r /dev/tty ]]; then
    read -r -p "Proceed with update? [y/N]: " answer </dev/tty
  else
    echo "ERROR: No interactive terminal available for confirmation." >&2
    echo "Run with NYXGUARD_AUTO_YES=1 for non-interactive updates." >&2
    return 1
  fi
  case "${answer}" in
    y|Y|yes|YES) return 0 ;;
    *)
      echo "Update cancelled by user."
      return 1
      ;;
  esac
}

cleanup_previous_image() {
  local current_ref="$1"
  local target_ref="$2"

  if [[ "${REMOVE_OLD_IMAGE}" != "1" ]]; then
    echo "Keeping previous image: ${current_ref}"
    return 0
  fi

  if [[ "${current_ref}" == "${target_ref}" ]]; then
    return 0
  fi

  echo "Removing previous image: ${current_ref}"
  if ! docker image rm "${current_ref}"; then
    echo "Previous image was kept because Docker still considers it in use." >&2
  fi
}

# Register supported transitions here. A new major version must never inherit
# the compatible image-swap path merely because it is the newest Docker tag.
upgrade_route() {
  local from="$(normalize_semver "$1")" to="$(normalize_semver "$2")"
  if ! is_semver "$from" || ! is_semver "$to"; then
    echo unsupported
  elif [[ "$from" == 4.0.18 && "$to" == 5.0.0 ]]; then
    echo major_handover_500
  elif [[ "${from%%.*}" == "${to%%.*}" ]]; then
    echo compatible
  else
    echo unsupported
  fi
}

# The immutable 4.0.18 web updater can mark a pulled major image as ready to
# restart. A failed host attempt must not leave that claim in place when the
# original 4.0.18 runtime and migration 41 are demonstrably intact.
reconcile_failed_major_state() {
  local manager_id db_id manager_state migration
  manager_id="$(docker compose --env-file "$INSTALL_DIR/.env" -f "$INSTALL_DIR/docker-compose.yml" ps -q nyxguard-manager 2>/dev/null || true)"
  db_id="$(docker compose --env-file "$INSTALL_DIR/.env" -f "$INSTALL_DIR/docker-compose.yml" ps -q db 2>/dev/null || true)"
  [[ -n "$manager_id" && -n "$db_id" ]] || return 0
  manager_state="$(docker inspect "$manager_id" --format '{{.Config.Image}}|{{.State.Health.Status}}' 2>/dev/null || true)"
  [[ "$manager_state" == "nyxmael/nyxguardmanager:4.0.18|healthy" ]] || return 0
  migration="$(docker exec "$db_id" sh -c 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mariadb -N -uroot "$MYSQL_DATABASE" -e "SELECT count(*) FROM migrations"' 2>/dev/null || true)"
  [[ "$migration" == 41 ]] || return 0
  docker exec "$manager_id" node -e '
    const fs = require("fs");
    const file = "/data/update-manager/state.json";
    if (!fs.existsSync(file)) process.exit(0);
    const state = JSON.parse(fs.readFileSync(file, "utf8"));
    if (state.pendingVersion !== "5.0.0" || state.restartPending !== true) process.exit(0);
    state.pendingVersion = null;
    state.restartPending = false;
    const prior = state.lastApplyFailure || {};
    state.lastApplyFailure = { ...prior, at: prior.at || new Date().toISOString(),
      error: prior.error || "Host major upgrade did not complete; inspect update.sh output and retry after resolving the cause",
      recoveryStatus: prior.recoveryStatus || "old_runtime_verified" };
    const temp = `${file}.host-updater-${process.pid}`;
    fs.writeFileSync(temp, JSON.stringify(state, null, 2), { mode: 0o600 });
    fs.renameSync(temp, file);
  ' >/dev/null 2>&1 || echo "WARNING: Unable to reconcile the old web update state; inspect it before using Restart now." >&2
}

run_major_handover_500() (
  local bootstrap manager_only tmp generated_overlay=0 manager_only_declared=0
  tmp="$(mktemp -d)"
  chmod 700 "$tmp"
  trap 'rm -rf "$tmp"' EXIT
  local vpn_overlay="$INSTALL_DIR/docker-compose.vpn.yml"
  bootstrap="$tmp/cli-bootstrap.mjs"
  if [[ -n "${NYXGUARD_CLI_BOOTSTRAP_FILE:-}" ]]; then
    cp -- "$NYXGUARD_CLI_BOOTSTRAP_FILE" "$bootstrap"
  else
    curl -fsSL "$CLI_BOOTSTRAP_URL" -o "$bootstrap"
  fi
  if [[ "$(sha256sum "$bootstrap" | cut -d' ' -f1)" != "$CLI_BOOTSTRAP_SHA256" ]]; then
    echo "ERROR: Upgrade bootstrap checksum mismatch; installation was not changed." >&2
    reconcile_failed_major_state
    return 1
  fi
  chmod 600 "$bootstrap"
  manager_only="$tmp/manager-only-handover.mjs"
  if [[ -n "${NYXGUARD_MANAGER_ONLY_FILE:-}" ]]; then
    cp -- "$NYXGUARD_MANAGER_ONLY_FILE" "$manager_only"
  else
    curl -fsSL "$MANAGER_ONLY_URL" -o "$manager_only"
  fi
  if [[ "$(sha256sum "$manager_only" | cut -d' ' -f1)" != "$MANAGER_ONLY_SHA256" ]]; then
    echo "ERROR: Manager-only recovery helper checksum mismatch; installation was not changed." >&2
    reconcile_failed_major_state
    return 1
  fi
  chmod 600 "$manager_only"
  local service_unit="/etc/systemd/system/nyxguardmanager.service"
  local vpn_override="/etc/systemd/system/nyxguardmanager.service.d/vpn-stack.conf"
  local manager_only_start="ExecStart=/usr/bin/docker compose --env-file ${INSTALL_DIR}/.env -f ${INSTALL_DIR}/docker-compose.yml up -d --remove-orphans nyxguard-manager db"
  if [[ -f "$service_unit" && ! -e "$vpn_override" ]] && grep -Fxq "$manager_only_start" "$service_unit"; then
    manager_only_declared=1
  fi
  if [[ ! -e "$vpn_overlay" ]]; then
    # The public 4.0.18 installer places VPN in the main Compose file. The
    # immutable 5.0.0 recovery worker expects a separate VPN override file.
    local vpn_image vpn_network
    vpn_image="$(docker compose --env-file "$INSTALL_DIR/.env" -f "$INSTALL_DIR/docker-compose.yml" config --format json | jq -r '.services["vpn-client-agent"].image // empty')"
    vpn_network="$(docker compose --env-file "$INSTALL_DIR/.env" -f "$INSTALL_DIR/docker-compose.yml" config --format json | jq -r '.services["vpn-client-agent"].network_mode // empty')"
    if [[ "$vpn_image" != "nyxmael/nyxguardmanager-vpn-agent:4.0.18" || "$vpn_network" != "service:nyxguard-manager" ]]; then
      echo "ERROR: Unsupported 4.0.18 VPN Compose layout; installation was not changed." >&2
      return 1
    fi
    printf 'services:\n  vpn-client-agent:\n    image: nyxmael/nyxguardmanager-vpn-agent:4.0.18\n' > "$tmp/docker-compose.vpn.yml"
    chmod 600 "$tmp/docker-compose.vpn.yml"
    mv -- "$tmp/docker-compose.vpn.yml" "$vpn_overlay"
    generated_overlay=1
  fi
  echo "Starting the verified 4.0.18 to 5.0.0 recovery and handover engine..."
  if ! docker run --rm --network none --user 0:0 --entrypoint node \
    --mount "type=bind,src=/var/run/docker.sock,dst=/var/run/docker.sock" \
    --mount "type=bind,src=$bootstrap,dst=/tmp/cli-bootstrap.mjs,readonly" \
    -e CURRENT_VERSION=4.0.18 -e TARGET_VERSION=5.0.0 \
    -e "HOST_INSTALL_DIR=$INSTALL_DIR" -e "NYXGUARD_MANAGER_ONLY_DECLARED=$manager_only_declared" \
    -e "NYXGUARD_MANAGER_ONLY_HOST_FILE=$manager_only" \
    "$IMAGE_REPO:5.0.0" /tmp/cli-bootstrap.mjs; then
    if [[ "$generated_overlay" == 1 ]] && \
       [[ "$(docker inspect nyxguard-manager --format '{{.Config.Image}}|{{.State.Health.Status}}' 2>/dev/null)" == "nyxmael/nyxguardmanager:4.0.18|healthy" ]] && \
       [[ "$(docker inspect nyxguard-vpn-agent --format '{{.Config.Image}}|{{.State.Health.Status}}' 2>/dev/null)" == "nyxmael/nyxguardmanager-vpn-agent:4.0.18|healthy" ]] && \
       [[ "$(docker exec nyxguard-db sh -c 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mariadb -N -uroot "$MYSQL_DATABASE" -e "SELECT count(*) FROM migrations"' 2>/dev/null)" == 41 ]]; then
      rm -f -- "$vpn_overlay"
    fi
    echo "ERROR: Major handover failed; inspect the recovery state before retrying." >&2
    reconcile_failed_major_state
    return 1
  fi
  # Keep the original installer and systemd path correct even when it reads
  # only docker-compose.yml rather than the handover worker's VPN override.
  if grep -q 'nyxmael/nyxguardmanager-vpn-agent:4.0.18' "$INSTALL_DIR/docker-compose.yml"; then
    sed 's|nyxmael/nyxguardmanager-vpn-agent:4.0.18|nyxmael/nyxguardmanager-vpn-agent:5.0.0|' \
      "$INSTALL_DIR/docker-compose.yml" > "$tmp/docker-compose.yml"
    chmod 600 "$tmp/docker-compose.yml"
    mv -- "$tmp/docker-compose.yml" "$INSTALL_DIR/docker-compose.yml"
  fi
  if [[ "$generated_overlay" == 1 ]]; then
    docker compose --env-file "$INSTALL_DIR/.env" -f "$INSTALL_DIR/docker-compose.yml" config -q
    rm -f -- "$vpn_overlay"
  fi
)

run_same_major_handover_502() (
  local tmp bootstrap vpn_installed
  tmp="$(mktemp -d)"
  chmod 700 "$tmp"
  trap 'rm -rf "$tmp"' EXIT
  bootstrap="$tmp/same-major-bootstrap.mjs"
  if [[ -n "${NYXGUARD_SAME_MAJOR_BOOTSTRAP_FILE:-}" ]]; then
    cp -- "$NYXGUARD_SAME_MAJOR_BOOTSTRAP_FILE" "$bootstrap"
  else
    curl -fsSL "$SAME_MAJOR_URL" -o "$bootstrap"
  fi
  if [[ "$(sha256sum "$bootstrap" | cut -d' ' -f1)" != "$SAME_MAJOR_SHA256" ]]; then
    echo "ERROR: Same-major bootstrap checksum mismatch; installation was not changed." >&2
    return 1
  fi
  chmod 600 "$bootstrap"
  # Runtime Compose labels, rather than host TUN availability, identify installed VPN.
  vpn_installed="$(docker ps -a --filter label=com.docker.compose.service=vpn-client-agent \
    --format '{{.Label "com.docker.compose.project.config_files"}}' | \
    while IFS= read -r files; do
      if [[ "${files%%,*}" == "$INSTALL_DIR/docker-compose.yml" ]]; then echo 1; fi
    done)"
  echo "Pulling $target_ref..."
  docker pull "$target_ref"
  if [[ -n "$vpn_installed" ]]; then
    echo "Pulling compatible $vpn_agent_ref..."
    docker pull "$vpn_agent_ref"
  fi
  docker run --rm --network none --user 0:0 --entrypoint node \
    --mount "type=bind,src=/var/run/docker.sock,dst=/var/run/docker.sock" \
    --mount "type=bind,src=$bootstrap,dst=/tmp/same-major-bootstrap.mjs,readonly" \
    -e CURRENT_VERSION=5.0.1 -e TARGET_VERSION=5.0.2 \
    -e "HOST_INSTALL_DIR=$INSTALL_DIR" \
    "$target_ref" /tmp/same-major-bootstrap.mjs
  # The immutable helper has verified health and persistence before config changes.
  update_compose_image_ref "$target_ref"
  if [[ -n "$vpn_installed" && -f "$INSTALL_DIR/docker-compose.vpn.yml" ]]; then
    write_vpn_compose_overlay "$vpn_agent_ref"
  fi
  echo "$target_tag" > "$INSTALL_DIR/.version"
  echo "Update complete. Now running: $target_ref"
)

main() {
  need_root
  require_commands
  require_install_files
  local lock_fd
  exec {lock_fd}>"${INSTALL_DIR}/.update.lock"
  if ! flock -n "$lock_fd"; then
    echo "ERROR: Another host-side update is running." >&2
    exit 1
  fi

  local current_ref current_repo current_tag latest_tag target_tag target_ref vpn_agent_ref vpn_enabled vpn_requested

  current_ref="$(read_current_image_ref)"
  if [[ -z "${current_ref}" ]]; then
    echo "ERROR: Could not detect current NyxGuard image in docker-compose.yml." >&2
    exit 1
  fi

  current_repo="${current_ref%:*}"
  current_tag="${current_ref##*:}"
  if [[ "${current_repo}" == "${current_ref}" ]]; then
    current_repo="${IMAGE_REPO}"
    current_tag="latest"
  fi

  if [[ -n "${FORCE_TAG}" ]]; then
    target_tag="${FORCE_TAG}"
  else
    echo "Checking Docker Hub for latest published NyxGuard Manager version..."
    latest_tag="$(dockerhub_latest_tag "${IMAGE_REPO}" "${current_tag}")"
    target_tag="${latest_tag}"
  fi

  target_ref="${IMAGE_REPO}:${target_tag}"
  local route
  route="$(upgrade_route "$current_tag" "$target_tag")"
  if [[ "$route" == unsupported ]]; then
    echo "ERROR: No supported upgrade path from ${current_tag} to ${target_tag}. Installation was not changed." >&2
    exit 1
  fi
  vpn_agent_ref="${VPN_AGENT_REPO}:$(vpn_agent_tag_for_manager "$target_tag")"
  if [[ "$route" == major_handover_500 ]]; then
    if [[ "$IMAGE_REPO" != nyxmael/nyxguardmanager || "$VPN_AGENT_REPO" != nyxmael/nyxguardmanager-vpn-agent ]]; then
      echo "ERROR: The verified 4.0.18 to 5.0.0 handover requires the published paired images." >&2
      exit 1
    fi
    confirm_update "$current_ref" "$target_ref" || exit 0
    docker pull "$target_ref"
    docker pull "$vpn_agent_ref"
    run_major_handover_500
    return
  fi
  if [[ "$current_tag" == 5.0.1 && "$target_tag" == 5.0.2 ]]; then
    if [[ "$IMAGE_REPO" != nyxmael/nyxguardmanager || "$VPN_AGENT_REPO" != nyxmael/nyxguardmanager-vpn-agent ]]; then
      echo "ERROR: Guarded handover requires the published compatible images." >&2
      exit 1
    fi
    confirm_update "$current_ref" "$target_ref" || exit 0
    run_same_major_handover_502
    return
  fi
  vpn_enabled=0
  vpn_requested=0
  if is_semver "${target_tag}" && version_at_least "${target_tag}" "4.0.14"; then
    vpn_requested=1
    if prepare_tun_device; then
      vpn_enabled=1
    elif [[ "${REQUIRE_VPN}" == "1" ]]; then
      print_tun_warning
      echo "ERROR: VPN Client is required but this host cannot provide /dev/net/tun." >&2
      exit 1
    else
      print_tun_warning
    fi
  fi

  if ! version_is_newer "${current_tag}" "${target_tag}"; then
    if [[ "${current_tag}" == "${target_tag}" && "${vpn_requested}" == "1" && "${NYXGUARD_REPAIR_VPN:-0}" == 1 ]]; then
      echo "NyxGuard Manager is already ${target_ref}; refreshing the image and repairing the VPN stack..."
      docker pull "${target_ref}"
      if [[ "${vpn_enabled}" == "1" ]]; then
        docker pull "${vpn_agent_ref}"
        write_vpn_compose_overlay "${vpn_agent_ref}"
        install_vpn_systemd_override
        start_vpn_stack
        echo "VPN agent stack is installed and running."
      else
        start_manager_without_vpn
        echo "Manager refresh complete. VPN Client remains disabled until /dev/net/tun is available."
      fi
      exit 0
    fi
    echo "No newer release found."
    echo "Current: ${current_ref}"
    echo "Latest : ${target_ref}"
    exit 0
  fi

  confirm_update "${current_ref}" "${target_ref}" || exit 0

  echo "Pulling ${target_ref}..."
  docker pull "${target_ref}"
  if [[ "${vpn_enabled}" == "1" ]]; then
    echo "Pulling ${vpn_agent_ref}..."
    docker pull "${vpn_agent_ref}"
  fi

  echo "Updating compose image reference..."
  update_compose_image_ref "${target_ref}"
  if [[ "${vpn_enabled}" == "1" ]]; then
    echo "Enabling the isolated WireGuard VPN agent..."
    write_vpn_compose_overlay "${vpn_agent_ref}"
    install_vpn_systemd_override
  fi
  echo "${target_tag}" >"${INSTALL_DIR}/.version"

  echo "Applying update (in-place, data preserved)..."
  if [[ "${vpn_enabled}" == "1" ]]; then
    start_vpn_stack
  else
    start_manager_without_vpn
  fi
  cleanup_previous_image "${current_ref}" "${target_ref}"

  echo ""
  echo "Update complete."
  echo "Now running: ${target_ref}"
}

main "$@"
