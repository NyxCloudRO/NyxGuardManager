# This is a Dockerfile intended to be built using `docker buildx`
# for multi-arch support. Building with `docker build` may have unexpected results.

# This file assumes that the frontend has been built using ./scripts/frontend-build

FROM golang:1.24-bookworm AS certprune-build
ARG CERT_PRUNE_VERSION="latest"
RUN set -eux; \
	apt-get update; \
	apt-get install -y --no-install-recommends git ca-certificates; \
	rm -rf /var/lib/apt/lists/*; \
	# Build from source so we can force patched deps when upstream lags.
	mkdir -p /src; \
	( git clone --depth 1 --branch "${CERT_PRUNE_VERSION}" https://github.com/axllent/cert-prune.git /src/cert-prune || git clone --depth 1 https://github.com/axllent/cert-prune.git /src/cert-prune ); \
	cd /src/cert-prune; \
	go mod edit -replace github.com/sirupsen/logrus=github.com/sirupsen/logrus@v1.9.3; \
	go mod tidy; \
	go build -trimpath -ldflags "-s -w" -o /go/bin/cert-prune .

FROM nginxproxymanager/testca AS testca
FROM jc21/nginx-proxy-manager:latest

ARG BUILD_VERSION
ARG BUILD_COMMIT
ARG BUILD_DATE

# See: https://github.com/just-containers/s6-overlay/blob/master/README.md
ENV SUPPRESS_NO_CONFIG_WARNING=1 \
	S6_BEHAVIOUR_IF_STAGE2_FAILS=1 \
	S6_CMD_WAIT_FOR_SERVICES_MAXTIME=0 \
	S6_FIX_ATTRS_HIDDEN=1 \
	S6_KILL_FINISH_MAXTIME=10000 \
	S6_VERBOSITY=1 \
	NODE_ENV=production \
	NPM_BUILD_VERSION="${BUILD_VERSION}" \
	NPM_BUILD_COMMIT="${BUILD_COMMIT}" \
	NPM_BUILD_DATE="${BUILD_DATE}" \
	NODE_OPTIONS="--openssl-legacy-provider"

RUN echo "fs.file-max = 65535" > /etc/sysctl.conf \
	&& apt-get update \
	&& apt-get upgrade -y \
	&& apt-get install -y --no-install-recommends jq logrotate \
	&& apt-get clean \
	&& rm -rf /var/lib/apt/lists/*

COPY --from=certprune-build /go/bin/cert-prune /usr/bin/cert-prune

EXPOSE 80 81 443

COPY backend       /app
COPY frontend/dist /app/frontend

WORKDIR /app
RUN yarn install \
	&& yarn cache clean

# Reduce shipped CVE surface:
# - npm/node-gyp are not required at runtime (backend runs via node + bundled deps).
# - python3-pip/setuptools are not required at runtime (certbot is handled via its own venv in the base image).
RUN rm -rf /usr/lib/node_modules/npm /usr/bin/npm /usr/bin/npx || true

# add late to limit cache-busting by modifications
COPY docker/rootfs /
COPY --from=testca /home/step/certs/root_ca.crt /etc/ssl/certs/NginxProxyManager.crt

# Remove frontend service not required for prod, dev nginx config as well
RUN rm -rf /etc/s6-overlay/s6-rc.d/user/contents.d/frontend /etc/nginx/conf.d/dev.conf \
	&& chmod 644 /etc/logrotate.d/nginx-proxy-manager

VOLUME [ "/data" ]
ENTRYPOINT [ "/init" ]

LABEL org.label-schema.schema-version="1.0" \
	org.label-schema.license="MIT" \
	org.label-schema.name="nginx-proxy-manager" \
	org.label-schema.description="Docker container for managing Nginx proxy hosts with a simple, powerful interface " \
	org.label-schema.url="https://github.com/jc21/nginx-proxy-manager" \
	org.label-schema.vcs-url="https://github.com/jc21/nginx-proxy-manager.git" \
	org.label-schema.cmd="docker run --rm -ti jc21/nginx-proxy-manager:latest"
