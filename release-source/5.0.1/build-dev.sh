#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
expected='sha256:46195694b490fd5caf4b3b3b088b343c098b9b48dd1e82636a491a3fa8583658'
actual="$(docker image inspect nyxguardmanager:5.0.0-dev --format '{{.Id}}')"
if [[ "$actual" != "$expected" ]]; then
  echo 'Refusing build: validated 5.0.0 DEV base image identity changed' >&2
  exit 1
fi
architecture="$(docker image inspect nyxguardmanager:5.0.0-dev --format '{{.Architecture}}')"
if [[ "$architecture" != 'amd64' ]]; then
  echo 'Refusing build: base image is not linux/amd64' >&2
  exit 1
fi
revision="$(git rev-parse HEAD)"
docker build --pull=false --progress=plain -f release-source/5.0.1/Dockerfile \
  --build-arg "NYXGUARD_SOURCE_REVISION=$revision" \
  --build-arg NYXGUARD_RELEASE_VERSION=5.0.1-dev \
  -t nyxguardmanager:5.0.1-dev .
