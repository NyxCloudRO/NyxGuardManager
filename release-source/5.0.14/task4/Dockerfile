FROM node:22-bookworm-slim AS tools
WORKDIR /tools
COPY task3/package.json task3/package-lock.json ./
RUN npm ci --ignore-scripts --no-audit --no-fund
FROM nyxguardmanager:5.0.14-task3-candidate
COPY --from=tools /tools/node_modules /tmp/nyxguard-task4/node_modules
COPY task2/catalogs.mjs task2/validate.mjs /tmp/nyxguard-task4/task2/
COPY task4/ /tmp/nyxguard-task4/task4/
RUN node /tmp/nyxguard-task4/task4/patch-backend.mjs /app \
 && node /tmp/nyxguard-task4/task4/patch-frontend.mjs /app \
 && node --check /app/internal/blocked-store.mjs \
 && rm -rf /tmp/nyxguard-task4
ENV NYXGUARD_SOURCE_REVISION=working-tree-task4 NPM_BUILD_COMMIT=working-tree-task4
LABEL org.opencontainers.image.revision="working-tree-task4"
