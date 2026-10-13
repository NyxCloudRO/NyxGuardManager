FROM nyxmael/nyxguardmanager:5.0.12@sha256:6190f3f5688316750039f87f1f66d5c0abc51246dcf7693d58d7c86f4a13dad1
ARG NYXGUARD_SOURCE_REVISION=uncommitted
COPY internal/release-policy.json /app/internal/release-policy.json
COPY internal/update-platform.mjs /app/internal/update-platform.mjs
COPY internal/access-list-order.mjs /app/internal/access-list-order.mjs
COPY frontend/ /tmp/nyxguard-ui/
COPY patch-ui.mjs /tmp/patch-ui.mjs
COPY RELEASE-NOTES.md /tmp/nyxguard-release-notes.md
RUN node /tmp/patch-ui.mjs /app && rm -rf /tmp/nyxguard-ui /tmp/patch-ui.mjs /tmp/nyxguard-release-notes.md
ENV NPM_BUILD_VERSION=5.0.13 NPM_BUILD_COMMIT=${NYXGUARD_SOURCE_REVISION} NPM_BUILD_DATE=2026-10-13
LABEL org.opencontainers.image.version="5.0.13" org.opencontainers.image.revision="${NYXGUARD_SOURCE_REVISION}" org.opencontainers.image.source="https://github.com/NyxCloudRO/NyxGuardManager"
