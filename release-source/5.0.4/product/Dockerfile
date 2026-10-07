# Product overlay on the accepted corrective runtime image.
ARG NYXGUARD_CORRECTIVE_BASE=nyxguardmanager:5.0.4-corrective-base
FROM ${NYXGUARD_CORRECTIVE_BASE}
COPY release-source/5.0.4/product/rule-state.mjs /app/internal/rule-state.mjs
COPY release-source/5.0.4/product/frontend/AppPage.js /app/frontend/assets/AppPage-CHaZeb42.js
COPY release-source/5.0.4/product/patch-product.mjs /tmp/patch-product.mjs
RUN node /tmp/patch-product.mjs /app && node --check /app/internal/nyxguard/rules.js && node --check /app/routes/nyxguard/rules.js && node --check /app/frontend/assets/professional-support.js && rm /tmp/patch-product.mjs
ARG NYXGUARD_SOURCE_REVISION=uncommitted-product
ENV NPM_BUILD_COMMIT=${NYXGUARD_SOURCE_REVISION}
LABEL org.opencontainers.image.revision="${NYXGUARD_SOURCE_REVISION}"
