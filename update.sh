#!/usr/bin/env bash
# NyxGuard Manager updater (Docker-only, auto-latest)
# Intended usage:
#   curl -fsSL <update.sh-url> | sudo bash
set -euo pipefail

INSTALL_DIR="${INSTALL_DIR:-/opt/nyxguardmanager}"
IMAGE_REPO="${IMAGE_REPO:-nyxmael/nyxguardmanager}"
FORCE_TAG="${FORCE_TAG:-}"        # Optional explicit target tag override.
AUTO_YES="${NYXGUARD_AUTO_YES:-0}" # Set to 1 for non-interactive mode.

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
  read -r -p "Proceed with update? [y/N]: " answer
  case "${answer}" in
    y|Y|yes|YES) return 0 ;;
    *)
      echo "Update cancelled by user."
      return 1
      ;;
  esac
}

main() {
  need_root
  require_commands
  require_install_files

  local current_ref current_repo current_tag latest_tag target_tag target_ref

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

  if ! version_is_newer "${current_tag}" "${target_tag}"; then
    echo "No newer release found."
    echo "Current: ${current_ref}"
    echo "Latest : ${target_ref}"
    exit 0
  fi

  confirm_update "${current_ref}" "${target_ref}" || exit 0

  echo "Pulling ${target_ref}..."
  docker pull "${target_ref}"

  echo "Updating compose image reference..."
  update_compose_image_ref "${target_ref}"
  echo "${target_tag}" >"${INSTALL_DIR}/.version"

  echo "Applying update (in-place, data preserved)..."
  docker compose --env-file "${INSTALL_DIR}/.env" -f "${INSTALL_DIR}/docker-compose.yml" up -d --remove-orphans

  echo ""
  echo "Update complete."
  echo "Now running: ${target_ref}"
}

main "$@"
