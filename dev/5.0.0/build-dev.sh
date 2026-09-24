#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
expected='sha256:c45403bf3ed25c31b59c49e32e09ac55ddcf7bb1f7311705562ca1b32712e75a'
actual="$(docker image inspect nyxguardmanager:4.0.18-clean-rc --format '{{.Id}}')"
if [[ "$actual" != "$expected" ]]; then
  echo 'Refusing build: validated 4.0.18 base image identity changed' >&2
  exit 1
fi
architecture="$(docker image inspect nyxguardmanager:4.0.18-clean-rc --format '{{.Architecture}}')"
if [[ "$architecture" != 'amd64' ]]; then
  echo 'Refusing build: base image is not linux/amd64' >&2
  exit 1
fi
revision="$(git rev-parse HEAD)"
docker build --pull=false --progress=plain -f dev/5.0.0/Dockerfile \
  --build-arg "NYXGUARD_SOURCE_REVISION=$revision" -t nyxguardmanager:5.0.0-dev .
