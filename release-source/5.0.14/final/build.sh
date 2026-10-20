#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
base_id=$(docker image inspect -f '{{.Id}}' nyxguardmanager:5.0.14-task7_1-candidate)
[[ "$base_id" == sha256:df929ee91a814e0f4aa739b07fdaba992feb24f17d4cfd86735ee21a24d5bd22 ]] || { echo 'Accepted Task 7.1 base differs; build refused.' >&2; exit 1; }
docker build --pull=false -f final/Dockerfile -t nyxguardmanager:5.0.14-preaudit .
docker build --pull=false -f final/security/Dockerfile -t nyxguardmanager:5.0.14-security-candidate .
docker build --pull=false -f final/security/Dockerfile.nginx -t nyxguardmanager:5.0.14-hardened-candidate .
docker build --pull=false -f final/security/Dockerfile.dependencies -t nyxguardmanager:5.0.14-final-candidate .
docker build --pull=false -f final/security/Dockerfile.sqlite -t nyxguardmanager:5.0.14-release-candidate .
docker build --pull=false -f final/security/Dockerfile.nginx-final -t nyxguardmanager:5.0.14-security-final .
docker build --pull=false -f final/security/Dockerfile.final -t nyxguardmanager:5.0.14-rc .
docker image inspect -f '{{.Id}} {{.Os}}/{{.Architecture}}' nyxguardmanager:5.0.14-rc
