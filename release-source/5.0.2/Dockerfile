# build-release.sh validates this immutable local prerequisite before building.
FROM nyxguardmanager:5.0.1
ARG NYXGUARD_SOURCE_REVISION
COPY release-source/5.0.2/RELEASE-NOTES.md /app/CHANGELOG_PUBLIC.md
COPY release-source/5.0.2/internal/ /app/internal/
COPY release-source/5.0.2/routes/event-center.js /app/routes/event-center.js
COPY release-source/5.0.2/migrations/ /app/migrations/
COPY release-source/5.0.2/frontend/event-center.js /app/frontend/assets/event-center-source.js
COPY release-source/5.0.2/frontend/event-center.css /app/frontend/assets/event-center.css
COPY release-source/5.0.2/patch-backend.mjs /tmp/patch-backend.mjs
COPY release-source/5.0.2/patch-frontend.mjs /tmp/patch-frontend.mjs
COPY release-source/5.0.2/task2/log-scan.mjs /app/internal/log-scan.mjs
COPY release-source/5.0.2/task2/traffic-selection.mjs /app/internal/traffic-selection.mjs
COPY release-source/5.0.2/task2/manager-duration.mjs /app/frontend/assets/manager-duration-source.mjs
COPY release-source/5.0.2/task2/ui-polish.css /app/frontend/assets/task2-ui-polish.css
COPY release-source/5.0.2/task2/patch-task2.mjs /tmp/patch-task2.mjs
COPY release-source/5.0.2/task3/patch-task3.mjs /tmp/patch-task3.mjs
RUN node /tmp/patch-backend.mjs /app && node /tmp/patch-frontend.mjs /app && node /tmp/patch-task2.mjs /app && node /tmp/patch-task3.mjs /app && \
    (find /app/internal /app/routes /app/migrations -type f \( -name '*.js' -o -name '*.mjs' \) -print0 | xargs -0 -n 1 node --check) && \
    (find /app/frontend/assets -maxdepth 1 -type f -name '*.js' -print0 | xargs -0 -n 1 node --check) && \
    rm /tmp/patch-task3.mjs /tmp/patch-task2.mjs /app/frontend/assets/manager-duration-source.mjs /tmp/patch-backend.mjs /tmp/patch-frontend.mjs /app/frontend/assets/event-center-source.js
ENV NPM_BUILD_VERSION=5.0.2 NPM_BUILD_COMMIT=${NYXGUARD_SOURCE_REVISION} NPM_BUILD_DATE=2026-10-03
LABEL org.opencontainers.image.version="5.0.2" org.opencontainers.image.revision="${NYXGUARD_SOURCE_REVISION}"
