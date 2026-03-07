#!/usr/bin/env bash
# NyxGuard Manager installer (Docker-only, auto-latest)
# Intended usage:
#   curl -fsSL <install.sh-url> | sudo bash
set -euo pipefail

INSTALL_DIR="${INSTALL_DIR:-/opt/nyxguardmanager}"
IMAGE_REPO="${IMAGE_REPO:-nyxmael/nyxguardmanager}"
APP_TAG="${APP_TAG:-}" # Optional override (example: 4.0.0). If empty, auto-detect latest.

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

ensure_install_dir() {
  mkdir -p "${INSTALL_DIR}"
  chmod 755 "${INSTALL_DIR}" || true
}

ensure_env() {
  if [[ -f "${INSTALL_DIR}/.env" ]]; then
    return
  fi

  local db_pass root_pass
  db_pass="$(rand32)"
  root_pass="$(rand32)"

  cat >"${INSTALL_DIR}/.env" <<ENV
TZ=UTC
PUID=1000
PGID=1000

DB_MYSQL_USER=nyxguard
DB_MYSQL_NAME=nyxguard
DB_MYSQL_PASSWORD=${db_pass}
MYSQL_ROOT_PASSWORD=${root_pass}
ENV

  chmod 600 "${INSTALL_DIR}/.env" || true
}

write_compose_file() {
  local image_ref="$1"

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
    healthcheck:
      test: ["CMD", "curl", "-fs", "http://localhost:3000/"]
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 60s
    volumes:
      - nyxguard_data:/data
      - nyxguard_letsencrypt:/etc/letsencrypt
      - /var/run/docker.sock:/var/run/docker.sock:ro
      - /etc/localtime:/etc/localtime:ro
      - /proc/1/net/arp:/host/proc/net/arp:ro
    depends_on:
      - db

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
YAML

  sed -i "s|__IMAGE_REF__|${image_ref}|g" "${INSTALL_DIR}/docker-compose.yml"
}

write_version_file() {
  local tag="$1"
  echo "${tag}" >"${INSTALL_DIR}/.version"
}

install_systemd_unit() {
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
ExecStart=/usr/bin/docker compose --env-file ${INSTALL_DIR}/.env -f ${INSTALL_DIR}/docker-compose.yml up -d --remove-orphans
ExecStop=/usr/bin/docker compose --env-file ${INSTALL_DIR}/.env -f ${INSTALL_DIR}/docker-compose.yml down
TimeoutStartSec=0

[Install]
WantedBy=multi-user.target
UNIT

  systemctl daemon-reload
  systemctl enable --now nyxguardmanager.service
}

main() {
  need_root
  install_base_packages
  install_docker
  ensure_install_dir
  ensure_env

  local selected_tag image_ref
  if [[ -n "${APP_TAG}" ]]; then
    selected_tag="${APP_TAG}"
  else
    echo "Detecting latest published NyxGuard Manager image tag from Docker Hub..."
    selected_tag="$(dockerhub_latest_tag "${IMAGE_REPO}")"
  fi

  image_ref="${IMAGE_REPO}:${selected_tag}"
  echo "Using image: ${image_ref}"

  write_compose_file "${image_ref}"
  write_version_file "${selected_tag}"

  echo "Pulling image..."
  docker pull "${image_ref}"

  echo "Starting stack..."
  docker compose --env-file "${INSTALL_DIR}/.env" -f "${INSTALL_DIR}/docker-compose.yml" up -d

  install_systemd_unit

  echo
  echo "Install complete."
  echo "NyxGuard Manager image: ${image_ref}"
  echo "Data is stored in Docker volumes (nyxguard_data, nyxguard_letsencrypt, nyxguard_db)."
}

main "$@"
