<p align="center">
  <img src="assets/nyxguard-wordmark-clean.svg" alt="NyxGuard Manager" width="1000" />
</p>

## Changelog
<a href="CHANGELOG.md">
  <img src="assets/view-changelog.svg" alt="View Changelog" height="48" />
</a>

## Support
<a href="https://buymeacoffee.com/nyxmael" target="_blank" rel="noopener noreferrer">
  <img src="assets/buy-me-a-coffee.svg" alt="Buy me a coffee" height="54" />
</a>

## What You Get

### Reverse Proxy Manager
- Proxy Hosts (HTTP), Redirection Hosts, Streams (TCP/UDP), 404 Hosts
- Let’s Encrypt certificates: HTTP-01 and DNS providers
- Access Lists, Users, Audit Logs, Settings

### NyxGuard Security Layer
- Per-proxy toggles: WAF, Bot Defence, DDoS Shield
- Global toggles: Bot Defence (master), DDoS Shield (master)
- Dashboard: live status pills, live traffic view, active hosts summary
- IPs & Locations: 15m / 1h / 1d / 7d windows, retention 30 / 60 / 90 / 180 days
- Rules: allow/deny by IP/CIDR or Country (ISO), optional expiry 1 / 7 / 30 / 60 / 90 / 180 days

### GeoIP Country (Optional)
NyxGuard can show the **country code** for each IP (RO/FR/GB/etc). For accurate results you need a GeoIP database (MaxMind GeoLite2).

<!-- NyxGuard Manager v2.0.1 (stamp 2026-02-09T08:27:06Z) -->

Option A (manual upload):
1. Create a free MaxMind account.
2. Enable GeoLite2 downloads (this creates a License Key).
3. Download **GeoLite2 Country** (`.mmdb`).
4. Upload in the UI: **NyxGuard -> IPs & Locations -> GeoIP DB -> Upload**.

Option B (recommended, auto-update):
1. In **NyxGuard -> IPs & Locations**, enter your MaxMind `AccountID` and `LicenseKey` and save.
2. NyxGuard will keep the GeoLite2 database updated automatically.

## Install (Production Test)

NyxGuard Manager is published as a prebuilt Docker image on Docker Hub (`nyxmael/nyxguardmanager`).

### Install Via curl (Recommended)

Run as root on Ubuntu/Debian:

```bash
curl -fsSL https://raw.githubusercontent.com/NyxCloudRO/NyxGuardManager/main/install.sh | bash
```

By default the installer pulls `nyxmael/nyxguardmanager:<version>` and starts the stack with Docker Compose.

Optional:
- Build locally instead of pulling: `BUILD_LOCAL=true`
- Use a different image/repo: `IMAGE_REPO=youruser/nyxguardmanager`

### Install Via Docker (Compose)

1. Create an install directory:

```bash
sudo mkdir -p /opt/nyxguardmanager
cd /opt/nyxguardmanager
```

2. Download the compose file and create `.env`:

```bash
curl -fsSLO https://raw.githubusercontent.com/NyxCloudRO/NyxGuardManager/main/docker-compose.yml
curl -fsSLO https://raw.githubusercontent.com/NyxCloudRO/NyxGuardManager/main/.env.example
cp .env.example .env
```

3. Edit `.env` (set strong passwords for `DB_MYSQL_PASSWORD` and `MYSQL_ROOT_PASSWORD`), then start:

```bash
docker compose --env-file .env up -d
```

## Supported Distributions
- Ubuntu 24.xx (tested)
- Debian 13 (tested)
- Other distributions: not fully tested yet. We plan to validate and add them over time.

## Hardware Requirements (Guidelines)

Actual resource usage depends heavily on traffic volume, number of protected apps, and log retention.

- Minimum (small install / short retention):
  - 2 vCPU
  - 4 GB RAM
  - 25 GB disk
- Recommended (multiple apps / longer retention):
  - 4 vCPU
  - 8 GB RAM
  - 80 GB disk

Notes:
- Prefer SSD storage (log-heavy workloads are disk I/O sensitive).
- If you plan 60-180 days retention and/or high traffic, allocate more disk.

## Update (In-Place)

Use this if you already have NyxGuard Manager running and want to update without wiping config/data.

### Update Via curl (Installed In /opt/nyxguardmanager)

This is the default path when you installed via `install.sh`.

```bash
curl -fsSL https://raw.githubusercontent.com/NyxCloudRO/NyxGuardManager/main/update.sh | sudo bash
```

Optional environment variables:
- Pull from a different repo: `IMAGE_REPO=youruser/nyxguardmanager`
- Build locally instead of pulling: `BUILD_LOCAL=true`

Example:

```bash
IMAGE_REPO=nyxmael/nyxguardmanager BUILD_LOCAL=false \
  curl -fsSL https://raw.githubusercontent.com/NyxCloudRO/NyxGuardManager/main/update.sh | sudo bash
```

### Update Via Docker Compose (Manual Installs)

If you installed by downloading `docker-compose.yml` yourself:

```bash
cd /opt/nyxguardmanager
docker compose pull
docker compose --env-file .env up -d
```

### Notes

- Your data is stored in Docker volumes, so updates should not wipe config/certs/DB unless you delete volumes.
- If you previously migrated volumes (via `NYXGUARD_*_VOLUME` in `.env`), keep those values unchanged.

## Quick Health Checks

```bash
curl -I http://127.0.0.1:81/
curl -fsS http://127.0.0.1:81/api/ | jq
docker ps
docker logs --tail=100 nyxguard-manager
```

## Start On Boot (systemd)

If you run the stack with Docker Compose, you can enable the included systemd unit:

```bash
sudo install -m 0644 systemd/nyxguardmanager.service /etc/systemd/system/nyxguardmanager.service
sudo systemctl daemon-reload
sudo systemctl enable --now nyxguardmanager.service
```

## Notes
- Let’s Encrypt HTTP certificates require inbound `80/tcp` from the public internet to your server.
- DNS challenge certificates require the matching DNS provider credentials.
- “Protected Apps” are proxy hosts with WAF enabled.

## Private Repo Installs
The curl installer clones this repo. If the repo is private, `git clone` will require authentication (SSH key or HTTPS token).

## About Me
I created NyxGuard Manager to run a practical, self-hosted reverse proxy manager with security controls (WAF, bot defense, DDoS shielding, geo/IP insights) that are tightly integrated with proxy hosts, easy to toggle per-app, and observable in real time.

## License / Attribution
NyxGuard Manager is built on top of an upstream proxy-manager codebase and includes substantial modifications and new NyxGuard features.
