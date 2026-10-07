# Corrective runtime overlay on the immutable historical Manager image.
FROM nyxmael/nyxguardmanager@sha256:029c14b4f3a54950bd29a4a1e89cc8541165a16bc206bec43a34f02ca88d488f
ARG NYXGUARD_SOURCE_REVISION=uncommitted
COPY release-source/5.0.4/internal/ /app/internal/
COPY release-source/5.0.4/patch-startup.mjs /tmp/patch-startup-504.mjs
COPY release-source/5.0.4/patch-safety.mjs /tmp/patch-safety-504.mjs
RUN node /tmp/patch-startup-504.mjs /app && node /tmp/patch-safety-504.mjs /app && \
    node --check /app/index.js && node --check /app/app.js && \
    node --check /app/internal/update-handover.js && node --check /app/internal/same-major-recovery.js && \
    node --check /app/internal/update-manager.js && node --check /app/lib/certbot.js && \
    rm /tmp/patch-startup-504.mjs /tmp/patch-safety-504.mjs
ENV NPM_BUILD_VERSION=5.0.4 NPM_BUILD_COMMIT=${NYXGUARD_SOURCE_REVISION} NPM_BUILD_DATE=2026-10-07
LABEL org.opencontainers.image.version="5.0.4" org.opencontainers.image.revision="${NYXGUARD_SOURCE_REVISION}"
HEALTHCHECK --interval=10s --timeout=5s --start-period=60s --retries=5 CMD ["node", "/app/internal/readiness-probe.mjs"]
