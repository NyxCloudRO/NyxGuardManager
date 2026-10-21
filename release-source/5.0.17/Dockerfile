FROM nyxmael/nyxguardmanager@sha256:53766660a361893d6315628a8ce21667b42250a381447bdc9c1ccd738326c7ed
ARG BUILD_REVISION
ARG APP_VERSION=5.0.17
ENV NPM_BUILD_VERSION=${APP_VERSION} NPM_BUILD_COMMIT=${BUILD_REVISION} NYXGUARD_SOURCE_REVISION=${BUILD_REVISION} NPM_BUILD_DATE=2026-10-21
COPY integrations.js historical-bands.mjs license-refresh.mjs backup-crypto.mjs traffic-ingestion.mjs storage-api.mjs storage-host.py install-storage-host.py /app/internal/
COPY frontend/ /app/frontend/assets/
COPY grafana-dashboard.json /app/grafana-dashboard.json
COPY prepare-runtime.py wizard-messages.json RELEASE-NOTES.md /tmp/nyx517/
RUN BUILD_REVISION="${BUILD_REVISION}" APP_VERSION="${APP_VERSION}" python3 /tmp/nyx517/prepare-runtime.py && rm -r /tmp/nyx517
LABEL org.opencontainers.image.version="${APP_VERSION}" org.opencontainers.image.revision="${BUILD_REVISION}" org.nyxguard.release.status="${APP_VERSION}"
