FROM nyxmael/nyxguardmanager@sha256:9ccc24d4ddae50afbf493267b21f22e58f34db716709b2a7e3527c9c8ab8f67f
COPY release-source/5.0.6/internal/ /app/internal/
COPY upgrade/same-major-bootstrap.mjs /app/internal/update-bootstrap.mjs
COPY release-source/5.0.6/migrations/ /app/migrations/
COPY release-source/5.0.6/index.js release-source/5.0.6/migrate.js /app/
COPY release-source/5.0.6/patch-version.mjs /tmp/patch-version.mjs
RUN node /tmp/patch-version.mjs && rm /tmp/patch-version.mjs && for f in /app/index.js /app/migrate.js /app/internal/*.mjs /app/internal/*.js /app/migrations/*.js; do node --check "$f" || exit 1; done
ARG NYXGUARD_SOURCE_REVISION
ENV NPM_BUILD_VERSION=5.0.6 NPM_BUILD_COMMIT=${NYXGUARD_SOURCE_REVISION} NPM_BUILD_DATE=2026-10-08
LABEL org.opencontainers.image.version="5.0.6" org.opencontainers.image.revision="${NYXGUARD_SOURCE_REVISION}" nyxguard.release.private="false"
