# Exact 4.0.18 DEV image identity captured before this task. Never resolve the
# drifting 4.0.18 Compose tag while building this development candidate.
FROM nyxguardmanager:4.0.18-clean-rc

ARG NYXGUARD_SOURCE_REVISION=uncommitted

COPY dev/5.0.0/licensing/ /app/internal/nyxcloud-licensing/
COPY dev/professional-support/result.mjs dev/professional-support/redaction.mjs dev/professional-support/diagnostics.mjs dev/professional-support/bundle.mjs dev/professional-support/recent-problems.mjs dev/professional-support/docker-indicators.mjs dev/professional-support/backend-problems.mjs /app/internal/nyxcloud-support/
COPY dev/5.0.0/routes/professional-support.js /app/routes/professional-support.js
COPY dev/5.0.0/authority-tunnel.conf /etc/nginx/conf.d/authority-tunnel.conf
COPY dev/5.0.0/migrations/20260924000000_nyxcloud_professional_support.js /app/migrations/20260924000000_nyxcloud_professional_support.js
COPY dev/professional-support/frontend/professional-support.js /app/frontend/assets/professional-support.js
COPY dev/professional-support/frontend/professional-support.css /app/frontend/assets/professional-support.css
COPY dev/5.0.0/patch-backend.mjs /tmp/nyxguard-5/patch-backend.mjs
COPY dev/professional-support/patch-frontend.mjs /tmp/nyxguard-5/patch-frontend.mjs

RUN set -eu; \
	node /tmp/nyxguard-5/patch-backend.mjs /app; \
	node /tmp/nyxguard-5/patch-frontend.mjs /app/frontend; \
	node --check /app/routes/professional-support.js; \
	node --check /app/internal/nyxcloud-licensing/client.mjs; \
	node --check /app/internal/nyxcloud-licensing/verify.mjs; \
	node --check /app/frontend/assets/professional-support.js; \
	grep -q '"version": "5.0.0"' /app/package.json; \
	rm -rf /tmp/nyxguard-5

ENV NPM_BUILD_VERSION=5.0.0 \
	NPM_BUILD_COMMIT=${NYXGUARD_SOURCE_REVISION} \
	NPM_BUILD_DATE=2026-09-24

LABEL org.opencontainers.image.version="5.0.0-dev" \
	org.opencontainers.image.revision="${NYXGUARD_SOURCE_REVISION}" \
	org.opencontainers.image.title="NyxGuard Manager DEV candidate"
