FROM nyxmael/nyxguardmanager@sha256:eb9289303fe3906a04b230076025565e120c0eed4af27f5164826ae0df46cb50
ARG BUILD_REVISION
ENV NPM_BUILD_VERSION=5.0.16 NPM_BUILD_COMMIT=${BUILD_REVISION} NYXGUARD_SOURCE_REVISION=${BUILD_REVISION} NPM_BUILD_DATE=2026-10-20
COPY traffic-summary.mjs integrations.js security-source-health.mjs /app/internal/
COPY prepare-runtime.py /tmp/nyx516-prepare.py
COPY RELEASE-NOTES.md /tmp/nyx516-notes.md
RUN BUILD_REVISION="${BUILD_REVISION}" python3 /tmp/nyx516-prepare.py && rm /tmp/nyx516-prepare.py /tmp/nyx516-notes.md
LABEL org.opencontainers.image.version="5.0.16" org.opencontainers.image.revision="${BUILD_REVISION}" org.nyxguard.release.status="5.0.16"
