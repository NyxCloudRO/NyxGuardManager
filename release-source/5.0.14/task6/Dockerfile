FROM node:22-bookworm-slim AS tools
WORKDIR /tools
COPY task3/package.json task3/package-lock.json ./
RUN npm ci --ignore-scripts --no-audit --no-fund
FROM nyxguardmanager:5.0.14-task5-candidate
COPY --from=tools /tools/node_modules /tmp/nyxguard-task6/node_modules
COPY task2/catalogs.mjs /tmp/nyxguard-task6/task2/
COPY task6/ /tmp/nyxguard-task6/task6/
RUN node /tmp/nyxguard-task6/task6/patch-frontend.mjs /app && rm -rf /tmp/nyxguard-task6
ENV NYXGUARD_SOURCE_REVISION=working-tree-task6 NPM_BUILD_COMMIT=working-tree-task6
LABEL org.opencontainers.image.revision="working-tree-task6"
