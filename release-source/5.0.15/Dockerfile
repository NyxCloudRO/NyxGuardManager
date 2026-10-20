FROM nyxmael/nyxguardmanager@sha256:a6b853d2d259d66e6f258dd81797b99bc88ce6aafc4483f3c63f7923a9d843f0
ARG BUILD_REVISION
ENV NPM_BUILD_VERSION=5.0.15 NPM_BUILD_COMMIT=${BUILD_REVISION} NYXGUARD_SOURCE_REVISION=${BUILD_REVISION} NPM_BUILD_DATE=2026-10-20
COPY historical-log-cache.mjs /app/internal/historical-log-cache.mjs
COPY prepare-runtime.py /tmp/nyx515-prepare.py
COPY RELEASE-NOTES.md /tmp/nyx515-notes.md
RUN BUILD_REVISION="${BUILD_REVISION}" python3 /tmp/nyx515-prepare.py && rm /tmp/nyx515-prepare.py /tmp/nyx515-notes.md
LABEL org.opencontainers.image.version="5.0.15" org.opencontainers.image.revision="${BUILD_REVISION}" org.nyxguard.release.status="5.0.15"
