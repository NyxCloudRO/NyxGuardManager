FROM node:22-bookworm-slim AS tools
WORKDIR /tools
COPY task3/package.json task3/package-lock.json ./
RUN npm ci --ignore-scripts --no-audit --no-fund
FROM nyxguardmanager:5.0.14-task4-candidate
COPY --from=tools /tools/node_modules /tmp/nyxguard-task5/node_modules
COPY task5/ /tmp/nyxguard-task5/task5/
RUN node /tmp/nyxguard-task5/task5/patch-frontend.mjs /app && rm -rf /tmp/nyxguard-task5
ENV NYXGUARD_SOURCE_REVISION=working-tree-task5 NPM_BUILD_COMMIT=working-tree-task5
LABEL org.opencontainers.image.revision="working-tree-task5"
