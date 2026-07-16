FROM node:22-bookworm-slim

RUN apt-get update \
	&& apt-get install -y --no-install-recommends wireguard-tools iproute2 iputils-ping ca-certificates \
	&& rm -rf /var/lib/apt/lists/*

WORKDIR /opt/nyxguard-vpn-agent
COPY agent.js ./agent.js

ENV NODE_ENV=production \
	NYXGUARD_VPN_STATE_DIR=/var/lib/nyxguard-vpn \
	NYXGUARD_VPN_AUTH_DIR=/run/nyxguard-vpn-auth \
	NYXGUARD_BACKEND_UID=1000

VOLUME ["/var/lib/nyxguard-vpn"]
CMD ["node", "/opt/nyxguard-vpn-agent/agent.js"]

LABEL org.opencontainers.image.version="4.0.14"
LABEL org.opencontainers.image.title="NyxGuard Manager VPN Agent"
LABEL org.opencontainers.image.source="https://github.com/NyxCloudRO/NyxGuardManager"
LABEL org.opencontainers.image.revision="4.0.14-vpn-ux-4"
