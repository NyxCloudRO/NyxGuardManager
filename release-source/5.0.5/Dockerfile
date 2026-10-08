# Private release overlay on the exact certified candidate; no rebuild of product dependencies.
# Local-only base: build preflight and layer comparison bind this frozen tag to
# sha256:f181c12783d290385205339b2bb9c49139a01451d6157a11bfededce6bd3b691.
FROM nyxguardmanager:504-corrective-private-4
COPY release-source/5.0.5/internal/same-major-recovery.js release-source/5.0.5/internal/handover-transaction.mjs /app/internal/
COPY release-source/5.0.5/patch-version.mjs /tmp/nyxguard-505-version.mjs
RUN node /tmp/nyxguard-505-version.mjs /app && node --check /app/internal/same-major-recovery.js && rm /tmp/nyxguard-505-version.mjs
ARG NYXGUARD_SOURCE_REVISION
ENV NPM_BUILD_VERSION=5.0.5 NPM_BUILD_COMMIT=${NYXGUARD_SOURCE_REVISION} NPM_BUILD_DATE=2026-10-08
LABEL org.opencontainers.image.version="5.0.5" org.opencontainers.image.revision="${NYXGUARD_SOURCE_REVISION}" nyxguard.release.private="true" nyxguard.release.baseline="46cce42224244813e7eb642813022865e7d174dd"
