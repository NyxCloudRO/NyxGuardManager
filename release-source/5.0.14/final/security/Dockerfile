FROM nyxguardmanager:5.0.14-preaudit AS accepted
FROM node:22-bookworm-slim AS dependencies
WORKDIR /work
COPY --from=accepted /app/package.json ./package.json
COPY --from=accepted /app/node_modules ./node_modules
COPY final/security/package.json final/security/package-lock.json ./
RUN npm install --ignore-scripts --omit=dev --no-audit --no-fund \
 && node -e 'require("bcrypt").hashSync("native-compatibility-fixture",4);new (require("better-sqlite3"))(":memory:").close()'
FROM accepted
COPY final/security/python-requirements.lock /tmp/nyxguard-python-requirements.lock
RUN apt-get update && DEBIAN_FRONTEND=noninteractive apt-get upgrade -y \
 && /opt/certbot/bin/python -m pip install --no-cache-dir --upgrade -r /tmp/nyxguard-python-requirements.lock \
 && /opt/certbot/bin/python -m pip check
RUN python3 -c 'import pathlib,shutil; old=pathlib.Path("/opt/certbot-site-packages-seed");shutil.rmtree(old);shutil.copytree("/opt/certbot/lib/python3.11/site-packages",old,symlinks=True)'
COPY --from=dependencies /work/package.json /app/package.json
COPY --from=dependencies /work/package-lock.json /app/package-lock.json
# Install the complete reviewed tree so no superseded vulnerable nested packages remain.
RUN python3 -c 'import shutil;shutil.rmtree("/app/node_modules")'
COPY --from=dependencies /work/node_modules /app/node_modules
RUN node -e 'require("bcrypt").hashSync("native-compatibility-fixture",4);new (require("better-sqlite3"))(":memory:").close()' \
 && /opt/certbot/bin/certbot plugins --text \
 && node --check /app/internal/integrations.js
ENV NYXGUARD_SOURCE_REVISION=working-tree-final-security NPM_BUILD_COMMIT=working-tree-final-security
LABEL org.opencontainers.image.revision="working-tree-final-security"
