#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
expected='sha256:a38e1f0aba5c88b36354b6f05852b31e28b830869fa56219b1bbdf5cb402d8d4'
actual="$(docker image inspect nyxguardmanager:5.0.1 --format '{{.Id}}')"
[[ "$actual" == "$expected" ]] || { echo 'Refusing build: validated base changed' >&2; exit 1; }
[[ "$(docker image inspect nyxguardmanager:5.0.1 --format '{{.Architecture}}')" == amd64 ]] || exit 1
revision="$(git rev-parse HEAD)"
if [[ -n "$(git status --porcelain)" ]]; then
  [[ "${NYXGUARD_ALLOW_WIP_BUILD:-0}" == 1 ]] || { echo 'Commit reviewed source before a traceable DEV build' >&2; exit 1; }
  revision="${revision}-wip"
fi
docker build --pull=false -f release-source/5.0.2/Dockerfile \
  --build-arg "NYXGUARD_SOURCE_REVISION=$revision" -t nyxguardmanager:5.0.2-dev .
