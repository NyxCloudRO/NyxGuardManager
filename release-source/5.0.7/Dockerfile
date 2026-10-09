FROM nyxmael/nyxguardmanager@sha256:2f56e7b2611ad2f345868fb98ff6dcd00f8504171a61afcd0d95aa847ad94fae
COPY release-source/5.0.7/internal/ /app/internal/
COPY release-source/5.0.7/patch-version.mjs /tmp/patch-version.mjs
RUN node /tmp/patch-version.mjs && rm /tmp/patch-version.mjs && node --check /app/internal/recovery-docker.mjs && node --check /app/internal/recovery-database.mjs
ARG NYXGUARD_SOURCE_REVISION
ENV NPM_BUILD_VERSION=5.0.7 NPM_BUILD_COMMIT=${NYXGUARD_SOURCE_REVISION} NPM_BUILD_DATE=2026-10-09
LABEL org.opencontainers.image.version="5.0.7" org.opencontainers.image.revision="${NYXGUARD_SOURCE_REVISION}" nyxguard.release.private="false"
