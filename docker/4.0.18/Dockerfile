ARG NYXGUARD_SOURCE_REVISION=release-4.0.18

FROM nyxmael/nyxguardmanager:4.0.16@sha256:641602cd8ee04f8d31b466e95be686fce47d3dd626c1226b9cc87b998da3cba9 AS release-files

ARG NYXGUARD_SOURCE_REVISION

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

# The immutable 4.0.16 filesystem is authoritative, but its image config
# contains accidental Docker Compose runtime labels. Recreate the final image
# config from scratch so only intentional public metadata is published.
FROM scratch

ARG NYXGUARD_SOURCE_REVISION

COPY --from=release-files / /

ENV PUID=1000 \
	PGID=988 \
	TZ=UTC \
	SKIP_CERTBOT_OWNERSHIP=true \
	DB_MYSQL_HOST=db \
	DB_MYSQL_PORT=3306 \
	DB_MYSQL_USER=nyxguard \
	DB_MYSQL_PASSWORD="" \
	DB_MYSQL_NAME=nyxguard \
	MYSQL_ROOT_PASSWORD="" \
	NPM_BUILD_VERSION=4.0.18 \
	NPM_BUILD_COMMIT=${NYXGUARD_SOURCE_REVISION} \
	NPM_BUILD_DATE=2026-08-30 \
	PATH=/opt/certbot/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin \
	SSL_CERT_FILE=/etc/ssl/certs/ca-certificates.crt \
	CURL_CA_BUNDLE=/etc/ssl/certs/ca-certificates.crt \
	OPENRESTY_VERSION=1.27.1.2 \
	CROWDSEC_OPENRESTY_BOUNCER_VERSION=0.1.7 \
	SUPPRESS_NO_CONFIG_WARNING=1 \
	S6_BEHAVIOUR_IF_STAGE2_FAILS=1 \
	S6_CMD_WAIT_FOR_SERVICES_MAXTIME=0 \
	S6_FIX_ATTRS_HIDDEN=1 \
	S6_KILL_FINISH_MAXTIME=10000 \
	S6_VERBOSITY=1 \
	NODE_ENV=production \
	NODE_OPTIONS=--openssl-legacy-provider \
	NYXGUARD_VPN_AGENT_URL=http://127.0.0.1:3198 \
	NYXGUARD_VPN_AGENT_TOKEN_PATH=/run/nyxguard-vpn-auth/token

WORKDIR /app
VOLUME ["/data"]
EXPOSE 80 81 443 8443
HEALTHCHECK --interval=10s --timeout=5s --start-period=60s --retries=5 CMD curl -fs http://localhost:3000/
ENTRYPOINT ["/init"]

LABEL maintainer="NyxCloudRO" \
	org.label-schema.description="Advanced Reverse Proxy Manager and Integrated Advanced WAF" \
	org.label-schema.license="MIT" \
	org.label-schema.name="nyxguard-manager" \
	org.label-schema.schema-version="1.0" \
	org.label-schema.url="https://github.com/NyxCloudRO/NyxGuardManager" \
	org.label-schema.vcs-url="https://github.com/NyxCloudRO/NyxGuardManager.git" \
	org.opencontainers.image.description="Advanced Reverse Proxy Manager and Integrated Advanced WAF" \
	org.opencontainers.image.version="4.0.18" \
	org.opencontainers.image.title="NyxGuard Manager" \
	org.opencontainers.image.source="https://github.com/NyxCloudRO/NyxGuardManager" \
	org.opencontainers.image.revision="${NYXGUARD_SOURCE_REVISION}"
