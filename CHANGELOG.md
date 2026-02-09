# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [2.0.3] - 2026-02-09

### Changed
- GeoIP auto-update: avoid re-downloading MaxMind databases on frequent restarts (skips download if the local DB is still recent).
- GeoIP: added support for uploading an additional IP2Location `.mmdb` as a fallback country database (used when Cloudflare header is missing and MaxMind is unavailable).

## [2.0.2] - 2026-02-09

### Changed
- Container image publishing: installs now pull `nyxmael/nyxguardmanager` by default.
- Security: rebuilt the Docker image on the latest upstream `jc21/nginx-proxy-manager:latest` base to pick up upstream patches and reduce inherited CVEs (no functional app changes intended).
- Security: rebuilt `cert-prune` from source during the image build (`golang:1.22-bookworm`, `cert-prune@latest`) to reduce CVEs attributed to the previously bundled binary (no functional app changes intended).

## [2.0.1] - 2026-02-09

### Added
- NyxGuard dashboard: IP Intelligence insights panel powered by live IP activity (top countries, blocked rate, and request totals).
- NyxGuard dashboard: Apps Overview panel now reflects connected apps and protection status, with a quick preview list.
- NyxGuard dashboard: Decision Stream now renders live allow/deny events (realtime/15m/24h) with JSON export.
- NyxGuard Traffic page: live/recent traffic table with country column.
- NyxGuard Defense Controls: bulk enable/disable for WAF, Bot Defense, and DDoS Shield across apps.
- IPs & Locations page: additional time filters (30m/60m/30d/60d/90d) and JSON export for the current table.
- Users: profile avatar upload/remove for user accounts (shown in header and user lists).
- `update.sh`: in-place updater for existing installs (fetch latest `main`, rebuild frontend + Docker image, restart stack) without wiping `.env` or volumes.
- Support badge: new “Buy me a coffee” button asset (`assets/buy-me-a-coffee.svg`).

### Changed
- Bumped default version/tag from `2.0.0` to `2.0.1` (`.version`, `install.sh`, `docker-compose.yml`, `README.md`).
- NyxGuard dashboard layout: reorganized cards and tightened Defense Controls spacing/alignment.

### Fixed
- NyxGuard dashboard: “Apps Overview” no longer shows “No apps are connected” when proxy hosts exist.
- NyxGuard dashboard: “IP Intelligence” no longer stays empty when IP activity exists (uses `GET /api/nyxguard/ips`).
- NyxGuard rules: IP rule creation now works correctly; dashboard rules cards show summary counters only (no per-rule list).
- NyxGuard bulk toggles: fixed WAF bulk endpoint routing and ensured bulk changes apply to per-app protection flags.

## [2.0.0] - 2026-02-08

### Added
- Initial NyxGuard Manager v2.0.0 release.

<!-- NyxGuard Manager v2.0.1 (stamp 2026-02-09T08:27:06Z) -->
