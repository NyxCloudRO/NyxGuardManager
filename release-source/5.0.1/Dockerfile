# The exact local 5.0.0 DEV base is checked by build-dev.sh before this build.
FROM nyxguardmanager:5.0.0-dev

ARG NYXGUARD_SOURCE_REVISION=uncommitted

COPY release-source/5.0.1/update-manager/update-manager.js /app/internal/update-manager.js
COPY release-source/5.0.1/update-manager/update-state.mjs /app/internal/update-state.mjs
COPY release-source/5.0.1/update-manager/update-handover.js /app/internal/update-handover.js
COPY release-source/5.0.1/update-manager/same-major-recovery.js /app/internal/same-major-recovery.js
COPY release-source/5.0.1/diagnostics/operations.mjs /app/internal/nyxcloud-support/operations.mjs
COPY release-source/5.0.1/diagnostics/diagnostics.mjs /app/internal/nyxcloud-support/diagnostics.mjs
COPY release-source/5.0.1/diagnostics/bundle.mjs /app/internal/nyxcloud-support/bundle.mjs
COPY release-source/5.0.1/diagnostics/redaction.mjs /app/internal/nyxcloud-support/redaction.mjs
COPY release-source/5.0.1/diagnostics/professional-support-route.js /app/routes/professional-support.js
COPY release-source/5.0.1/diagnostics/professional-support.js /app/frontend/assets/professional-support.js
COPY release-source/5.0.1/diagnostics/task3-polish.css /tmp/nyxguard-501/task3-polish.css
COPY release-source/5.0.1/frontend/sidebar-compact.css /tmp/nyxguard-501/sidebar-compact.css
COPY release-source/5.0.1/traffic-rules/rules.js /app/routes/nyxguard/rules.js
COPY release-source/5.0.1/frontend/patch-legacy-ui.mjs /tmp/nyxguard-501/patch-legacy-ui.mjs
COPY release-source/5.0.1/frontend/patch-current-version.mjs /tmp/nyxguard-501/patch-current-version.mjs
COPY release-source/5.0.1/traffic-rules/patch-page.mjs /tmp/nyxguard-501/patch-page.mjs
COPY release-source/5.0.1/patch-backend-version.mjs /tmp/nyxguard-501/patch-backend-version.mjs

RUN set -eu; \
	node /tmp/nyxguard-501/patch-legacy-ui.mjs /app/frontend; \
	node /tmp/nyxguard-501/patch-current-version.mjs /app; \
	node /tmp/nyxguard-501/patch-page.mjs /app/frontend; \
	node /tmp/nyxguard-501/patch-backend-version.mjs /app; \
	cat /tmp/nyxguard-501/task3-polish.css >> /app/frontend/assets/professional-support.css; \
	cat /tmp/nyxguard-501/sidebar-compact.css >> /app/frontend/assets/index-j7fgCarU.css; \
	node --check /app/internal/update-manager.js; \
	node --check /app/internal/remote-version.js; \
	node --check /app/routes/main.js; \
	node --check /app/routes/settings.js; \
	node --check /app/internal/update-state.mjs; \
	node --check /app/internal/update-handover.js; \
	node --check /app/internal/same-major-recovery.js; \
	node --check /app/internal/nyxcloud-support/operations.mjs; \
	node --check /app/internal/nyxcloud-support/diagnostics.mjs; \
	node --check /app/internal/nyxcloud-support/bundle.mjs; \
	node --check /app/routes/professional-support.js; \
	node --check /app/frontend/assets/professional-support.js; \
	node --check /app/routes/nyxguard/rules.js; \
	node --check /app/frontend/assets/index-DHuZiE1T-task2.js; \
	grep -q '"version": "5.0.1-dev"' /app/package.json; \
	rm -rf /tmp/nyxguard-501

ENV NPM_BUILD_VERSION=5.0.1-dev \
	NPM_BUILD_COMMIT=${NYXGUARD_SOURCE_REVISION} \
	NPM_BUILD_DATE=2026-09-30

LABEL org.opencontainers.image.version="5.0.1-dev" \
	org.opencontainers.image.revision="${NYXGUARD_SOURCE_REVISION}" \
	org.opencontainers.image.title="NyxGuard Manager"
