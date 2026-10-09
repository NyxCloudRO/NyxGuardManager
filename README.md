<p align="center">
  <img src="assets/nyxguard-cover-panoramic.webp" alt="NyxGuard Manager — reverse proxy, application security and visibility" width="1000" />
</p>

<h1 align="center">NyxGuard Manager</h1>
<p align="center"><strong>Your applications. Your infrastructure. One security workspace.</strong></p>
<p align="center">A self-hosted reverse proxy with application protection, traffic intelligence,<br />WireGuard access and operational diagnostics.</p>

<p align="center">
  <a href="https://github.com/NyxCloudRO/NyxGuardManager/releases/tag/v5.0.7"><img src="https://img.shields.io/badge/release-5.0.7-00c8e8?style=flat-square" alt="Release 5.0.7" /></a>
  <a href="https://hub.docker.com/r/nyxmael/nyxguardmanager"><img src="https://img.shields.io/docker/pulls/nyxmael/nyxguardmanager?color=00c8e8&amp;style=flat-square" alt="Docker pulls" /></a>
  <a href="LICENSE.md"><img src="https://img.shields.io/badge/license-NMPLA-5279b8?style=flat-square" alt="NMPLA license" /></a>
</p>
<p align="center">
  <a href="#installation">Install</a> · <a href="#updates-and-recovery">Update</a> · <a href="#vpn-client-and-vpn-agent">VPN</a> · <a href="https://nyxcloud.ro/nyxguard/">Website</a> · <a href="docs/vpn-client.md">Documentation</a> · <a href="https://community.nyxcloud.ro/">Community</a>
</p>

---

<a id="release"></a>

## Overview

Manage HTTPS applications, certificates, access policies, traffic and remote VPN sites from one interface. Configuration, certificates and operational history stay on your infrastructure.

**Current release · 5.0.7** fixes SQL backup verification monitoring, same-version VPN repair, and persistent VPN startup. Verified-backup and recovery gates remain mandatory. Manager 5.0.7 uses **VPN Agent 5.0.1** and retains **schema 45**.

