# Build-dev validates the locally available immutable published prerequisite.
FROM nyxmael/nyxguardmanager:5.0.2
ARG NYXGUARD_SOURCE_REVISION
COPY release-source/5.0.3/internal/ /app/internal/
COPY release-source/5.0.3/migrations/ /app/migrations/
COPY release-source/5.0.3/frontend/event-center.js /app/frontend/assets/event-center-source.js
COPY release-source/5.0.3/frontend/event-center.css /app/frontend/assets/event-center.css
COPY release-source/5.0.3/frontend/application-shell.css /app/frontend/assets/application-shell.css
COPY release-source/5.0.3/frontend/application-shell.js /app/frontend/assets/application-shell.js
COPY release-source/5.0.3/frontend/theme-preferences.js /app/frontend/assets/theme-preferences.js
COPY release-source/5.0.3/build-tools/ /tmp/nyxguard-tool-source/
COPY release-source/5.0.3/prune-legacy.mjs /tmp/prune-legacy.mjs
COPY release-source/5.0.3/patch-task2.mjs /tmp/patch-task2.mjs
COPY release-source/5.0.3/patch.mjs /tmp/patch-503.mjs
COPY release-source/5.0.3/CHANGELOG.md /app/CHANGELOG_PUBLIC.md
RUN chmod -R a+rX /app/internal /app/migrations /app/frontend && node /tmp/patch-503.mjs /app && node /tmp/patch-task2.mjs /app && \
    node /tmp/nyxguard-tool-source/install.mjs /tmp/nyxguard-build-tools && \
    NYX_BUILD_TOOLS=/tmp/nyxguard-build-tools node /tmp/prune-legacy.mjs /app && \
    node --check /app/app.js && \
    (find /app/internal /app/routes /app/migrations /app/frontend/assets -type f \( -name '*.js' -o -name '*.mjs' \) -print0 | xargs -0 -n 1 node --check) && \
    rm -rf /tmp/nyxguard-tool-source /tmp/nyxguard-build-tools /tmp/prune-legacy.mjs && \
    rm /tmp/patch-task2.mjs /tmp/patch-503.mjs /app/frontend/assets/event-center-source.js
ENV NPM_BUILD_VERSION=5.0.3-dev NPM_BUILD_COMMIT=${NYXGUARD_SOURCE_REVISION} NPM_BUILD_DATE=2026-10-04
LABEL org.opencontainers.image.version="5.0.3-dev" org.opencontainers.image.revision="${NYXGUARD_SOURCE_REVISION}"
