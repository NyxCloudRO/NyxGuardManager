#!/usr/bin/env bash
# NyxGuard Manager installer (Docker-only, auto-latest)
# Intended usage:
#   Root: curl -fsSL <install.sh-url> | bash
#   Sudo user: curl -fsSL <install.sh-url> | sudo bash
set -euo pipefail

INSTALL_DIR="${INSTALL_DIR:-/opt/nyxguardmanager}"
IMAGE_REPO="${IMAGE_REPO:-nyxmael/nyxguardmanager}"
VPN_AGENT_REPO="${VPN_AGENT_REPO:-nyxmael/nyxguardmanager-vpn-agent}"
INSTANCE="${NYXGUARD_INSTANCE:-nyxguard}"
VAULT_DIR="${NYXGUARD_VAULT_DIR:-/var/lib/nyxguard-licensing}"
HTTP_PORT="${NYXGUARD_HTTP_PORT:-80}"
HTTPS_PORT="${NYXGUARD_HTTPS_PORT:-443}"
ADMIN_PORT="${NYXGUARD_ADMIN_PORT:-8443}"
APP_TAG="${APP_TAG:-}" # Optional override (example: 5.0.3). If empty, auto-detect latest.
VPN_MODE="${NYXGUARD_VPN:-auto}" # auto, off, or required for fresh provisioning.
REQUIRE_VPN="${NYXGUARD_REQUIRE_VPN:-0}" # Set to 1 to abort when /dev/net/tun is unavailable.

vpn_agent_tag_for_manager() {
  case "$(normalize_semver "$1")" in
    5.0.9|5.0.8|5.0.7|5.0.6|5.0.5|5.0.4|5.0.3|5.0.2|5.0.1) echo 5.0.1 ;;
    5.0.0) echo 5.0.0 ;;
    4.0.14|4.0.15|4.0.16|4.0.17|4.0.18) normalize_semver "$1" ;;
    *) echo "ERROR: No published VPN compatibility contract for Manager $1." >&2; return 1 ;;
  esac
}

