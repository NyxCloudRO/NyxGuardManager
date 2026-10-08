# Product overlay on the accepted corrective runtime image.
ARG NYXGUARD_CORRECTIVE_BASE=nyxguardmanager:5.0.4-corrective-base
FROM ${NYXGUARD_CORRECTIVE_BASE}
COPY release-source/5.0.4/internal/update-handover.js /app/internal/update-handover.js
COPY release-source/5.0.4/product/rule-state.mjs /app/internal/rule-state.mjs
COPY release-source/5.0.4/product/frontend/AppPage.js /app/frontend/assets/AppPage-CHaZeb42.js
COPY release-source/5.0.4/product/patch-product.mjs /tmp/patch-product.mjs
COPY release-source/5.0.4/product/patch-docker-group.mjs /tmp/patch-docker-group.mjs
RUN node /tmp/patch-product.mjs /app && node /tmp/patch-docker-group.mjs /etc/s6-overlay/s6-rc.d/backend/run && bash -n /etc/s6-overlay/s6-rc.d/backend/run && node --check /app/internal/nyxguard/rules.js && node --check /app/routes/nyxguard/rules.js && node --check /app/frontend/assets/professional-support.js && rm /tmp/patch-product.mjs /tmp/patch-docker-group.mjs
ARG NYXGUARD_SOURCE_REVISION=uncommitted-product
ENV NPM_BUILD_COMMIT=${NYXGUARD_SOURCE_REVISION}
LABEL org.opencontainers.image.revision="${NYXGUARD_SOURCE_REVISION}"
