FROM nyxguardmanager:5.0.14-curl-complete-builder@sha256:0169ffa9879235d0e95c9317b08dbab2db7adfd868edd602f5dec7d56723eb15 AS curl
FROM nyxguardmanager:5.0.14-remediation-engine@sha256:16caa96fd78bbef6e57e5d80da298027d498246fc67402a5337aaaf71907d846
RUN --mount=type=bind,source=.,target=/inputs,ro --mount=type=bind,source=packages,target=/base-packages,ro --mount=type=bind,from=curl,source=/out-complete,target=/curl-packages,ro DEBIAN_FRONTEND=noninteractive python3 /inputs/install-runtime.py
LABEL nyxguard.security.integration="20261019;nginx-security-only;glibc-three-fixes;curl-fourteen-plus-legacy-h2-compatibility;leaf;cache4.3.0"