need_root() {
  if [[ "${EUID}" -ne 0 ]]; then
    if command -v sudo >/dev/null 2>&1; then
      echo "ERROR: Administrator privileges required. Download this script, then run: sudo bash /path/to/install.sh" >&2
    else
      echo "ERROR: Administrator privileges required and sudo is not installed. Log in as root (su -), then run: bash /path/to/install.sh" >&2
    fi
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
  local missing=() c
  for c in curl jq python3 flock tar; do
    if ! have_cmd "$c"; then
      case "$c" in flock) missing+=(util-linux) ;; *) missing+=("$c") ;; esac
    fi
  done
  if ! dpkg -s ca-certificates >/dev/null 2>&1; then missing+=(ca-certificates); fi
  if (( ${#missing[@]} )); then
    export DEBIAN_FRONTEND=noninteractive
    apt-get update -y
    apt-get install -y "${missing[@]}"
  fi
}

install_docker() {
  if have_cmd docker && (docker compose version >/dev/null 2>&1); then
    return
  fi

  echo "Installing Docker prerequisites..."
  apt-get update -y
  apt-get install -y gnupg ca-certificates

  if [[ -r /etc/os-release ]] && have_cmd dpkg; then
    # shellcheck source=/etc/os-release
    . /etc/os-release
    local arch codename os_id
    arch="$(dpkg --print-architecture)"
    codename="${VERSION_CODENAME:-}"
    os_id="${ID:-}"

    if [[ -n "${os_id}" && -n "${codename}" ]]; then
      mkdir -p /etc/apt/keyrings
      if curl -fsSL "https://download.docker.com/linux/${os_id}/gpg" | gpg --batch --yes --dearmor -o /etc/apt/keyrings/docker.gpg 2>/dev/null; then
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


  systemctl enable --now docker >/dev/null 2>&1 || true

  if ! have_cmd docker; then
    echo "ERROR: Docker install failed." >&2
    exit 1
  fi
  if ! (docker compose version >/dev/null 2>&1); then
    echo "ERROR: Docker Compose v2 plugin is required (docker-compose-plugin)." >&2
    exit 1
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

verify_tun_interface() {
  docker run --rm --network none --cap-add NET_ADMIN --device /dev/net/tun \
    --entrypoint sh "$1" -c 'ip tuntap add dev nyxprobe mode tun && ip tuntap del dev nyxprobe mode tun'
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
  echo "VPN Agent pending — TUN unavailable. /dev/net/tun could not be opened read/write."
  echo "Manager installation can continue when VPN is optional; VPN is not ready."
  if [[ "${virt}" == "lxc" && "$(uname -r)" == *-pve ]]; then
    echo "Detected LXC on a Proxmox kernel. On the Proxmox host, verify the guest CTID"
    echo "and back up its configuration, then expose only the TUN device:"
    echo "  pct set <CTID> --dev0 path=/dev/net/tun,mode=0666"
    echo "Use a free dev slot if dev0 is already assigned. Keep the guest unprivileged."
    echo "Restart only that guest if needed, and verify TUN can be opened inside it."
  else
    echo "Guest-side TUN preparation did not produce a usable device."
    echo "For a restricted container, its host must expose usable TUN character device 10:200."
    echo "For a VM or bare-metal host, check its kernel TUN support and device access."
  fi
  echo "Once TUN is usable, follow the VPN Agent activation section in docs/vpn-client.md."
  echo ""
}

dockerhub_latest_tag() {
  local release version
  release="$(curl -fsSL --retry 2 --max-time 30 https://api.github.com/repos/NyxCloudRO/NyxGuardManager/releases/latest)"
  [[ "$(jq -r '.draft or .prerelease' <<<"$release")" == false ]] || { echo 'ERROR: No eligible stable release.' >&2; return 1; }
  version="$(jq -r '.tag_name' <<<"$release")"
  is_semver "$version" || { echo 'ERROR: Published version is invalid.' >&2; return 1; }
  normalize_semver "$version"
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

ensure_socket_gid() {
  local docker_sock_gid
  docker_sock_gid="$(stat -c '%g' /var/run/docker.sock)"
  if [[ ! "${docker_sock_gid}" =~ ^[0-9]+$ ]]; then
    echo "ERROR: Cannot determine Docker socket group." >&2
    exit 1
  fi
  if grep -q '^DOCKER_SOCK_GID=' "${INSTALL_DIR}/.env"; then
    sed -i "s/^DOCKER_SOCK_GID=.*/DOCKER_SOCK_GID=${docker_sock_gid}/" "${INSTALL_DIR}/.env"
  else
    printf 'DOCKER_SOCK_GID=%s\n' "${docker_sock_gid}" >> "${INSTALL_DIR}/.env"
  fi
  chmod 600 "${INSTALL_DIR}/.env"
}

ensure_vault_key() {
  local vault_dir="$VAULT_DIR"
  local vault_file=${vault_dir}/vault.key
  local app_uid app_gid
  app_uid="$(sed -n 's/^PUID=//p' "${INSTALL_DIR}/.env" | tail -n 1)"
  app_gid="$(sed -n 's/^PGID=//p' "${INSTALL_DIR}/.env" | tail -n 1)"
  if [[ ! "${app_uid}" =~ ^[1-9][0-9]*$ || ! "${app_gid}" =~ ^[1-9][0-9]*$ ]]; then
    echo "ERROR: Invalid PUID/PGID for licensing vault." >&2
    exit 1
  fi
  install -d -m 0700 "${vault_dir}"
  if [[ -L "${vault_file}" ]]; then
    echo "ERROR: Licensing vault key must be a regular file, not a symlink." >&2
    exit 1
  fi
  if [[ ! -e "${vault_file}" ]]; then
    umask 077
    ( set -o noclobber; head -c 32 /dev/urandom > "${vault_file}" )
  fi
  if [[ ! -f "${vault_file}" || "$(stat -c %s "${vault_file}")" != 32 || "$(stat -c %a "${vault_file}")" != 600 ]]; then
    echo "ERROR: Existing licensing vault key is invalid; refusing replacement." >&2
    exit 1
  fi
  chown "${app_uid}:${app_gid}" "${vault_file}"
}

write_compose_file() {
  local image_ref="$1"
  local vpn_agent_ref="$2"

  cat >"${INSTALL_DIR}/docker-compose.yml" <<'YAML'
services:
  nyxguard-manager:
    container_name: __INSTANCE__-manager
    image: __IMAGE_REF__
    restart: unless-stopped
    ports:
      - "__HTTP_PORT__:80"
      - "__HTTPS_PORT__:443"
      - "__ADMIN_PORT__:8443"
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
      NYXCLOUD_LICENSE_VAULT_KEY_PATH: "/run/nyxguard-licensing/vault.key"
      NYXCLOUD_AUTHORITY_URL: "https://licensing.nyxcloud.ro"
      NYXCLOUD_SUPPORT_URL: "https://support-storage.nyxcloud.ro"
      NYXGUARD_VPN_AGENT_URL: "http://127.0.0.1:3198"
      NYXGUARD_VPN_AGENT_TOKEN_PATH: "/run/nyxguard-vpn-auth/token"
    # Manager readiness is inherited from the accepted image.
    group_add:
      - "${DOCKER_SOCK_GID:?Set DOCKER_SOCK_GID to the numeric GID of /var/run/docker.sock}"
    volumes:
      - nyxguard_data:/data
      - nyxguard_letsencrypt:/etc/letsencrypt
      - /var/run/docker.sock:/var/run/docker.sock:ro
      - /etc/localtime:/etc/localtime:ro
      - /proc/1/net/arp:/host/proc/net/arp:ro
      - nyxguard_vpn_auth:/run/nyxguard-vpn-auth:ro
      - __VAULT_DIR__/vault.key:/run/nyxguard-licensing/vault.key:ro
    depends_on:
      - db

  vpn-client-agent:
    container_name: __INSTANCE__-vpn-agent
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
    container_name: __INSTANCE__-db
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
    name: __INSTANCE___data
  nyxguard_letsencrypt:
    name: __INSTANCE___letsencrypt
  nyxguard_db:
    name: __INSTANCE___db
  nyxguard_vpn:
    name: __INSTANCE___vpn
  nyxguard_vpn_auth:
    name: __INSTANCE___vpn_auth
YAML

  sed -i "s|__INSTANCE__|${INSTANCE}|g;s|__VAULT_DIR__|${VAULT_DIR}|g;s|__HTTP_PORT__|${HTTP_PORT}|g;s|__HTTPS_PORT__|${HTTPS_PORT}|g;s|__ADMIN_PORT__|${ADMIN_PORT}|g" "${INSTALL_DIR}/docker-compose.yml"
  sed -i "s|__IMAGE_REF__|${image_ref}|g" "${INSTALL_DIR}/docker-compose.yml"
  sed -i "s|__VPN_AGENT_IMAGE_REF__|${vpn_agent_ref}|g" "${INSTALL_DIR}/docker-compose.yml"
}

write_version_file() {
  local tag="$1"
  echo "${tag}" >"${INSTALL_DIR}/.version"
}

install_systemd_unit() {
  local vpn_enabled="$1"
  local services=" nyxguard-manager db vpn-client-agent"
  if [[ "${vpn_enabled}" != "1" ]]; then
    services=" nyxguard-manager db"
  fi

  cat >/etc/systemd/system/${INSTANCE}manager.service <<UNIT
[Unit]
Description=NyxGuard Manager (Docker Compose)
Requires=docker.service
After=docker.service network-online.target
Wants=network-online.target

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=${INSTALL_DIR}
ExecStart=/usr/bin/docker compose --env-file ${INSTALL_DIR}/.env -f ${INSTALL_DIR}/docker-compose.yml up -d --no-recreate --remove-orphans${services}
ExecStop=/usr/bin/docker compose --env-file ${INSTALL_DIR}/.env -f ${INSTALL_DIR}/docker-compose.yml stop
TimeoutStartSec=0

[Install]
WantedBy=multi-user.target
UNIT

  systemctl daemon-reload
  systemctl enable --now "${INSTANCE}manager.service"
}

wait_for_manager_vpn_agent() {
  local attempt
  for attempt in {1..20}; do
    if docker exec "${INSTANCE}-manager" node -e '
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
  [[ "$VPN_MODE" == auto || "$VPN_MODE" == off || "$VPN_MODE" == required ]] || { echo "ERROR: NYXGUARD_VPN must be auto, off, or required." >&2; return 1; }
  [[ "$VPN_MODE" != required ]] || REQUIRE_VPN=1
  [[ "$INSTANCE" =~ ^[a-z][a-z0-9_-]{0,40}$ ]] || { echo "ERROR: Invalid installation instance." >&2; return 1; }
  [[ "$VAULT_DIR" =~ ^/[A-Za-z0-9_./-]+$ && "$VAULT_DIR" != *".."* ]] || { echo "ERROR: Invalid vault directory." >&2; return 1; }
  for port in "$HTTP_PORT" "$HTTPS_PORT" "$ADMIN_PORT"; do [[ "$port" =~ ^[0-9]+$ && "$port" -ge 1 && "$port" -le 65535 ]] || { echo "ERROR: Invalid service port." >&2; return 1; }; done
  if [[ -f "$INSTALL_DIR/docker-compose.yml" ]]; then
    echo "Existing installation retained. Use update.sh for guarded upgrades or same-version checks." >&2
    return 1
  fi
  # Fail before changing packages on unsupported hosts.
  . /etc/os-release
  [[ "${ID:-}" == debian || "${ID:-}" == ubuntu ]] || { echo "ERROR: Supported distributions are Debian and Ubuntu." >&2; return 1; }
  [[ -d /run/systemd/system ]] && have_cmd systemctl || { echo "ERROR: A running systemd host is required." >&2; return 1; }
  install_base_packages
  install_docker
  if [[ -e "$VAULT_DIR/vault.key" ]] || docker volume ls --format '{{.Name}}' | grep -qx "${INSTANCE}_data"; then
    echo 'ERROR: Existing persistent NyxGuard storage found. Use update.sh; fresh installation cannot replace its identity.' >&2
    return 1
  fi
  ensure_install_dir
  ensure_env

  local selected_tag image_ref vpn_agent_ref vpn_enabled
  if [[ -n "${APP_TAG}" ]]; then
    selected_tag="${APP_TAG}"
  else
    echo "Detecting latest stable NyxGuard Manager release from GitHub..."
    selected_tag="$(dockerhub_latest_tag "${IMAGE_REPO}")"
  fi

  image_ref="${IMAGE_REPO}:${selected_tag}"
  vpn_agent_ref=""
  vpn_enabled=0
  if [[ "$VPN_MODE" != off ]] && is_semver "${selected_tag}" && version_at_least "${selected_tag}" "4.0.14"; then
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

  if [[ -n "${NYXGUARD_ACCEPTED_IMAGE_ID:-}" ]]; then
    [[ "$NYXGUARD_ACCEPTED_IMAGE_ID" =~ ^sha256:[a-f0-9]{64}$ && "$(docker image inspect -f '{{.Id}}' "$image_ref")" == "$NYXGUARD_ACCEPTED_IMAGE_ID" ]] || { echo "ERROR: Prefetched target artifact differs." >&2; return 1; }
  else
    docker pull "$image_ref"
  fi
  [[ "$(docker image inspect -f '{{index .Config.Labels "org.opencontainers.image.version"}}' "$image_ref")" == "${selected_tag#v}" ]] || { echo "ERROR: Target artifact version differs." >&2; return 1; }
  docker run --rm --network none --no-healthcheck --entrypoint node -e ACCEPTED_VERSION="${selected_tag#v}" "$image_ref" -e 'const fs=require("fs");if(JSON.parse(fs.readFileSync("/app/package.json")).version!==process.env.ACCEPTED_VERSION||process.env.NPM_BUILD_VERSION!==process.env.ACCEPTED_VERSION)process.exit(1)' || { echo "ERROR: Target runtime version identity differs." >&2; return 1; }
  local policy_agent
  policy_agent="$(docker run --rm --network none --no-healthcheck --entrypoint node "$image_ref" -e 'try {const p=require("/app/internal/release-policy.json");if(p.version!==process.env.NPM_BUILD_VERSION)process.exit(1);console.log(p.agent)}catch(e){process.exit(2)}')" || policy_agent="$(vpn_agent_tag_for_manager "$selected_tag")"
  is_semver "$policy_agent" || { echo 'ERROR: No valid Agent compatibility contract.' >&2; return 1; }
  vpn_agent_ref="${VPN_AGENT_REPO}:${policy_agent}"
  if [[ "$vpn_enabled" == 1 ]]; then
    docker pull "$vpn_agent_ref"
    if ! verify_tun_interface "$vpn_agent_ref"; then
      print_tun_warning
      [[ "$REQUIRE_VPN" != 1 ]] || { echo "ERROR: TUN interface creation failed." >&2; return 1; }
      vpn_enabled=0
    fi
  fi
  ensure_socket_gid
  ensure_vault_key

  write_compose_file "${image_ref}" "${vpn_agent_ref}"
  write_version_file "${selected_tag}"


  echo "Starting stack..."
  if [[ "${vpn_enabled}" == "1" ]]; then
    start_vpn_stack
  else
    docker compose --env-file "${INSTALL_DIR}/.env" -f "${INSTALL_DIR}/docker-compose.yml" up -d --remove-orphans nyxguard-manager db
  fi

  local ready=0 attempt
  for attempt in {1..150}; do
    if [[ "$(docker inspect -f '{{.State.Health.Status}}' "${INSTANCE}-manager")" == healthy ]] &&
       docker exec "${INSTANCE}-db" sh -c 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysqladmin ping -uroot --silent' >/dev/null 2>&1; then
      ready=1; break
    fi
    sleep 2
  done
  [[ "$ready" == 1 ]] || { echo 'ERROR: Manager/database readiness failed.' >&2; return 1; }
  docker exec "${INSTANCE}-manager" nginx -t >/dev/null 2>&1
  install_systemd_unit "${vpn_enabled}"

  local host_ip
  host_ip="$(hostname -I 2>/dev/null | awk '{print $1}')"

  echo
  echo "============================================================"
  echo "  Install complete."
  echo "  NyxGuard Manager ${selected_tag} is up and running."
  if [[ "${vpn_enabled}" == "1" ]]; then
    echo "  VPN Agent installed; Manager-to-Agent API verified."
  elif [[ "$VPN_MODE" == off ]]; then
    echo "  Manager-only installation selected; VPN Agent is not installed."
  elif is_semver "${selected_tag}" && version_at_least "${selected_tag}" "4.0.14"; then
    echo "  VPN Agent pending — TUN unavailable. VPN is not ready."
    echo "  After TUN is usable, follow the documented VPN Agent activation procedure."
  fi
  echo ""
  echo "  Access the admin panel at:"
  echo "  https://${host_ip}:${ADMIN_PORT}/"
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
