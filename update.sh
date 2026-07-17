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
      if is_semver "${tag}"; then
        semver_tags+="${tag}"$'\n'
      fi
    done < <(echo "${json}" | jq -r '.results[].name')

    next="$(echo "${json}" | jq -r '.next')"
    url="${next}"
  done

  if [[ -z "${semver_tags}" ]]; then
    echo "latest"
    return 0
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
  for c in curl jq docker; do
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
  docker compose --env-file "${INSTALL_DIR}/.env" -f "${INSTALL_DIR}/docker-compose.yml" up -d --remove-orphans
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

main() {
  need_root
  require_commands
  require_install_files

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
    latest_tag="$(dockerhub_latest_tag "${IMAGE_REPO}")"
    target_tag="${latest_tag}"
  fi

  target_ref="${IMAGE_REPO}:${target_tag}"
  vpn_agent_ref="${VPN_AGENT_REPO}:${target_tag}"
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
    if [[ "${current_tag}" == "${target_tag}" && "${vpn_requested}" == "1" ]]; then
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
