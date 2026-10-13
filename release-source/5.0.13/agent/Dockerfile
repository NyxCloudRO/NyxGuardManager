FROM nyxmael/nyxguardmanager-vpn-agent:5.0.1@sha256:1467a4cd22298de7543fed2e4673ab6af0e0259e616c7c9f61b83fd0d32415fe
ARG NYXGUARD_SOURCE_REVISION=uncommitted
RUN apt-get update && apt-get install -y --no-install-recommends nftables=1.0.6-2+deb12u2 && rm -rf /var/lib/apt/lists/*
COPY agent.js full-tunnel-routing.mjs /opt/nyxguard-vpn-agent/
LABEL org.opencontainers.image.version="5.0.2" org.opencontainers.image.revision="${NYXGUARD_SOURCE_REVISION}" org.opencontainers.image.source="https://github.com/NyxCloudRO/NyxGuardManager"
