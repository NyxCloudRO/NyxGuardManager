#!/usr/bin/env bash
# Compatibility entry point for the versioned release candidate.
set -euo pipefail
exec "$(dirname "$0")/build-release.sh" "$@"
