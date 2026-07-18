#!/usr/bin/env bash
# NyxGuard Manager installer (Docker-only, auto-latest)
# Intended usage:
#   curl -fsSL <install.sh-url> | sudo bash
set -euo pipefail

INSTALL_DIR="${INSTALL_DIR:-/opt/nyxguardmanager}"
IMAGE_REPO="${IMAGE_REPO:-nyxmael/nyxguardmanager}"
VPN_AGENT_REPO="${VPN_AGENT_REPO:-nyxmael/nyxguardmanager-vpn-agent}"
APP_TAG="${APP_TAG:-}" # Optional override (example: 4.0.15). If empty, auto-detect latest.
NYXGUARD_PROMETHEUS_SCRAPER_IP="${NYXGUARD_PROMETHEUS_SCRAPER_IP:-}"
REQUIRE_VPN="${NYXGUARD_REQUIRE_VPN:-0}" # Set to 1 to abort when /dev/net/tun is unavailable.

need_root() {
  if [[ "${EUID}" -ne 0 ]]; then
    echo "ERROR: Run as root (or with sudo)." >&2
    exit 1
  fi
}

have_cmd() { command -v "$1" >/dev/null 2>&1; }

rand32() {
  tr -dc 'A-Za-z0-9' </dev/urandom | head -c 32 || true
}

require_apt() {
  if ! have_cmd apt-get; then
    echo "ERROR: This installer currently supports Debian/Ubuntu (apt-get)." >&2
    exit 1
  fi
}

install_base_packages() {
  require_apt
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -y
  apt-get install -y ca-certificates curl jq gnupg
}

