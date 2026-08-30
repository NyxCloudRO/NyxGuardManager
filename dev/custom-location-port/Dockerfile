FROM nyxmael/nyxguardmanager:4.0.16@sha256:641602cd8ee04f8d31b466e95be686fce47d3dd626c1226b9cc87b998da3cba9

COPY dev/custom-location-port/patch-custom-location-port.mjs /tmp/custom-location-port/patch-custom-location-port.mjs
COPY dev/custom-location-port/custom-location-port.test.mjs /tmp/custom-location-port/custom-location-port.test.mjs

RUN set -eu; \
	cd /tmp/custom-location-port; \
	node custom-location-port.test.mjs; \
	node patch-custom-location-port.mjs /app/frontend; \
	node custom-location-port.test.mjs /app/frontend; \
	rm -rf /tmp/custom-location-port

ENV NPM_BUILD_VERSION=4.0.16 \
	NPM_BUILD_COMMIT=dev-custom-location-port-integer \
	NPM_BUILD_DATE=2026-08-30

LABEL org.opencontainers.image.version="4.0.16-dev-custom-location-port"
LABEL org.opencontainers.image.revision="dev-custom-location-port-integer"
