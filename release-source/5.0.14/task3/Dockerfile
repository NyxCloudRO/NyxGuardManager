FROM node:22-bookworm-slim AS tools
WORKDIR /tools
COPY task3/package.json task3/package-lock.json ./
RUN npm ci --ignore-scripts --no-audit --no-fund
FROM nyxguardmanager:5.0.14-task2-candidate
COPY --from=tools /tools/node_modules /tmp/nyxguard-task3/node_modules
COPY task2/catalogs.mjs task2/validate.mjs /tmp/nyxguard-task3/task2/
COPY task3/ /tmp/nyxguard-task3/task3/
RUN node --test /tmp/nyxguard-task3/task3/tests/*.test.mjs \
 && node /tmp/nyxguard-task3/task3/patch-frontend.mjs /app \
 && rm -rf /tmp/nyxguard-task3
ENV NYXGUARD_SOURCE_REVISION=working-tree-task3 NPM_BUILD_COMMIT=working-tree-task3
LABEL org.opencontainers.image.revision="working-tree-task3"
