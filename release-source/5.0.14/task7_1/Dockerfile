FROM node:22-bookworm-slim AS tools
WORKDIR /tools
COPY task3/package.json task3/package-lock.json ./
RUN npm ci --ignore-scripts --no-audit --no-fund
FROM nyxguardmanager:5.0.14-task7_1-baseline
COPY --from=tools /tools/node_modules /tmp/nyxguard-task7_1/node_modules
COPY task7_1/patch-frontend.mjs /tmp/nyxguard-task7_1/patch-frontend.mjs
COPY task2/catalogs.mjs /tmp/nyxguard-task7_1/catalogs.mjs
COPY task7_1/notification-messages.json /tmp/nyxguard-task7_1/notification-messages.json
RUN node /tmp/nyxguard-task7_1/patch-frontend.mjs /app && rm -rf /tmp/nyxguard-task7_1
COPY task7_1/traffic-ingestion.mjs /app/internal/traffic-ingestion.mjs
COPY task7_1/traffic-monitor.js /app/internal/traffic-monitor.js
COPY task7_1/integrations.js /app/internal/integrations.js
COPY task7_1/notifications.js /app/internal/notifications.js
COPY task7_1/notifications-routes.js /app/routes/notifications.js
COPY task7_1/20261018010000_traffic_ingestion_integrity.js /app/migrations/20261018010000_traffic_ingestion_integrity.js
COPY task7_1/grafana-dashboard.json /app/grafana-dashboard.json
RUN node --check /app/internal/traffic-ingestion.mjs && node --check /app/internal/traffic-monitor.js && node --check /app/internal/integrations.js && node --check /app/internal/notifications.js && node --check /app/routes/notifications.js
RUN node --input-type=module -e 'import fs from "node:fs";const p="/app/internal/release-policy.json",v=JSON.parse(fs.readFileSync(p));if(v.schema!==48)throw Error("Schema baseline differs");v.schema=49;v.database={trafficEngine:"InnoDB"};fs.writeFileSync(p,JSON.stringify(v,null,2)+"\n");'
ENV NYXGUARD_SOURCE_REVISION=working-tree-task7_1 NPM_BUILD_COMMIT=working-tree-task7_1
LABEL org.opencontainers.image.revision="working-tree-task7_1"
