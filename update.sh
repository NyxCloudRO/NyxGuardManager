#!/usr/bin/env bash
# NyxGuard Manager v2.0.1 (stamp 2026-02-09T08:27:06Z)
set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/NyxCloudRO/NyxGuardManager.git}"
REF="${REF:-main}"
INSTALL_DIR="${INSTALL_DIR:-/opt/nyxguardmanager}"

need_root() {
  if [[ "${EUID}" -ne 0 ]]; then
    echo "ERROR: Run as root (or with sudo)." >&2
    exit 1
  fi
}

have_cmd() { command -v "$1" >/dev/null 2>&1; }

set_compose_image_tag() {
  local compose_file="$1"
  local tag="$2"

  [[ -f "${compose_file}" ]] || return 0

  # Keep this portable across sed variants by using awk + atomic replace.
  local tmp
  tmp="$(mktemp)"
  awk -v v="${tag}" '
    {
      if (match($0, /^[[:space:]]*image:[[:space:]]*"?nyxguardmanager:/)) {
        pre = substr($0, 1, RLENGTH)
        # Preserve an opening quote if present.
        q = ""
        if (pre ~ /"$/) {
          pre = substr(pre, 1, length(pre) - 1)
          q = "\""
        }
        $0 = pre v q
      }
      print
    }
  ' "${compose_file}" > "${tmp}"
  mv -f "${tmp}" "${compose_file}"
}

require_cmds() {
  local missing=0
  for c in git docker; do
    if ! have_cmd "$c"; then
      echo "ERROR: Missing required command: $c" >&2
      missing=1
    fi
  done
  if [[ "$missing" -ne 0 ]]; then
    exit 1
  fi
  if ! (docker compose version >/dev/null 2>&1 || have_cmd docker-compose); then
    echo "ERROR: Docker Compose is not available (docker compose / docker-compose)." >&2
    exit 1
  fi
}

update_repo() {
  if [[ ! -d "${INSTALL_DIR}/.git" ]]; then
    echo "ERROR: ${INSTALL_DIR} is not a git repo. (Expected an existing install.)" >&2
    echo "Tip: set INSTALL_DIR or reinstall via install.sh." >&2
    exit 1
  fi

  cd "${INSTALL_DIR}"
  git remote set-url origin "${REPO_URL}" >/dev/null 2>&1 || true
  echo "Fetching ${REPO_URL} (${REF})..."
  git fetch --depth 1 origin "${REF}"

  # Keep it simple and predictable: local tree becomes exactly the selected ref.
  git checkout -f -B "${REF}" "origin/${REF}"
}

build_image() {
  cd "${INSTALL_DIR}"
  local version
  # Only read the first line so we can include comments/metadata below it.
  version="$(head -n 1 .version 2>/dev/null || true)"
  if [[ -z "${version}" ]]; then
    version="unknown"
  fi

  echo "Building frontend..."
  cd "${INSTALL_DIR}/npm-upstream"
  ./scripts/ci/frontend-build

  echo "Building Docker image nyxguardmanager:${version}..."
  docker build -t "nyxguardmanager:${version}" -f docker/Dockerfile .

  # Ensure compose points at the current local tag.
  cd "${INSTALL_DIR}"
  set_compose_image_tag docker-compose.yml "${version}"
}

restart_stack() {
  cd "${INSTALL_DIR}"
  echo "Restarting stack..."
  if docker compose version >/dev/null 2>&1; then
    docker compose --env-file .env up -d
  else
    docker-compose --env-file .env up -d
  fi
}

main() {
  need_root
  require_cmds
  update_repo
  build_image
  restart_stack

  echo
  echo "Update complete."
}

main "$@"