[Read the release notes](https://github.com/NyxCloudRO/NyxGuardManager/releases/tag/v5.0.7) · [Browse the changelog](CHANGELOG.md)

<a id="quick-install"></a>

## Installation

On a fresh supported Ubuntu or Debian host with systemd, run the matching command.

As **root**, including minimal Debian without sudo:

```bash
apt-get update
apt-get install -y ca-certificates curl
curl -fsSL https://raw.githubusercontent.com/NyxCloudRO/NyxGuardManager/main/install.sh -o /tmp/nyxguard-install.sh
bash /tmp/nyxguard-install.sh
```

As an ordinary user with **sudo privileges**:

```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl
curl -fsSL https://raw.githubusercontent.com/NyxCloudRO/NyxGuardManager/main/install.sh -o /tmp/nyxguard-install.sh
sudo bash /tmp/nyxguard-install.sh
```

The script checks effective privileges before changing the host. A missing `sudo` in a pipeline fails before the installer starts; use the root command when sudo is absent. Docker Compose v2 is required. Existing installations and volumes are retained; use the updater for an existing installation.

Open **`https://<your-host>:8443`** and complete the setup wizard. The initial self-signed certificate requires browser confirmation. The installer prepares Docker/Compose, persistent storage and automatic startup. Review the requirements below, especially TUN access if you need VPN.

For existing installations, use the [supported update procedure](#updates-and-recovery).

<a id="capabilities"></a>

## Main features

| Workspace | What it provides |
| --- | --- |
| Reverse proxy | HTTP/HTTPS Proxy Hosts, custom locations, Nginx configuration, access lists, users/roles, Let's Encrypt HTTP/DNS certificates and renewal |
| Security | Per-host WAF, Bot Defence, DDoS Shield, SQL Shield and Auth Bypass; GlobalGate master controls; versioned Web Controls with activation/rollback; custom WAF rules |
| Visibility | Live traffic and RX/TX, complete-window historical analytics, Threat Activity, IPs & Locations, GeoIP, administrative audit history and Event Center |
| Traffic policies | IP/CIDR and country allow/deny rules with expiration; verified crawler allowances require fresh verification after expiry |
| Remote access | Multi-site WireGuard profiles, independent interfaces/routes, handshakes, counters, ping checks, automatic reconnect and overlap protection |
| Operations | Setup wizard, notifications (webhook/Slack/email), token-protected Prometheus metrics, SSO/OIDC mapping, LAN access with ARP discovery, backups and built-in updates |
| Professional Support | License status, installation health, bounded host checks, guided troubleshooting and redacted support bundles with Support ID upload/readback |

Professional Support is optional. Signed entitlements are verified locally and stored in an encrypted persistent vault. Licensing failure does not disable core proxy management or security controls. Support bundles select structured fields and redact sensitive values; they are not raw configuration/log archives.

## Requirements

| Resource | Small installation | Recommended |
| --- | --- | --- |
| CPU | 2 vCPU | 4 vCPU |
| Memory | 2 GB | 8 GB |
| Storage | 40 GB | 60 GB SSD; more for high traffic or 60–180 day retention |
| Network | Host access to Docker registries and certificate services | Inbound TCP 80/443 for public applications; administration on HTTPS 8443 |

Capacity depends on traffic, protected applications and retention. Allow additional disk space for independent backups and staged database verification during upgrades.

## Supported operating systems

| Operating system | Support |
| --- | --- |
| Ubuntu 24.04 | Runtime installation tested with existing Docker/packages |
| Ubuntu 26.04 | Applicable prior release runtime validation; focused 5.0.7 coverage is documented separately |
| Debian 12 | Privilege entry points and package resolution tested |
| Other Debian/Ubuntu releases | Check Docker/Compose availability; clean-host validation is required |
| Other distributions | Not fully tested; install Docker/Compose yourself before evaluating |

VPN needs host TUN access and a reachable WireGuard endpoint. A restricted LXC guest needs device permission from its hypervisor. Manager and MariaDB can operate without VPN.

## Docker deployment

The normal installer deploys Manager and MariaDB, adding the compatible VPN Agent when TUN is usable. Data uses persistent Docker volumes; systemd provides automatic startup. The administration port is HTTPS **8443**, and proxied applications use TCP **80/443**.

HTTP-01 certificates need public inbound TCP 80. DNS challenges need the provider's credentials. Protected Apps are Proxy Hosts with WAF enabled.

<details>
<summary>Manual Docker Compose installation</summary>

For a **fresh installation**, create `/opt/nyxguardmanager`, then save this as `docker-compose.yml`. Manager 5.0.7 uses VPN Agent 5.0.1. Manager readiness comes from its image; do not replace it with an HTTP-only healthcheck.

```yaml
services:
  nyxguard-manager:
    container_name: nyxguard-manager
    image: nyxmael/nyxguardmanager:5.0.7
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
      - "8443:8443"
    environment:
      TZ: "${TZ:-UTC}"
      PUID: "${PUID:-1000}"
      PGID: "${PGID:-1000}"
      DB_MYSQL_HOST: "db"
      DB_MYSQL_PORT: "3306"
      DB_MYSQL_USER: "${DB_MYSQL_USER:-nyxguard}"
      DB_MYSQL_PASSWORD: "${DB_MYSQL_PASSWORD}"
      DB_MYSQL_NAME: "${DB_MYSQL_NAME:-nyxguard}"
      SKIP_CERTBOT_OWNERSHIP: "true"
      NYXCLOUD_LICENSE_VAULT_KEY_PATH: "/run/nyxguard-licensing/vault.key"
      NYXCLOUD_AUTHORITY_URL: "https://licensing.nyxcloud.ro"
      NYXCLOUD_SUPPORT_URL: "https://support-storage.nyxcloud.ro"
      NYXGUARD_VPN_AGENT_URL: "http://127.0.0.1:3198"
      NYXGUARD_VPN_AGENT_TOKEN_PATH: "/run/nyxguard-vpn-auth/token"
      # Persistent access-portal session. Chromium caps persistent cookies at 400 days.
      NYXGUARD_ACCESS_SESSION_TTL_SEC: "34560000"
    # Manager readiness is inherited from the accepted image.
    group_add:
      - "${DOCKER_SOCK_GID:?Set DOCKER_SOCK_GID to the numeric GID of /var/run/docker.sock}"
    volumes:
      - nyxguard_data:/data
      - nyxguard_letsencrypt:/etc/letsencrypt
      - /var/run/docker.sock:/var/run/docker.sock:ro
      - /etc/localtime:/etc/localtime:ro
      - /proc/1/net/arp:/host/proc/net/arp:ro
      - nyxguard_vpn_auth:/run/nyxguard-vpn-auth:ro
      - /var/lib/nyxguard-licensing/vault.key:/run/nyxguard-licensing/vault.key:ro
    depends_on:
      - db

  vpn-client-agent:
    container_name: nyxguard-vpn-agent
    image: nyxmael/nyxguardmanager-vpn-agent:5.0.1
    restart: unless-stopped
    network_mode: "service:nyxguard-manager"
    cap_add:
      - NET_ADMIN
    devices:
      - /dev/net/tun:/dev/net/tun
    environment:
      NYXGUARD_BACKEND_UID: "${PUID:-1000}"
    volumes:
      - nyxguard_vpn:/var/lib/nyxguard-vpn
      - nyxguard_vpn_auth:/run/nyxguard-vpn-auth
      - /etc/localtime:/etc/localtime:ro
    depends_on:
      nyxguard-manager:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "node", "-e", "const fs=require('fs');fetch('http://127.0.0.1:3198/status',{headers:{'X-NyxGuard-VPN-Token':fs.readFileSync('/run/nyxguard-vpn-auth/token','utf8').trim()}}).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 10s

  db:
    container_name: nyxguard-db
    image: jc21/mariadb-aria:latest
    restart: unless-stopped
    environment:
      TZ: "${TZ:-UTC}"
      MYSQL_ROOT_PASSWORD: "${MYSQL_ROOT_PASSWORD}"
      MYSQL_DATABASE: "${DB_MYSQL_NAME:-nyxguard}"
      MYSQL_USER: "${DB_MYSQL_USER:-nyxguard}"
      MYSQL_PASSWORD: "${DB_MYSQL_PASSWORD}"
    volumes:
      - nyxguard_db:/var/lib/mysql
      - /etc/localtime:/etc/localtime:ro

volumes:
  nyxguard_data:
    name: nyxguard_data
  nyxguard_letsencrypt:
    name: nyxguard_letsencrypt
  nyxguard_db:
    name: nyxguard_db
  nyxguard_vpn:
    name: nyxguard_vpn
  nyxguard_vpn_auth:
    name: nyxguard_vpn_auth
```

Create `.env` with strong, distinct database passwords:

```dotenv
TZ=UTC
PUID=1000
PGID=1000
DB_MYSQL_USER=nyxguard
DB_MYSQL_NAME=nyxguard
DB_MYSQL_PASSWORD=CHANGE_ME_STRONG_PASSWORD
MYSQL_ROOT_PASSWORD=CHANGE_ME_STRONG_ROOT_PASSWORD
```

Prepare socket access and a persistent licensing vault key. Preserve an existing key; never generate a replacement during an update.

```bash
chmod 600 .env
nyx_socket_gid="$(stat -c %g /var/run/docker.sock)"
sed -i "s/^PGID=.*/PGID=${nyx_socket_gid}/" .env
printf 'DOCKER_SOCK_GID=%s\n' "$nyx_socket_gid" >> .env
sudo install -d -m 0700 /var/lib/nyxguard-licensing
sudo sh -c 'test ! -e /var/lib/nyxguard-licensing/vault.key && test ! -L /var/lib/nyxguard-licensing/vault.key && umask 077 && set -C && head -c 32 /dev/urandom > /var/lib/nyxguard-licensing/vault.key'
sudo chown "1000:${nyx_socket_gid}" /var/lib/nyxguard-licensing /var/lib/nyxguard-licensing/vault.key
sudo chmod 0600 /var/lib/nyxguard-licensing/vault.key

docker compose --env-file .env up -d
```

Without TUN, start only `nyxguard-manager db`. Keep both services persistent; the installer configures Manager-only boot startup automatically. For a manual VPN-capable deployment, the included [systemd unit](systemd/nyxguardmanager.service) can be installed with `systemctl daemon-reload` and `systemctl enable --now nyxguardmanager.service`. A Manager-only unit must start only its two services.

Do not change volume names for an existing installation. Preserve any `NYXGUARD_*_VOLUME` overrides. Keep the VPN Agent in the current Manager network namespace; recreating Manager alone can strand it in the old namespace. Restart Manager and then Agent as a pair; restarting Manager also replaces its network namespace. Verify Agent availability from the VPN Client page, because individual container health flags do not prove their communication.

</details>

<a id="update-in-place"></a>

## Updates and recovery

Use the guarded host updater for standard installations:

```bash
curl -fsSL https://raw.githubusercontent.com/NyxCloudRO/NyxGuardManager/main/update.sh -o /tmp/nyxguard-update.sh
bash /tmp/nyxguard-update.sh # root; sudo users run: sudo bash /tmp/nyxguard-update.sh
```

The 5.0.7 updater supports source versions **5.0.0 through 5.0.6**. The updater protects the previous installation's DB/files/configuration, verifies the replacement and application data, and restores the protected source if activation fails. It preserves Manager-only or installed VPN topology. Retain your own independent database and volume backup.

For production upgrades, review the [official upgrade and recovery guide](docs/upgrade-5.0.7.md) before running the updater. **Known 5.0.7 limitation:** a valid retained 5.0.6 handover ledger can be rejected before a new transaction starts. Stop and retain evidence; wait for a reviewed correction rather than bypassing validation or retrying blindly.

After TUN becomes usable, activate only VPN at the current Manager version:

```bash
curl -fsSL https://raw.githubusercontent.com/NyxCloudRO/NyxGuardManager/main/update.sh -o /tmp/nyxguard-update.sh
env NYXGUARD_REPAIR_VPN=1 bash /tmp/nyxguard-update.sh
# sudo users: sudo env NYXGUARD_REPAIR_VPN=1 bash /tmp/nyxguard-update.sh
```

Repair reuses the installed Compose service, verifies TUN interface creation, starts only the Agent, and persists startup in systemd. It preserves Manager/DB and VPN volumes. The built-in updater offers check/download/apply. Do not force an unsupported transition or replace guarded updates with a bare Compose image switch. After updating, verify login, settings, proxy hosts, traffic/history, License, diagnostics, and configured VPN sites, then verify restart persistence.

<details>
<summary>Update options, legacy paths and recovery</summary>

| Variable | Use |
| --- | --- |
| `INSTALL_DIR` | Existing directory containing Compose and `.env` |
| `FORCE_TAG` | Select a supported, published version |
| `IMAGE_REPO` / `VPN_AGENT_REPO` | Alternative Manager/Agent repositories |
| `NYXGUARD_AUTO_YES=1` | Noninteractive confirmation |
| `NYXGUARD_REQUIRE_VPN=1` | Require TUN/VPN rather than accepting Manager-only topology |

For a manual installation, pass its actual `INSTALL_DIR` to the host updater. For a specific version, use `FORCE_TAG` only after checking its public release guidance. The installer uses `APP_TAG` to select a fresh-install image.

The historical 4.0.18 → 5.0.0 transition uses the verified host handover; see the [major-transition runbook](release-source/5.0.0/RELEASE_DAY_RUNBOOK.md) and documented intermediate release paths. The old 4.0.18 browser updater can report “Restart required” prematurely and assumes a VPN container; use the host workflow for that transition. Customized 4.x layouts require a verified recovery set.

Schema migrations are forward-only. Manual rollback requires the **pre-upgrade SQL database and matching source files/volumes**, Compose configuration, previous image and vault key. Never start an old image against a newer schema. Rollback loses writes after the recovery point. Retain the protected recovery artifacts if activation fails; inspect the reported transaction state before retrying.

The host updater reconciles actual runtime state. On supported installations, explicit same-version repair can install and persist a missing VPN Agent once TUN is available. Without TUN, Manager/DB continue without creating VPN state, and the updater supplies host-specific remediation.

</details>

## VPN Client and VPN Agent

Import WireGuard profiles in **Settings → VPN Client**. The separate **VPN Agent 5.0.1** manages interfaces and routes in Manager's network namespace. Site controls expose connection state, handshakes, counters and connectivity checks. Keep Manager and Agent together through restarts.

Installation is capability-based: usable read/write TUN enables Agent installation; unavailable TUN leaves Manager and MariaDB operational and clearly reports **VPN Agent pending — TUN unavailable**. The installer attempts safe guest-side device preparation, but it does not configure a hypervisor.

### Proxmox LXC: TUN and VPN Agent

Manager/database can run without TUN; VPN Agent needs usable read/write `/dev/net/tun`. NyxGuard does not configure the Proxmox host automatically.

Follow the [numbered Proxmox LXC/TUN setup and same-version repair guide](docs/proxmox-lxc-vpn.md). It separates **Proxmox host** and **LXC guest** commands, verifies the target CTID/hostname/IP, backs up its configuration, selects a free `devN` slot and uses supported device passthrough. Never overwrite an occupied slot or convert the LXC to privileged. Restart only the selected LXC if required.

After guest TUN is usable, the guide verifies the immutable public **5.0.7 updater** and runs explicit `FORCE_TAG=5.0.7 NYXGUARD_REPAIR_VPN=1` repair against the existing installation directory. It preserves Manager/database data and installs compatible **VPN Agent 5.0.1**. Then check health and **Settings → VPN Client**, a recent handshake and actual permitted-destination connectivity. TUN presence alone does not prove a working VPN.

See the [VPN Client guide](docs/vpn-client.md) for profiles, allowed networks and remote-peer troubleshooting, or the [website walkthrough](https://nyxcloud.ro/nyxguard/vpn-client.html#proxmox-lxc).

<details>
<summary>Optional GeoIP databases</summary>

Country resolution prefers Cloudflare's `CF-IPCountry`, then local MaxMind GeoLite2 Country, then IP2Location Country. Both local providers use `.mmdb` files.

For MaxMind, create an account and license key, download GeoLite2 Country, and upload under **NyxGuard → IPs & Locations → GeoIP DB**. Alternatively save the MaxMind AccountID/LicenseKey there to enable automatic updates. For IP2Location, download a Country `.mmdb` (Lite or paid) and select that provider when uploading.

</details>

## Quick health checks

```bash
curl -kI https://127.0.0.1:8443/
curl -ksS https://127.0.0.1:8443/api/ | jq
docker ps
docker exec nyxguard-manager node /app/internal/readiness-probe.mjs
docker logs --tail=100 nyxguard-manager
docker logs --tail=100 nyxguard-vpn-agent
```

Expect healthy Manager and DB, plus the VPN Agent on TUN-capable hosts. HTTP 200 alone does not prove database readiness, data preservation or working VPN sites. The Settings **VPN Client** tab shows Agent availability, site controls, handshakes, traffic and ping results. Connect controls appear in both the selected site and disconnected site cards; automatic reconnect starts after the first successful connection. Network/tunnel overlaps and local-network collisions are rejected.

## Security

Use strong credentials, limit access to the administration interface and keep independent database and volume backups. Store DNS-provider and other integration secrets securely. The licensing vault key is persistent: preserve it through updates and recovery.

The supported deployment uses a non-privileged Manager with the Docker socket group needed for metrics and guarded updates. Socket access is powerful even with a read-only bind; expose the administration interface only to trusted users. VPN Agent needs its documented NET_ADMIN capability and TUN device. Review [VPN routing and firewall guidance](docs/vpn-client.md) before connecting a profile.

Professional Support is optional and does not disable core proxy or security features when licensing is unavailable. Generated support bundles use structured redaction; review an exported bundle before sharing it.

<a id="support-and-project"></a>

## Documentation and support

Use [GitHub releases](https://github.com/NyxCloudRO/NyxGuardManager/releases), the [community](https://community.nyxcloud.ro/) and [NyxCloud](https://nyxcloud.ro/nyxguard/) for release and operational guidance. Professional Support adds Diagnostics & Support and Support ID workflows. [Support development](https://buymeacoffee.com/nyxmael).

Created by **Vlad-Eusebiu Cardei** to bring security, observability and predictable day-to-day operations into the same local-first proxy workflow. Project links: [NyxCloud](https://nyxcloud.ro/), [BillCore](https://billcore.ro/) and [Community](https://community.nyxcloud.ro/). Contact: Vlad.Cardei@NyxCloud.ro · Vlad.Cardei@Billcore.ro.

## License

NyxGuard Manager is free to use in internal personal and commercial environments under the **NyxGuard Manager Proprietary License (NMPLA)**. Modification, redistribution, resale and third-party hosting are not permitted. Read the full [license](LICENSE.md).

[Changelog](CHANGELOG.md) · [Release source map](release-source/README.md)

### Current baseline acceptance and interrupted upgrades

5.0.7 uses one release compatibility policy, Compose service metadata, a verified restorable backup, bounded migration progress, application/data checks and a durable commit or verified rollback. Migration progress never counts as healthy application startup. Existing operational records and secrets remain protected; only reviewed traffic counter history permits normal retention and live increments. Expired security rules remain stored and inactive.

A healthy installation trapped by unavailable historical recovery artifacts can explicitly accept a **fresh verified current baseline**. This preserves the old ledger and raw state with historical rollback unverified; it does not certify the missing original recovery point.

```bash
UPDATE_DIR="$(mktemp -d)"
chmod 700 "$UPDATE_DIR"
curl -fsSLo "$UPDATE_DIR/update.sh" https://raw.githubusercontent.com/NyxCloudRO/NyxGuardManager/v5.0.7/update.sh
env INSTALL_DIR=/opt/nyxguardmanager FORCE_TAG=5.0.7 NYXGUARD_BASELINE_PLAN=1 bash "$UPDATE_DIR/update.sh"
# Review the installation-bound challenge, then explicitly authorize acceptance:
env INSTALL_DIR=/opt/nyxguardmanager FORCE_TAG=5.0.7 NYXGUARD_AUTO_YES=1 \
  NYXGUARD_ACCEPT_BASELINE='<reviewed challenge>' \
  NYXGUARD_BASELINE_REASON='<administrator reason>' bash "$UPDATE_DIR/update.sh"
```

The commands above are shown for root; ordinary users with sudo privileges prefix `env` with `sudo`.

For an interrupted 5.0.6 transaction, use the same updater with `FORCE_TAG=5.0.6 NYXGUARD_RESUME=1`. It resumes the original durable helper under the shared installation lock; an uncommitted migration returns to the verified source before a fresh retry. Do not clear recovery flags manually or manufacture manifests. Retain recovery volumes and baseline receipts.

Fresh independent installations can use `NYXGUARD_INSTANCE`, `NYXGUARD_VAULT_DIR`, `NYXGUARD_HTTP_PORT`, `NYXGUARD_HTTPS_PORT` and `NYXGUARD_ADMIN_PORT`; defaults preserve the existing installation layout. The installer refuses to overwrite an existing installation directory.

## Publication review

Source and release publication follow the [public-source review policy](docs/publication-policy.md), including dependency, version, artifact and privacy checks.
