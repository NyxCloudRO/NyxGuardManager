FROM nyxguardmanager:5.0.14-task7_1-candidate
COPY final/waf-rules.js /app/internal/waf-rules.js
COPY final/blocked-store.mjs /app/internal/blocked-store.mjs
COPY final/portal-security-health.mjs /app/internal/portal-security-health.mjs
COPY final/access_portal.js /app/routes/nginx/access_portal.js
COPY final/integrations.js /app/internal/integrations.js
COPY final/monitoring/dashboard.json /app/grafana-dashboard.json
RUN node --check /app/internal/waf-rules.js && node --check /app/internal/blocked-store.mjs && node --check /app/internal/integrations.js && node --check /app/routes/nginx/access_portal.js
ENV NYXGUARD_SOURCE_REVISION=working-tree-final NPM_BUILD_COMMIT=working-tree-final
LABEL org.opencontainers.image.revision="working-tree-final"
