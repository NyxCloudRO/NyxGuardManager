#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
test "$(cat .version)" = 5.0.2
test -z "$(git status --porcelain)"
expected='sha256:a38e1f0aba5c88b36354b6f05852b31e28b830869fa56219b1bbdf5cb402d8d4'
test "$(docker image inspect nyxguardmanager:5.0.1 --format '{{.Id}}')" = "$expected"
test "$(docker image inspect nyxguardmanager:5.0.1 --format '{{.Architecture}}')" = amd64
revision="$(git rev-parse HEAD)"
docker build --pull=false --progress=plain -f release-source/5.0.2/Dockerfile \
  --build-arg "NYXGUARD_SOURCE_REVISION=$revision" -t nyxguardmanager:5.0.2 .
