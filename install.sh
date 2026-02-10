#!/usr/bin/env bash
# NyxGuard Manager v3.0.2 (stamp 2026-02-10T23:55:00Z)
set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/NyxCloudRO/NyxGuardManager.git}"
REF="${REF:-main}"
INSTALL_DIR="${INSTALL_DIR:-/opt/nyxguardmanager}"
# Default published image (Docker Hub). Override if you publish elsewhere.
IMAGE_REPO="${IMAGE_REPO:-nyxmael/nyxguardmanager}"
# App version used for the local Docker image tag.
# Note: do NOT rely on a variable named VERSION because /etc/os-release defines VERSION
# (e.g. Debian "13 (trixie)"), which would break Docker tag formatting.
DEFAULT_APP_VERSION="3.0.2"
APP_VERSION="${APP_VERSION:-${VERSION:-${DEFAULT_APP_VERSION}}}"

need_root() {
  if [[ "${EUID}" -ne 0 ]]; then
    echo "ERROR: Run as root (or with sudo)." >&2
    exit 1
  fi
}

have_cmd() { command -v "$1" >/dev/null 2>&1; }

wait_http_200() {
  local url="$1"
  local timeout_s="${2:-120}"

  if ! have_cmd curl; then
    # Installer already installs curl, but don't hard-fail if user modified it.
    return 0
  fi

  local start
  start="$(date +%s)"

  while true; do
    # Don't let failures trip `set -e`.
    local code="000"
    code="$(curl -fsS -o /dev/null -m 2 -w '%{http_code}' "${url}" 2>/dev/null || true)"
    if [[ "${code}" == "200" ]]; then
      return 0
    fi

    local now elapsed
    now="$(date +%s)"
    elapsed=$((now - start))
    if (( elapsed >= timeout_s )); then
      echo "WARN: Timed out waiting for ${url} to become ready (${timeout_s}s)."
      return 1
    fi

    sleep 2
  done
}

set_compose_image() {
  local compose_file="$1"
  local image="$2"

  [[ -f "${compose_file}" ]] || return 0

  # Keep this portable across sed variants by using awk + atomic replace.
  local tmp
  tmp="$(mktemp)"
  awk -v img="${image}" '
    {
      if ($0 ~ /^[[:space:]]*image:[[:space:]]*/ && $0 ~ /nyxguardmanager:/) {
        match($0, /^[[:space:]]*/)
        indent = substr($0, RSTART, RLENGTH)
        $0 = indent "image: " img
      }
      print
    }
  ' "${compose_file}" > "${tmp}"
  mv -f "${tmp}" "${compose_file}"
}

rand() {
  # 32 chars, URL-safe-ish
  tr -dc 'A-Za-z0-9' </dev/urandom | head -c 32 || true
}

install_packages() {
  if ! have_cmd apt-get; then
    echo "ERROR: This installer currently supports Debian/Ubuntu (apt-get)." >&2
    exit 1
  fi

  export DEBIAN_FRONTEND=noninteractive
  apt-get update -y
  apt-get install -y ca-certificates curl git rsync jq gnupg
}