install_docker() {
  if have_cmd docker && (docker compose version >/dev/null 2>&1 || have_cmd docker-compose); then
    return
  fi

  echo "Installing Docker..."

  if [[ -r /etc/os-release ]] && have_cmd dpkg; then
    # shellcheck source=/etc/os-release
    . /etc/os-release
    local arch codename os_id
    arch="$(dpkg --print-architecture)"
    codename="${VERSION_CODENAME:-}"
    os_id="${ID:-}"

    if [[ -n "${os_id}" && -n "${codename}" ]]; then
      mkdir -p /etc/apt/keyrings
      if curl -fsSL "https://download.docker.com/linux/${os_id}/gpg" | gpg --dearmor -o /etc/apt/keyrings/docker.gpg 2>/dev/null; then
        chmod a+r /etc/apt/keyrings/docker.gpg || true
        cat >/etc/apt/sources.list.d/docker.list <<SRC

deb [arch=${arch} signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/${os_id} ${codename} stable
SRC
        apt-get update -y
        apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin || true
        apt-get install -y docker-compose-plugin || true
      fi
    fi
  fi

  if ! have_cmd docker; then
    apt-get install -y docker.io || true
  fi

  if ! (docker compose version >/dev/null 2>&1); then
    apt-get install -y docker-compose-plugin || true
  fi

  if ! (docker compose version >/dev/null 2>&1) && ! have_cmd docker-compose; then
    apt-get install -y docker-compose || true
  fi

  systemctl enable --now docker >/dev/null 2>&1 || true

  if ! have_cmd docker; then
    echo "ERROR: Docker install failed." >&2
    exit 1
  fi
  if ! (docker compose version >/dev/null 2>&1 || have_cmd docker-compose); then
    echo "ERROR: Docker Compose is not available." >&2
    exit 1
  fi
}

install_node_exporter() {
  require_apt

  if ! dpkg -s prometheus-node-exporter >/dev/null 2>&1; then
    echo "Installing Prometheus node exporter for Grafana system metrics..."
    apt-get install -y prometheus-node-exporter
  fi

  systemctl enable --now prometheus-node-exporter >/dev/null 2>&1 || true
  systemctl enable --now node_exporter >/dev/null 2>&1 || true

  if [[ -n "${NYXGUARD_PROMETHEUS_SCRAPER_IP}" ]] && have_cmd ufw && ufw status | grep -q "Status: active"; then
    ufw allow from "${NYXGUARD_PROMETHEUS_SCRAPER_IP}" to any port 9100 proto tcp comment "Prometheus node_exporter scrape" >/dev/null || true
  fi
}

is_semver() {
  [[ "$1" =~ ^v?[0-9]+\.[0-9]+\.[0-9]+$ ]]
}

normalize_semver() {
  local t="$1"
  echo "${t#v}"
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
  echo "WARNING: /dev/net/tun is unavailable. NyxGuard Manager will be installed,"
  echo "but WireGuard VPN Client will remain disabled until the host exposes TUN."
  if [[ "${virt}" == "lxc" ]]; then
    echo "Detected Proxmox/LXC. Configure the Proxmox HOST with:"
    echo "  modprobe tun"
    echo "  lxc.cgroup2.devices.allow: c 10:200 rwm"
    echo "  lxc.mount.entry: /dev/net/tun dev/net/tun none bind,create=file"
    echo "Restart the LXC container, then run update.sh to enable VPN Client."
  else
    echo "Load TUN on the host (modprobe tun), verify /dev/net/tun, then run update.sh."
  fi
  echo ""
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

ensure_install_dir() {
  mkdir -p "${INSTALL_DIR}"
  chmod 755 "${INSTALL_DIR}" || true
}

ensure_env() {
  if [[ -f "${INSTALL_DIR}/.env" ]]; then
    return
  fi

  local db_pass root_pass docker_sock_gid
  db_pass="$(rand32)"
  root_pass="$(rand32)"
  docker_sock_gid="$(stat -c '%g' /var/run/docker.sock 2>/dev/null || echo 988)"

  cat >"${INSTALL_DIR}/.env" <<ENV
TZ=UTC
PUID=1000
PGID=${docker_sock_gid}
DOCKER_SOCK_GID=${docker_sock_gid}

DB_MYSQL_USER=nyxguard
DB_MYSQL_NAME=nyxguard
DB_MYSQL_PASSWORD=${db_pass}
MYSQL_ROOT_PASSWORD=${root_pass}
ENV

  chmod 600 "${INSTALL_DIR}/.env" || true
}

write_compose_file() {
  local image_ref="$1"
  local vpn_agent_ref="$2"

  cat >"${INSTALL_DIR}/docker-compose.yml" <<'YAML'
services:
  nyxguard-manager:
    container_name: nyxguard-manager
    image: __IMAGE_REF__
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
      - "8443:8443"
    environment:
      TZ: "${TZ:-UTC}"
      PUID: "${PUID:-1000}"
      PGID: "${PGID:-1000}"
      DB_MYSQL_HOST: "db"
      DB_MYSQL_PORT: "3306"
      DB_MYSQL_USER: "${DB_MYSQL_USER:-nyxguard}"
      DB_MYSQL_PASSWORD: "${DB_MYSQL_PASSWORD}"
      DB_MYSQL_NAME: "${DB_MYSQL_NAME:-nyxguard}"
      SKIP_CERTBOT_OWNERSHIP: "true"
      NYXGUARD_VPN_AGENT_URL: "http://127.0.0.1:3198"
      NYXGUARD_VPN_AGENT_TOKEN_PATH: "/run/nyxguard-vpn-auth/token"
    healthcheck:
      test: ["CMD", "curl", "-fs", "http://localhost:3000/"]
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 60s
    group_add:
      - "${DOCKER_SOCK_GID:-988}"
    volumes:
      - nyxguard_data:/data
      - nyxguard_letsencrypt:/etc/letsencrypt
      - /var/run/docker.sock:/var/run/docker.sock:ro
      - /etc/localtime:/etc/localtime:ro
      - /proc/1/net/arp:/host/proc/net/arp:ro
      - nyxguard_vpn_auth:/run/nyxguard-vpn-auth:ro
    depends_on:
      - db

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

  db:
    container_name: nyxguard-db
    image: jc21/mariadb-aria:latest
    restart: unless-stopped
    environment:
      TZ: "${TZ:-UTC}"
      MYSQL_ROOT_PASSWORD: "${MYSQL_ROOT_PASSWORD}"
      MYSQL_DATABASE: "${DB_MYSQL_NAME:-nyxguard}"
      MYSQL_USER: "${DB_MYSQL_USER:-nyxguard}"
      MYSQL_PASSWORD: "${DB_MYSQL_PASSWORD}"
    volumes:
      - nyxguard_db:/var/lib/mysql
      - /etc/localtime:/etc/localtime:ro

volumes:
  nyxguard_data:
    name: nyxguard_data
  nyxguard_letsencrypt:
    name: nyxguard_letsencrypt
  nyxguard_db:
    name: nyxguard_db
  nyxguard_vpn:
    name: nyxguard_vpn
  nyxguard_vpn_auth:
    name: nyxguard_vpn_auth
YAML

  sed -i "s|__IMAGE_REF__|${image_ref}|g" "${INSTALL_DIR}/docker-compose.yml"
  sed -i "s|__VPN_AGENT_IMAGE_REF__|${vpn_agent_ref}|g" "${INSTALL_DIR}/docker-compose.yml"
}

write_version_file() {
  local tag="$1"
  echo "${tag}" >"${INSTALL_DIR}/.version"
}

install_systemd_unit() {
  local vpn_enabled="$1"
  local services=""
  if [[ "${vpn_enabled}" != "1" ]]; then
    services=" nyxguard-manager db"
  fi

  cat >/etc/systemd/system/nyxguardmanager.service <<UNIT
[Unit]
Description=NyxGuard Manager (Docker Compose)
Requires=docker.service
After=docker.service network-online.target
Wants=network-online.target

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=${INSTALL_DIR}
ExecStart=/usr/bin/docker compose --env-file ${INSTALL_DIR}/.env -f ${INSTALL_DIR}/docker-compose.yml up -d --remove-orphans${services}
ExecStop=/usr/bin/docker compose --env-file ${INSTALL_DIR}/.env -f ${INSTALL_DIR}/docker-compose.yml down
TimeoutStartSec=0

[Install]
WantedBy=multi-user.target
UNIT

  systemctl daemon-reload
  systemctl enable --now nyxguardmanager.service
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
  docker compose --env-file "${INSTALL_DIR}/.env" -f "${INSTALL_DIR}/docker-compose.yml" up -d
  docker compose --env-file "${INSTALL_DIR}/.env" -f "${INSTALL_DIR}/docker-compose.yml" up -d --no-deps --force-recreate vpn-client-agent
  wait_for_manager_vpn_agent
}

main() {
  need_root
  install_base_packages
  install_docker
  install_node_exporter
  ensure_install_dir
  ensure_env

  local selected_tag image_ref vpn_agent_ref vpn_enabled
  if [[ -n "${APP_TAG}" ]]; then
    selected_tag="${APP_TAG}"
  else
    echo "Detecting latest published NyxGuard Manager image tag from Docker Hub..."
    selected_tag="$(dockerhub_latest_tag "${IMAGE_REPO}")"
  fi

  image_ref="${IMAGE_REPO}:${selected_tag}"
  vpn_agent_ref="${VPN_AGENT_REPO}:${selected_tag}"
  vpn_enabled=0
  if is_semver "${selected_tag}" && version_at_least "${selected_tag}" "4.0.14"; then
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
  echo "Using image: ${image_ref}"

  write_compose_file "${image_ref}" "${vpn_agent_ref}"
  write_version_file "${selected_tag}"

  echo "Pulling images..."
  docker pull "${image_ref}"
  if [[ "${vpn_enabled}" == "1" ]]; then
    docker pull "${vpn_agent_ref}"
  fi

  echo "Starting stack..."
  if [[ "${vpn_enabled}" == "1" ]]; then
    start_vpn_stack
  else
    docker compose --env-file "${INSTALL_DIR}/.env" -f "${INSTALL_DIR}/docker-compose.yml" up -d --remove-orphans nyxguard-manager db
  fi

  install_systemd_unit "${vpn_enabled}"

  local host_ip
  host_ip="$(hostname -I 2>/dev/null | awk '{print $1}')"

  echo
  echo "============================================================"
  echo "  Install complete."
  echo "  NyxGuard Manager ${selected_tag} is up and running."
  echo ""
  echo "  Access the admin panel at:"
  echo "  https://${host_ip}:8443/"
  echo ""
  echo "  Note: The admin panel uses a self-signed certificate on"
  echo "  first launch. Your browser will show a security warning"
  echo "  -- accept it to proceed."
  echo ""
  echo "  Data is stored in Docker volumes and will be preserved"
  echo "  across updates."
  echo "============================================================"
  echo
}

main "$@"
