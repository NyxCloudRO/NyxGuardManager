# Exact 4.0.18 DEV image identity captured before this task. Never resolve the
# drifting 4.0.18 Compose tag while building this development candidate.
FROM nyxguardmanager:4.0.18-clean-rc

ARG NYXGUARD_SOURCE_REVISION=uncommitted

COPY release-source/5.0.0/licensing/ /app/internal/nyxcloud-licensing/
COPY release-source/5.0.0/professional-support/result.mjs release-source/5.0.0/professional-support/redaction.mjs release-source/5.0.0/professional-support/diagnostics.mjs release-source/5.0.0/professional-support/bundle.mjs release-source/5.0.0/professional-support/recent-problems.mjs release-source/5.0.0/professional-support/docker-indicators.mjs release-source/5.0.0/professional-support/backend-problems.mjs /app/internal/nyxcloud-support/
COPY release-source/5.0.0/routes/professional-support.js /app/routes/professional-support.js
COPY release-source/5.0.0/update-manager/update-manager.js /app/internal/update-manager.js
COPY release-source/5.0.0/update-manager/update-handover.js /app/internal/update-handover.js
COPY release-source/5.0.0/update-manager/update-recovery-worker.js /app/internal/update-recovery-worker.js
COPY release-source/5.0.0/migrations/20260924000000_nyxcloud_professional_support.js /app/migrations/20260924000000_nyxcloud_professional_support.js
COPY release-source/5.0.0/professional-support/frontend/professional-support.js /app/frontend/assets/professional-support.js
COPY release-source/5.0.0/professional-support/frontend/professional-support.css /app/frontend/assets/professional-support.css
COPY release-source/5.0.0/patch-backend.mjs /tmp/nyxguard-5/patch-backend.mjs
COPY release-source/5.0.0/professional-support/patch-frontend.mjs /tmp/nyxguard-5/patch-frontend.mjs

RUN set -eu; \
	node /tmp/nyxguard-5/patch-backend.mjs /app; \
	node /tmp/nyxguard-5/patch-frontend.mjs /app/frontend; \
	node --check /app/routes/professional-support.js; \
	node --check /app/internal/nyxcloud-licensing/client.mjs; \
	node --check /app/internal/nyxcloud-licensing/verify.mjs; \
	node --check /app/internal/update-manager.js; \
	node --check /app/internal/update-handover.js; \
	node --check /app/internal/update-recovery-worker.js; \
	node --check /app/frontend/assets/professional-support.js; \
	grep -q '"version": "5.0.0"' /app/package.json; \
	rm -rf /tmp/nyxguard-5

ENV NPM_BUILD_VERSION=5.0.0 \
	NPM_BUILD_COMMIT=${NYXGUARD_SOURCE_REVISION} \
	NPM_BUILD_DATE=2026-09-27

LABEL org.opencontainers.image.version="5.0.0" \
	org.opencontainers.image.revision="${NYXGUARD_SOURCE_REVISION}" \
	org.opencontainers.image.title="NyxGuard Manager"
