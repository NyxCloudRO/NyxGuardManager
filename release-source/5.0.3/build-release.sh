#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
test "$(cat .version)" = 5.0.3
test -z "$(git status --porcelain)"
test "$(docker image inspect nyxmael/nyxguardmanager:5.0.2 --format '{{.Id}}')" = sha256:a364c57b1ec427500f25ec606443eb630476431ad684b4fbd63a70a1bd2f9b36
docker build --pull=false --progress=plain -f release-source/5.0.3/Dockerfile \
  --build-arg "NYXGUARD_SOURCE_REVISION=$(git rev-parse HEAD)" -t nyxguardmanager:5.0.3 .
