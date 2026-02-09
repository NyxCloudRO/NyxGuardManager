#!/usr/bin/env bash
# NyxGuard Manager v2.0.1
set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/NyxCloudRO/NyxGuardManager.git}"
REF="${REF:-main}"
INSTALL_DIR="${INSTALL_DIR:-/opt/nyxguardmanager}"
VERSION="${VERSION:-2.0.1}"

need_root() {
  if [[ "${EUID}" -ne 0 ]]; then
    echo "ERROR: Run as root (or with sudo)." >&2
    exit 1
  fi
}

have_cmd() { command -v "$1" >/dev/null 2>&1; }

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

build_image() {
  cd "${INSTALL_DIR}/npm-upstream"
  echo "Building frontend..."
  ./scripts/ci/frontend-build

  echo "Building Docker image nyxguardmanager:${VERSION}..."
  docker build -t "nyxguardmanager:${VERSION}" -f docker/Dockerfile .
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
  build_image
  start_stack

  echo
  echo "NyxGuard Manager ${VERSION} is installing/running."
  echo "Open: http://$(hostname -I 2>/dev/null | awk '{print $1}'):81/"
  echo
}

main "$@"
