FROM node:22-bookworm-slim AS tools
WORKDIR /tools
COPY task3/package.json task3/package-lock.json ./
RUN npm ci --ignore-scripts --no-audit --no-fund
FROM nyxguardmanager:5.0.14-task7-baseline
COPY --from=tools /tools/node_modules /tmp/nyxguard-task7/node_modules
COPY task2/catalogs.mjs /tmp/nyxguard-task7/task2/
COPY task7/ /tmp/nyxguard-task7/task7/
RUN node /tmp/nyxguard-task7/task7/patch.mjs /app && node --check /app/routes/nyxguard/attack-log.js && rm -rf /tmp/nyxguard-task7
ENV NYXGUARD_SOURCE_REVISION=working-tree-task7 NPM_BUILD_COMMIT=working-tree-task7
LABEL org.opencontainers.image.revision="working-tree-task7"
