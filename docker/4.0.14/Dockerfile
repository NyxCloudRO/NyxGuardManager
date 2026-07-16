FROM nyxmael/nyxguardmanager:4.0.13

COPY app/routes/main.js /app/routes/main.js
COPY app/routes/vpn-client.js /app/routes/vpn-client.js
COPY app/CHANGELOG_PUBLIC.md /app/CHANGELOG_PUBLIC.md
COPY frontend/index.html /app/frontend/index.html
COPY frontend/assets/vpn-client-4014.js /app/frontend/assets/vpn-client-4014.js
COPY frontend/assets/vpn-client-4014.css /app/frontend/assets/vpn-client-4014.css

RUN set -eu; \
	find /app \
		-path /app/node_modules -prune -o \
		-path /app/frontend/node_modules -prune -o \
		-type f -exec grep -Il '4\.0\.13' {} + \
		| xargs -r sed -i 's/4\.0\.13/4.0.14/g'; \
	grep -q 'vpnClientRoutes' /app/routes/main.js; \
	grep -q 'vpn-client-4014.js' /app/frontend/index.html; \
	node --check /app/routes/main.js; \
	node --check /app/routes/vpn-client.js; \
	node --check /app/frontend/assets/vpn-client-4014.js; \
	grep -q '"version": "4.0.14"' /app/package.json

ENV NPM_BUILD_VERSION=4.0.14 \
	NPM_BUILD_COMMIT=release-4.0.14 \
	NPM_BUILD_DATE=2026-07-15 \
	NYXGUARD_VPN_AGENT_URL=http://127.0.0.1:3198 \
	NYXGUARD_VPN_AGENT_TOKEN_PATH=/run/nyxguard-vpn-auth/token \
	DB_MYSQL_PASSWORD="" \
	MYSQL_ROOT_PASSWORD=""

LABEL org.opencontainers.image.version="4.0.14"
LABEL org.opencontainers.image.title="NyxGuard Manager"
LABEL org.opencontainers.image.source="https://github.com/NyxCloudRO/NyxGuardManager"
LABEL org.opencontainers.image.revision="release-4.0.14-r4"
