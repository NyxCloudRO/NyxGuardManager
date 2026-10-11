# build-release.py provides a sanitized merged filesystem from the pinned public base.
FROM scratch
ADD sanitized-rootfs.tar /
ENV PATH=/opt/certbot/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin PUID=1000 PGID=1000 TZ=UTC NODE_ENV=production SKIP_CERTBOT_OWNERSHIP=true DISABLE_IPV6=false
ENV SSL_CERT_FILE=/etc/ssl/certs/ca-certificates.crt CURL_CA_BUNDLE=/etc/ssl/certs/ca-certificates.crt SUPPRESS_NO_CONFIG_WARNING=true
ENV S6_BEHAVIOUR_IF_STAGE2_FAILS=2 S6_CMD_WAIT_FOR_SERVICES_MAXTIME=0 S6_FIX_ATTRS_HIDDEN=1 S6_KILL_FINISH_MAXTIME=10000 S6_VERBOSITY=1
COPY internal/release-policy.json /app/internal/release-policy.json
COPY migrate.js /app/migrate.js
COPY internal/observed-migrations.mjs internal/startup-progress.mjs /app/internal/
COPY internal/admin-audit.js /app/internal/admin-audit.js
COPY internal/certificate-errors.mjs /app/internal/certificate-errors.mjs
COPY internal/nginx-reload.mjs /app/internal/nginx-reload.mjs
COPY internal/operational-diagnostics.mjs /app/internal/operational-diagnostics.mjs
COPY migrations/20261011000000_operational_diagnostics.js /app/migrations/20261011000000_operational_diagnostics.js
COPY frontend/dashboard-alignment.css /app/frontend/assets/dashboard-alignment.css
COPY patch-version.mjs patch-observability.mjs patch-ledger-compatibility.mjs patch-ui-audit.mjs patch-certificate-errors.mjs patch-access-enforcement.mjs patch-operational-diagnostics.mjs /tmp/
COPY certbot/cloudflare-requirements.txt /tmp/cloudflare-requirements.txt
COPY certbot/persist.py /app/internal/certbot-persist.py
COPY certbot/check-runtime.py /app/internal/check-certbot-runtime.py
COPY certbot/35-certbot-persist.sh /etc/s6-overlay/s6-rc.d/prepare/35-certbot-persist.sh
# An exported container may carry a symlink to volume-only packages. Rebuild
# the live image directory from its immutable seed before executing Python.
RUN set -eu; site=/opt/certbot/lib/python3.11/site-packages; \
    test -L "$site"; rm "$site"; cp -a /opt/certbot-site-packages-seed "$site"; \
    SETUPTOOLS_USE_DISTUTILS=stdlib /opt/certbot/bin/python3 -m pip install --no-cache-dir --disable-pip-version-check --no-deps --no-build-isolation --require-hashes -r /tmp/cloudflare-requirements.txt; \
    cp -a "$site"/. /opt/certbot-site-packages-seed/; \
    chmod 755 /etc/s6-overlay/s6-rc.d/prepare/35-certbot-persist.sh; \
    /opt/certbot/bin/python3 /app/internal/check-certbot-runtime.py; \
    rm /tmp/cloudflare-requirements.txt; rm -rf /var/log/letsencrypt
RUN node /tmp/patch-version.mjs && node /tmp/patch-observability.mjs && node /tmp/patch-ledger-compatibility.mjs && node /tmp/patch-ui-audit.mjs && node /tmp/patch-certificate-errors.mjs && node /tmp/patch-access-enforcement.mjs && node /tmp/patch-operational-diagnostics.mjs && rm /tmp/patch-version.mjs /tmp/patch-observability.mjs /tmp/patch-ledger-compatibility.mjs /tmp/patch-ui-audit.mjs /tmp/patch-certificate-errors.mjs /tmp/patch-access-enforcement.mjs /tmp/patch-operational-diagnostics.mjs && node --check /app/internal/update-manager.js && node --check /app/internal/certificate.js
ARG NYXGUARD_SOURCE_REVISION
ENV NPM_BUILD_VERSION=5.0.11 NPM_BUILD_COMMIT=${NYXGUARD_SOURCE_REVISION} NPM_BUILD_DATE=2026-10-10
LABEL org.opencontainers.image.version="5.0.11" org.opencontainers.image.revision="${NYXGUARD_SOURCE_REVISION}" org.opencontainers.image.source="https://github.com/NyxCloudRO/NyxGuardManager" org.opencontainers.image.title="NyxGuard Manager" nyxguard.release.private="false"
WORKDIR /app
EXPOSE 80 81 443 8443
VOLUME /data
HEALTHCHECK --interval=10s --timeout=5s --start-period=60s --retries=5 CMD node /app/internal/readiness-probe.mjs
ENTRYPOINT ["/init"]
