FROM nyxmael/nyxguardmanager@sha256:dd86b4369134260493b4e4985cb56395fa75e94c6f15fd2c9662c6c0f2023d94
COPY release-source/5.0.9/internal/ /app/internal/
COPY release-source/5.0.9/migrations/ /app/migrations/
COPY release-source/5.0.9/patch-version.mjs /tmp/patch-version.mjs
COPY release-source/5.0.9/patch-recovery.mjs /tmp/patch-recovery.mjs
RUN node /tmp/patch-version.mjs && rm /tmp/patch-version.mjs && node /tmp/patch-recovery.mjs && rm /tmp/patch-recovery.mjs && node --check /app/internal/same-major-recovery.js
ARG NYXGUARD_SOURCE_REVISION
ENV NPM_BUILD_VERSION=5.0.9 NPM_BUILD_COMMIT=${NYXGUARD_SOURCE_REVISION} NPM_BUILD_DATE=2026-10-09
LABEL org.opencontainers.image.version="5.0.9" org.opencontainers.image.revision="${NYXGUARD_SOURCE_REVISION}" nyxguard.release.private="false"
