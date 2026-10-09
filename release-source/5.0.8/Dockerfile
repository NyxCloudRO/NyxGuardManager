FROM nyxmael/nyxguardmanager@sha256:9dbf03701e92df2c5dbca9e165d328ad1384c6dd1f8fe8c915d10dd4d6b217eb
COPY release-source/5.0.8/internal/ /app/internal/
COPY release-source/5.0.8/patch-version.mjs /tmp/patch-version.mjs
RUN node /tmp/patch-version.mjs && rm /tmp/patch-version.mjs && node --check /app/internal/handover-transaction.mjs
ARG NYXGUARD_SOURCE_REVISION
ENV NPM_BUILD_VERSION=5.0.8 NPM_BUILD_COMMIT=${NYXGUARD_SOURCE_REVISION} NPM_BUILD_DATE=2026-10-09
LABEL org.opencontainers.image.version="5.0.8" org.opencontainers.image.revision="${NYXGUARD_SOURCE_REVISION}" nyxguard.release.private="true"
