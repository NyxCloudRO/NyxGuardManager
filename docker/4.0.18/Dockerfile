FROM nyxmael/nyxguardmanager:4.0.16@sha256:641602cd8ee04f8d31b466e95be686fce47d3dd626c1226b9cc87b998da3cba9

ARG NYXGUARD_SOURCE_REVISION=release-4.0.18

COPY dev/custom-location-port/patch-custom-location-port.mjs /tmp/custom-location-port/patch-custom-location-port.mjs
COPY dev/custom-location-port/custom-location-port.test.mjs /tmp/custom-location-port/custom-location-port.test.mjs
RUN set -eu; \
	cd /tmp/custom-location-port; \
	node custom-location-port.test.mjs; \
	node patch-custom-location-port.mjs /app/frontend; \
	node custom-location-port.test.mjs /app/frontend; \
	rm -rf /tmp/custom-location-port

COPY dev/threat-activity-pagination/threat-activity-page.js /app/internal/threat-activity-page.js
COPY dev/threat-activity-pagination/patch-threat-activity.mjs /tmp/threat-activity/patch-threat-activity.mjs
COPY dev/threat-activity-pagination/threat-activity-page.js /app/dev-tests/threat-activity-page.js
COPY dev/threat-activity-pagination/threat-activity-pagination.test.mjs /app/dev-tests/threat-activity-pagination.test.mjs
RUN set -eu; \
	node /tmp/threat-activity/patch-threat-activity.mjs /app; \
	node /app/dev-tests/threat-activity-pagination.test.mjs --verify-image; \
	rm -rf /tmp/threat-activity

COPY dev/developer-message/migrations/20260830120000_developer_message_acknowledgement.js /app/migrations/20260830120000_developer_message_acknowledgement.js
COPY dev/developer-message/routes/developer-message.js /app/routes/developer-message.js
COPY dev/developer-message/frontend/developer-message.js /app/frontend/assets/developer-message.js
COPY dev/developer-message/frontend/developer-message.css /app/frontend/assets/developer-message.css
COPY dev/developer-message/patch-backend.mjs /tmp/developer-message/patch-backend.mjs
COPY dev/developer-message/patch-frontend.mjs /tmp/developer-message/patch-frontend.mjs
COPY dev/developer-message/developer-message.test.mjs /app/dev-tests/developer-message.test.mjs
COPY dev/developer-message/acceptance-fixture.mjs /app/dev-tests/developer-message-acceptance-fixture.mjs
COPY docker/4.0.18/app/CHANGELOG_PUBLIC.md /app/CHANGELOG_PUBLIC.md

RUN set -eu; \
	node /tmp/developer-message/patch-backend.mjs /app; \
	node /tmp/developer-message/patch-frontend.mjs /app/frontend; \
	node --check /app/routes/developer-message.js; \
	node --check /app/frontend/assets/developer-message.js; \
	node /app/dev-tests/developer-message.test.mjs --verify-image; \
	rm -rf /tmp/developer-message; \
	find /app \
		-path /app/node_modules -prune -o \
		-path /app/frontend/node_modules -prune -o \
		-type f -exec grep -Il '4\.0\.16' {} + \
		| xargs -r sed -i 's/4\.0\.16/4.0.18/g'; \
	grep -q '"version": "4.0.18"' /app/package.json; \
	! grep -R -I -n '4\.0\.16' /app/frontend /app/package.json /app/CHANGELOG_PUBLIC.md

ENV NPM_BUILD_VERSION=4.0.18 \
	NPM_BUILD_COMMIT=${NYXGUARD_SOURCE_REVISION} \
	NPM_BUILD_DATE=2026-08-30 \
	DB_MYSQL_PASSWORD="" \
	MYSQL_ROOT_PASSWORD=""

LABEL org.opencontainers.image.version="4.0.18" \
	org.opencontainers.image.title="NyxGuard Manager" \
	org.opencontainers.image.source="https://github.com/NyxCloudRO/NyxGuardManager" \
	org.opencontainers.image.revision="${NYXGUARD_SOURCE_REVISION}"