install_docker() {
  if have_cmd docker && (docker compose version >/dev/null 2>&1 || have_cmd docker-compose); then
    return
  fi

  echo "Installing Docker..."

  # Prefer Docker's official apt repository (more likely to have compose v2 plugin)
  # Fallback to distro packages if this fails.
  if [[ -r /etc/os-release ]] && have_cmd dpkg; then
    . /etc/os-release
    arch="$(dpkg --print-architecture)"
    codename="${VERSION_CODENAME:-}"
    os_id="${ID:-}"

    if [[ -n "${os_id}" && -n "${codename}" ]]; then
      mkdir -p /etc/apt/keyrings
      if curl -fsSL "https://download.docker.com/linux/${os_id}/gpg" | gpg --dearmor -o /etc/apt/keyrings/docker.gpg 2>/dev/null; then
        chmod a+r /etc/apt/keyrings/docker.gpg || true
        cat > /etc/apt/sources.list.d/docker.list <<EOF
deb [arch=${arch} signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/${os_id} ${codename} stable
EOF
        apt-get update -y
        if apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin; then
          # Compose v2 plugin is optional; some mirrors/distros might not have it.
          apt-get install -y docker-compose-plugin || true
          systemctl enable --now docker >/dev/null 2>&1 || true
          if docker compose version >/dev/null 2>&1 || have_cmd docker-compose; then
            return
          fi
        fi
      fi
    fi
  fi

  # Fallback: distro packages
  apt-get install -y docker.io || true
  # Some distros don't have docker-compose-plugin in their repo.
  if apt-cache show docker-compose-plugin >/dev/null 2>&1; then
    apt-get install -y docker-compose-plugin || true
  fi
  # Final fallback: docker-compose v1 package (we'll use docker-compose command if present).
  if ! (docker compose version >/dev/null 2>&1); then
    apt-get install -y docker-compose || true
  fi
  # Extra fallback: pip docker-compose (v1). Useful on some minimal distros.
  if ! (docker compose version >/dev/null 2>&1) && ! have_cmd docker-compose; then
    apt-get install -y python3-pip python3-setuptools python3-wheel || true
    if have_cmd pip3; then
      pip3 install --no-cache-dir docker-compose || true
    fi
  fi

  systemctl enable --now docker >/dev/null 2>&1 || true

  if ! have_cmd docker; then
    echo "ERROR: Docker install failed." >&2
    exit 1
  fi
  if ! (docker compose version >/dev/null 2>&1 || have_cmd docker-compose); then
    echo "ERROR: Docker Compose is not available (docker compose / docker-compose)." >&2
    exit 1
  fi
}

clone_repo() {
  rm -rf "${INSTALL_DIR}"
  mkdir -p "$(dirname "${INSTALL_DIR}")"

  echo "Cloning ${REPO_URL} (${REF})..."
  git clone --depth 1 --branch "${REF}" "${REPO_URL}" "${INSTALL_DIR}"
}

ensure_env() {
  cd "${INSTALL_DIR}"
  if [[ -f .env ]]; then
    return
  fi

  local db_pass root_pass
  db_pass="$(rand)"
  root_pass="$(rand)"

  cat > .env <<EOF
TZ=UTC
PUID=1000
PGID=1000

DB_MYSQL_USER=nyxguard
DB_MYSQL_NAME=nyxguard
DB_MYSQL_PASSWORD=${db_pass}
MYSQL_ROOT_PASSWORD=${root_pass}
EOF

  chmod 600 .env || true
  echo "Generated ${INSTALL_DIR}/.env"
}

ensure_image() {
  cd "${INSTALL_DIR}"
  local version
  version="$(head -n 1 .version 2>/dev/null || true)"
  if [[ -z "${version}" ]]; then
    version="${APP_VERSION}"
  fi

  # Docker tag sanity: spaces/parentheses from OS VERSION would be invalid here.
  if [[ ! "${version}" =~ ^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$ ]]; then
    echo "ERROR: Invalid app version for Docker tag: '${version}'" >&2
    echo "Tip: set APP_VERSION to something like '2.0.1'." >&2
    exit 1
  fi

  if [[ "${BUILD_LOCAL:-false}" == "true" ]]; then
    echo "Building frontend..."
    cd "${INSTALL_DIR}/npm-upstream"
    ./scripts/ci/frontend-build

    local build_commit build_date
    build_commit="$(git -C "${INSTALL_DIR}" rev-parse --short HEAD 2>/dev/null || true)"
    build_date="$(date -u '+%Y-%m-%d')"

    echo "Building Docker image ${IMAGE_REPO}:${version}..."
    docker build \
      --build-arg BUILD_VERSION="${version}" \
      --build-arg BUILD_COMMIT="${build_commit:-unknown}" \
      --build-arg BUILD_DATE="${build_date}" \
      -t "${IMAGE_REPO}:${version}" \
      -f docker/Dockerfile \
      .
  else
    echo "Pulling Docker image ${IMAGE_REPO}:${version}..."
    docker pull "${IMAGE_REPO}:${version}"
  fi

  # Ensure compose uses the desired image.
  cd "${INSTALL_DIR}"
  set_compose_image docker-compose.yml "${IMAGE_REPO}:${version}"
}

start_stack() {
  cd "${INSTALL_DIR}"
  echo "Starting stack..."
  if docker compose version >/dev/null 2>&1; then
    docker compose --env-file .env up -d
  else
    docker-compose --env-file .env up -d
  fi
}

main() {
  need_root
  install_packages
  install_docker
  clone_repo
  ensure_env
  ensure_image
  start_stack

  echo "Waiting for NyxGuard Manager to become ready (http://127.0.0.1:81/api/) ..."
  wait_http_200 "http://127.0.0.1:81/api/" 180 || true

  echo
  echo "NyxGuard Manager is installing/running."
  echo "Open: http://$(hostname -I 2>/dev/null | awk '{print $1}'):81/"
  echo
}

main "$@"
