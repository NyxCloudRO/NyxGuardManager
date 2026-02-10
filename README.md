<p align="center">
  <img src="assets/nyxguard-wordmark-clean.svg" alt="NyxGuard Manager" width="1000" />
</p>

NyxGuard Manager is a production-ready reverse proxy manager with an integrated security layer (NyxGuard): WAF controls, SQL Shield protection, bot defense, DDoS shielding, auth-bypass controls, IP/Geo intelligence, attacks visibility, and real-time traffic analytics, designed to run locally on your own server with Docker.

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
- Per-proxy toggles: WAF, Bot Defence, DDoS Shield, SQL Shield, Auth Bypass
- Global toggles (GlobalGate): Bot Defence (master), DDoS Shield (master), SQL Shield (master), Auth Bypass (master)
- Dashboard: live status pills, live traffic view, active hosts summary + traffic analytics (RX/TX)
- Attacks: centralized attack stream and counters (SQLi / Bot / DDoS / AuthFail) with ban actions
- IPs & Locations: 15m / 1h / 1d / 7d windows, retention 30 / 60 / 90 / 180 days
- Rules: allow/deny by IP/CIDR or Country (ISO), optional expiry 1 / 7 / 30 / 60 / 90 / 180 days
- SQL Shield Protection (WAF companion):
  - Request scoring based on URI, query parameters, and small bodies (JSON/form/text) with a configurable max inspection size
  - Hard block when score exceeds threshold, plus rolling correlation to block repeated low/medium probes from the same IP
  - Structured attack logging to `/data/logs/nyxguard_attacks.log` (ingested into the database for the Attacks UI)

### GeoIP Country (Optional)
NyxGuard can show the **country code** for each IP (RO/FR/GB/etc). For accurate results you need a local GeoIP database.

Supported providers:
- **MaxMind GeoLite2 Country** (`.mmdb`) (free)
- **IP2Location Country** (`.mmdb`) (Lite/paid)

Resolution order:
1. Cloudflare header (`CF-IPCountry`) if you are behind Cloudflare
2. MaxMind GeoLite2 (if installed)
3. IP2Location (if installed)

<!-- NyxGuard Manager v3.0.2 (stamp 2026-02-10T23:55:00Z) -->

Option A (manual upload, MaxMind GeoLite2):
1. Create a free MaxMind account.
2. Enable GeoLite2 downloads (this creates a License Key).
3. Download **GeoLite2 Country** (`.mmdb`).
4. Upload in the UI: **NyxGuard -> IPs & Locations -> GeoIP DB** (select `MaxMind GeoLite2`) -> **Upload**.

Option B (recommended, auto-update):
1. In **NyxGuard -> IPs & Locations**, enter your MaxMind `AccountID` and `LicenseKey` and save.
2. NyxGuard will keep the GeoLite2 database updated automatically.

Option C (manual upload, IP2Location):
1. Download an IP2Location **Country** database in `.mmdb` format (Lite or paid).
2. Upload in the UI: **NyxGuard -> IPs & Locations -> GeoIP DB** (select `IP2Location (.mmdb)`) -> **Upload**.

## Install (Production Test)

NyxGuard Manager is published as a prebuilt Docker image on Docker Hub (`nyxmael/nyxguardmanager`).

### Install Via curl (Recommended)

On a fresh Ubuntu/Debian VM (or container), do a quick OS update first and ensure `curl` is installed:

```bash
sudo apt update
sudo apt -y upgrade
sudo apt install -y curl
```

Why this method is recommended:
- Installs into a predictable location: `/opt/nyxguardmanager` (override with `INSTALL_DIR=/your/path`)
- Ensures required dependencies are present (Docker + Compose on Ubuntu/Debian)
- Creates `.env` on first install and keeps upgrades in-place (data stays in Docker volumes)
- Keeps future updates consistent: `update.sh` expects the same install directory

Then run the installer (pinned to this release):

```bash
curl -fsSL https://raw.githubusercontent.com/NyxCloudRO/NyxGuardManager/main/install.sh | sudo APP_VERSION=3.0.2 bash
```

By default the installer pulls `nyxmael/nyxguardmanager:<version>` and starts the stack with Docker Compose.

Optional:
- Build locally instead of pulling: `BUILD_LOCAL=true`
- Use a different image/repo: `IMAGE_REPO=youruser/nyxguardmanager`
- Install a specific version: `APP_VERSION=3.0.2`

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

`docker-compose.yml` is pinned to `nyxmael/nyxguardmanager:3.0.2` for production installs. To use a different version, edit the `image:` tag in `docker-compose.yml`.

3. Edit `.env` (set strong passwords for `DB_MYSQL_PASSWORD` and `MYSQL_ROOT_PASSWORD`), then start:

```bash
docker compose --env-file .env up -d
```

## Supported Distributions
- Ubuntu 24.xx (tested)
- Ubuntu 22.xx (tested)
- Debian 13 (tested)
- Debian 12 (tested)
- Other distributions: not fully tested yet. We plan to validate and add them over time.

## Hardware Requirements (Guidelines)

Actual resource usage depends heavily on traffic volume, number of protected apps, and log retention.

- On a fresh install with little or no traffic, resource usage is typically very low. The recommended sizing becomes important as you add apps, enable protections, and increase retention and traffic.
- Baseline we observed on a clean Ubuntu 24 VM (idle, fresh install, NyxGuard Manager + DB running):
  - CPU: ~0.04% (on an 8 vCPU VM)
  - RAM: ~519 MiB
  - Disk: ~3.81 GiB used (on an ~78 GiB disk)
- Minimum (small install / short retention):
  - 2 vCPU
  - 4 GB RAM
  - 40 GB disk
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
- If you want to update to a specific release, change the `image:` tag in `docker-compose.yml` (for example, `nyxmael/nyxguardmanager:3.0.2`) before running `docker compose pull`.

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
I created **NyxGuard Manager** because I wanted a reverse proxy manager that feels like an *operator tool*, not a toy: simple to run on your own infrastructure, but serious about security, visibility, and day-2 operations.

My vision for NyxGuard Manager is:
- **Security that lives where you operate**: WAF-style controls, bot defence, DDoS shielding, and IP/geo insights that are built into the same workflow as your proxy hosts (per-app toggles, clear status, fast rollback).
- **Real-time observability, not guesswork**: live traffic, active hosts, and decision streams that make it obvious what is happening and why.
- **Local-first and predictable**: your configuration, certificates, and history stay on your server in volumes; updates are designed to be in-place without wiping your data.
- **Pragmatic by design**: focus on features that reduce operational load, make incidents easier to debug, and keep the UI fast and clean.

This release is validated in production-style deployments on Ubuntu 24 and Debian 13. More improvements and features will land soon.

## License / Attribution
<p>
  <img src="assets/free-forever.svg" alt="Commitment: Free Forever" height="48" />
</p>

NyxGuard Manager builds on an upstream reverse-proxy manager codebase and adds substantial engineering and product work: the NyxGuard security layer (WAF controls, SQL Shield, bot defense, DDoS protection), traffic analytics, and operational tooling.

**Commitment:** keep NyxGuard Manager **free to use** for both personal and enterprise deployments. We do not plan to introduce paid license tiers or a commercial licensing model. As the project grows, we aim to rely on the community: contributions, testing, feedback, and optional community support.
