FROM nyxmael/nyxguardmanager:5.0.11@sha256:b3d885582c64a8ac216c1ace04c7bf8ed2c79fdeea77270ac0895916a0f5bdc5
ARG NYXGUARD_SOURCE_REVISION=uncommitted
COPY licensing/ /app/internal/nyxcloud-licensing/
COPY internal/ /app/internal/
COPY frontend/ /app/frontend/assets/
COPY patch-version.mjs /tmp/patch-version.mjs
COPY patch-ledger-compatibility.mjs /tmp/patch-ledger-compatibility.mjs
COPY patch-runtime.mjs /tmp/patch-runtime.mjs
COPY patch-applications.mjs /tmp/patch-applications.mjs
COPY patch-update-entry.mjs /tmp/patch-update-entry.mjs
COPY patch-protection-runtime.mjs /tmp/patch-protection-runtime.mjs
RUN node /tmp/patch-version.mjs /app && node /tmp/patch-ledger-compatibility.mjs /app && node /tmp/patch-runtime.mjs /app && node /tmp/patch-applications.mjs /app && node /tmp/patch-update-entry.mjs /app && node /tmp/patch-protection-runtime.mjs /app && node --check /app/frontend/assets/index-C8uhQqRV.js && node --check /app/frontend/assets/index-CTHAIRmi-409dev-4012certfix4-threatpagination3.js && rm /tmp/patch-version.mjs /tmp/patch-ledger-compatibility.mjs /tmp/patch-runtime.mjs /tmp/patch-applications.mjs /tmp/patch-update-entry.mjs /tmp/patch-protection-runtime.mjs
ENV NPM_BUILD_VERSION=5.0.12 NPM_BUILD_COMMIT=${NYXGUARD_SOURCE_REVISION} NPM_BUILD_DATE=2026-10-11
LABEL org.opencontainers.image.version="5.0.12" org.opencontainers.image.revision="${NYXGUARD_SOURCE_REVISION}" org.opencontainers.image.source="https://github.com/NyxCloudRO/NyxGuardManager"
