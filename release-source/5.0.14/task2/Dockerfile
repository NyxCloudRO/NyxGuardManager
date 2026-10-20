FROM node:22-bookworm-slim AS localization-tools
WORKDIR /tools
COPY task2/package.json task2/package-lock.json ./
RUN npm ci --ignore-scripts --no-audit --no-fund
# Accepted Task 1 action-menu candidate. No backend or VPN Agent modifications.
FROM nyxguardmanager:5.0.14-menu-candidate
COPY --from=localization-tools /tools/node_modules /tmp/nyxguard-task2/node_modules
COPY task2/ /tmp/nyxguard-task2/task2/
COPY locales/base-completion.json /tmp/nyxguard-task2/locales/base-completion.json
RUN node --test /tmp/nyxguard-task2/task2/tests/*.test.mjs \
 && node /tmp/nyxguard-task2/task2/patch-frontend.mjs /app /tmp/nyxguard-task2/task2 \
 && rm -rf /tmp/nyxguard-task2

ENV NYXGUARD_SOURCE_REVISION=working-tree-task2 NPM_BUILD_COMMIT=working-tree-task2
LABEL org.opencontainers.image.revision="working-tree-task2"
