# build-dev.sh validates this immutable local prerequisite before building.
FROM nyxguardmanager:5.0.1
ARG NYXGUARD_SOURCE_REVISION
COPY release-source/5.0.2/internal/ /app/internal/
COPY release-source/5.0.2/routes/event-center.js /app/routes/event-center.js
COPY release-source/5.0.2/migrations/ /app/migrations/
COPY release-source/5.0.2/frontend/event-center.js /app/frontend/assets/event-center-source.js
COPY release-source/5.0.2/frontend/event-center.css /app/frontend/assets/event-center.css
COPY release-source/5.0.2/patch-backend.mjs /tmp/patch-backend.mjs
COPY release-source/5.0.2/patch-frontend.mjs /tmp/patch-frontend.mjs
RUN node /tmp/patch-backend.mjs /app && node /tmp/patch-frontend.mjs /app && \
    (find /app/internal /app/routes /app/migrations -type f \( -name '*.js' -o -name '*.mjs' \) -print0 | xargs -0 -n 1 node --check) && \
    node --check /app/frontend/assets/index-DJfFx4nu.js && \
    node --check /app/frontend/assets/index-W-QFtloY.js && \
    rm /tmp/patch-backend.mjs /tmp/patch-frontend.mjs /app/frontend/assets/event-center-source.js
ENV NPM_BUILD_VERSION=5.0.2-dev NPM_BUILD_COMMIT=${NYXGUARD_SOURCE_REVISION} NPM_BUILD_DATE=2026-10-03
LABEL org.opencontainers.image.version="5.0.2-dev" org.opencontainers.image.revision="${NYXGUARD_SOURCE_REVISION}"
