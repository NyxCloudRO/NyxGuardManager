#!/usr/bin/env bash
# Compatibility entry point: 5.0.2 now builds as an official release.
set -euo pipefail
exec "$(dirname "$0")/build-release.sh" "$@"
