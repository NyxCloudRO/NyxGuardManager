# build-release.py provides a sanitized merged filesystem from the pinned public base.
FROM scratch
ADD sanitized-rootfs.tar /
ENV PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin PUID=1000 PGID=1000 TZ=UTC NODE_ENV=production SKIP_CERTBOT_OWNERSHIP=true
ENV SSL_CERT_FILE=/etc/ssl/certs/ca-certificates.crt CURL_CA_BUNDLE=/etc/ssl/certs/ca-certificates.crt SUPPRESS_NO_CONFIG_WARNING=true
ENV S6_BEHAVIOUR_IF_STAGE2_FAILS=2 S6_CMD_WAIT_FOR_SERVICES_MAXTIME=0 S6_FIX_ATTRS_HIDDEN=1 S6_KILL_FINISH_MAXTIME=10000 S6_VERBOSITY=1
COPY internal/release-policy.json /app/internal/release-policy.json
COPY patch-version.mjs patch-upgrade.mjs /tmp/
RUN node /tmp/patch-version.mjs && node /tmp/patch-upgrade.mjs && rm /tmp/patch-version.mjs /tmp/patch-upgrade.mjs && node --check /app/internal/update-manager.js
ARG NYXGUARD_SOURCE_REVISION
ENV NPM_BUILD_VERSION=5.0.10 NPM_BUILD_COMMIT=${NYXGUARD_SOURCE_REVISION} NPM_BUILD_DATE=2026-10-10
LABEL org.opencontainers.image.version="5.0.10" org.opencontainers.image.revision="${NYXGUARD_SOURCE_REVISION}" org.opencontainers.image.source="https://github.com/NyxCloudRO/NyxGuardManager" org.opencontainers.image.title="NyxGuard Manager" nyxguard.release.private="false"
WORKDIR /app
EXPOSE 80 81 443 8443
VOLUME /data
HEALTHCHECK --interval=10s --timeout=5s --start-period=60s --retries=5 CMD node /app/internal/readiness-probe.mjs
ENTRYPOINT ["/init"]
