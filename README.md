# NyxGuard Manager (v2.0.1)

NyxGuard Manager is a self-hosted reverse proxy manager with an integrated WAF-style security layer (NyxGuard).

Admin UI: `http://<server-ip>:81/`

## Changelog
<a href="CHANGELOG.md">
  <img src="assets/view-changelog.svg" alt="View Changelog" height="48" />
</a>

## Support
<a href="https://buymeacoffee.com/nyxmael" target="_blank" rel="noopener noreferrer">
  <img src="assets/buy-me-a-coffee.svg" alt="Buy me a coffee" height="54" />
</a>

## What You Get

### Core Proxy Manager
- Proxy Hosts, Redirection Hosts, Streams, and 404 Hosts
- Let’s Encrypt certificates (HTTP-01 and DNS providers)
- Access Lists, Users, Audit Logs, Settings

### NyxGuard (Security Layer)
- Per-app protection toggles (Proxy Host modal):
  - Enable WAF
  - Enable Bot Defence
  - Enable DDoS Shield
- Global feature toggles (NyxGuard page):
  - Bot Defence (master)
  - DDoS Shield (master)
- Live status pills on NyxGuard dashboard when features are enabled
- Live traffic view + active hosts summary
- IPs & Locations with time windows (15m / 1h / 1d / 7d)
- Log retention selector (30 / 60 / 90 / 180 days)
- Rules (Allow / Deny):
  - IP / CIDR allow/deny, optional expiry (1 / 7 / 30 / 60 / 90 / 180 days)
  - Country allow/deny by ISO code (MD / FR / GB, etc), optional expiry

### GeoIP Country (Optional)
NyxGuard can show the **country code** for each IP (RO/FR/GB/etc). For accurate results you need a GeoIP database (MaxMind GeoLite2).

<!-- NyxGuard Manager v2.0.1 (stamp 2026-02-09T08:27:06Z) -->

How to get the file (free):
1. Create a free MaxMind account.
2. In MaxMind, enable GeoLite2 downloads (this creates a License Key).
3. Download the database: **GeoLite2 Country** in `.mmdb` format.
4. Upload it in the UI: **NyxGuard -> IPs & Locations -> GeoIP DB -> Upload**.

Alternative (recommended): auto-update
- In **NyxGuard -> IPs & Locations**, enter your MaxMind `AccountID` + `LicenseKey` and save.
- NyxGuard will keep the GeoLite2 databases updated automatically.

## Install (Production Test)

This repo is not published as a prebuilt image on Docker Hub. The install builds the image locally.

## Supported Distributions
- Ubuntu 24.xx (tested)
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

Run as root on Ubuntu/Debian:

```bash
curl -fsSL https://raw.githubusercontent.com/NyxCloudRO/NyxGuardManager/main/install.sh | bash
```

## Update (In-Place)

If you already installed NyxGuard Manager and want the latest code + a rebuilt local image without wiping your config:

```bash
curl -fsSL https://raw.githubusercontent.com/NyxCloudRO/NyxGuardManager/main/update.sh | sudo bash
```

After install:
- Open `http://<server-ip>:81/`
- Complete the setup wizard / create admin user

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
