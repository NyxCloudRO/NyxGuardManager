FROM nyxmael/nyxguardmanager:4.0.16@sha256:641602cd8ee04f8d31b466e95be686fce47d3dd626c1226b9cc87b998da3cba9

# Retain the accepted DEV Custom Location fix while building one reproducible
# DEV image from the digest-pinned release base.
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

ENV NPM_BUILD_VERSION=4.0.16 \
	NPM_BUILD_COMMIT=dev-threat-activity-pagination \
	NPM_BUILD_DATE=2026-08-30

LABEL org.opencontainers.image.version="4.0.16-dev-threat-activity-pagination"
LABEL org.opencontainers.image.revision="dev-threat-activity-pagination"
