FROM nyxmael/nyxguardmanager:5.0.13@sha256:5ba98fb3e4e51abfd157861bc920f0c07fababa746709695e1e43a22cbd98bba
ARG NYXGUARD_SOURCE_REVISION=uncommitted
ENV NYXGUARD_SOURCE_REVISION=${NYXGUARD_SOURCE_REVISION}
COPY internal/ /app/internal/
COPY patch-backend.py patch-frontend.mjs read-only-capabilities.js native-controls.json /tmp/nyxguard-task1/
RUN python3 /tmp/nyxguard-task1/patch-backend.py /app \
 && node /tmp/nyxguard-task1/patch-frontend.mjs /app /tmp/nyxguard-task1 \
 && node --check /app/app.js \
 && node --check /app/lib/access.js \
 && node --check /app/internal/user.js \
 && node --check /app/internal/monitoring-boundary.mjs \
 && python3 -c "import json; p='/app/package.json'; d=json.load(open(p)); d['version']='5.0.14'; open(p,'w').write(json.dumps(d,indent=2)); p='/app/internal/release-policy.json'; d=json.load(open(p)); d['version']='5.0.14'; d['sources']['5.0.13']=46; open(p,'w').write(json.dumps(d,indent=2))" \
 && rm -rf /tmp/nyxguard-task1
ENV NPM_BUILD_VERSION=5.0.14 NPM_BUILD_COMMIT=${NYXGUARD_SOURCE_REVISION} NPM_BUILD_DATE=2026-10-14
LABEL org.opencontainers.image.version="5.0.14" org.opencontainers.image.revision="${NYXGUARD_SOURCE_REVISION}" org.opencontainers.image.source="https://github.com/NyxCloudRO/NyxGuardManager"
