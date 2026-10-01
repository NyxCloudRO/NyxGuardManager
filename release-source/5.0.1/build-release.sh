#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
test "$(cat .version)" = 5.0.1
test -z "$(git status --porcelain)"
expected='sha256:46195694b490fd5caf4b3b3b088b343c098b9b48dd1e82636a491a3fa8583658'
actual="$(docker image inspect nyxguardmanager:5.0.0-dev --format '{{.Id}}')"
test "$actual" = "$expected"
test "$(docker image inspect nyxguardmanager:5.0.0-dev --format '{{.Architecture}}')" = amd64
revision="$(git rev-parse HEAD)"
build_date="$(date -u +%F)"
docker build --pull=false --progress=plain -f release-source/5.0.1/Dockerfile \
  --build-arg "NYXGUARD_SOURCE_REVISION=$revision" \
  --build-arg NYXGUARD_RELEASE_VERSION=5.0.1 \
  --build-arg "NYXGUARD_BUILD_DATE=$build_date" \
  -t nyxguardmanager:5.0.1 .
