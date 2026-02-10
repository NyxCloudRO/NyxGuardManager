#!/usr/bin/env bash
# NyxGuard Manager v3.0.0 (stamp 2026-02-10T20:00:00Z)
set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/NyxCloudRO/NyxGuardManager.git}"
REF="${REF:-main}"
INSTALL_DIR="${INSTALL_DIR:-/opt/nyxguardmanager}"
IMAGE_REPO="${IMAGE_REPO:-nyxmael/nyxguardmanager}"

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
    return 0
  fi

  local start
  start="$(date +%s)"

  while true; do
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

ensure_image() {
  cd "${INSTALL_DIR}"
  local version
  # Only read the first line so we can include comments/metadata below it.
  version="$(head -n 1 .version 2>/dev/null || true)"
  if [[ -z "${version}" ]]; then
    version="unknown"
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

  # Ensure compose points at the current local tag.
  cd "${INSTALL_DIR}"
  set_compose_image docker-compose.yml "${IMAGE_REPO}:${version}"
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
  ensure_image
  restart_stack

  echo "Waiting for NyxGuard Manager to become ready (http://127.0.0.1:81/api/) ..."
  wait_http_200 "http://127.0.0.1:81/api/" 180 || true

  echo
  echo "Update complete."
}

main "$@"
