FROM nyxmael/nyxguardmanager:4.0.15@sha256:3876a207556173694e143a5f1c93d43e927e645425ec24e12a0df0d3bf9a7e32

COPY app/internal/attack-monitor.js /app/internal/attack-monitor.js
COPY app/CHANGELOG_PUBLIC.md /app/CHANGELOG_PUBLIC.md

RUN set -eu; \
	node --check /app/internal/attack-monitor.js; \
	grep -q 'let pollInFlight = false' /app/internal/attack-monitor.js; \
	grep -q 'void runPollOnce()' /app/internal/attack-monitor.js; \
	find /app \
		-path /app/node_modules -prune -o \
		-path /app/frontend/node_modules -prune -o \
		-type f -exec grep -Il '4\.0\.15' {} + \
		| xargs -r sed -i 's/4\.0\.15/4.0.16/g'; \
	grep -q '"version": "4.0.16"' /app/package.json

ENV NPM_BUILD_VERSION=4.0.16 \
	NPM_BUILD_COMMIT=release-4.0.16-attack-monitor-single-flight \
	NPM_BUILD_DATE=2026-07-23 \
	DB_MYSQL_PASSWORD="" \
	MYSQL_ROOT_PASSWORD=""

LABEL org.opencontainers.image.version="4.0.16"
LABEL org.opencontainers.image.title="NyxGuard Manager"
LABEL org.opencontainers.image.source="https://github.com/NyxCloudRO/NyxGuardManager"
LABEL org.opencontainers.image.revision="release-4.0.16-attack-monitor-single-flight"
