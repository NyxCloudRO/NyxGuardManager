# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [3.0.4] - 2026-02-11

### Added
- NyxGuard dashboard host observability block with live host metrics: CPU usage, RAM usage, HDD used/free/total.
- NyxGuard dashboard container observability block with live app-container metrics: CPU, RAM usage, RSS, NET I/O, and BLOCK I/O.
- Expanded theme catalog to 8 distinct themes, with Nyx Aurora preserved as the default for fresh installs.

### Fixed
- Host resources data path in production container: restored backend system metrics reporting and container metrics collection.
- Theme consistency: applied token-based button gradients per active theme across dashboard controls and action buttons.
- Dropdown/readability regressions: improved select and dropdown contrast to avoid white-on-white text in themed views.
- Theme persistence and runtime updates: stabilized global query/theme behavior so dashboard metrics refresh without manual page reload.

### Tweaks
- Refined theme naming and palette separation for clearer visual identity between themes.
- Improved attacks view visual language (theme-adaptive attack card/pills/select controls) while keeping readability high.
- Updated release metadata and installer defaults to 3.0.4 (`.version`, `docker-compose.yml`, `install.sh`, `update.sh`).

## [3.0.3] - 2026-02-10

### Changed
- UI/UX polish: refined left sidebar density and spacing (more compact, more readable).
- UI/UX polish: made the left sidebar background fully transparent so the dashboard gradient shows through (cleaner, less “boxed-in” feel).
- UI/UX polish: applied a consistent “glass” palette across cards, tables, dropdowns, and form controls for a cohesive operator UI.
- Header branding: updated the top-center wordmark styling to be compact and clean, with a static palette (no motion).
- Login branding: updated the login header branding to match the global header palette.
- Navigation copy: renamed GlobalGate menu entry to **GlobalGate Shieldwall**.

## [3.0.2] - 2026-02-10

### Changed
- Container hardening: removed remaining system Python wheel packages (`python3-pip-whl`, `python3-setuptools-whl`, etc.) from the production image to further reduce reported CVEs.

## [3.0.1] - 2026-02-10

### Changed
- Container hardening: reduced shipped CVE surface by removing runtime-unneeded tooling (system `python3-pip`/`setuptools` and the global `npm`/`npx` CLI stack) from the production image.

## [3.0.0] - 2026-02-10

### Added
- NyxGuard GlobalGate Security Layer: expanded global protection controls and tuning options, applied across protected apps (DB-backed).
- NyxGuard Attacks: attacks visibility and controls (including IP ban actions) with backend endpoints and UI pages.
- Expanded install validation: confirmed working installs on Ubuntu 22, Ubuntu 24, Debian 12, and Debian 13.
- SQL Shield Protection (SQL Injection Shield):
  - Global master toggle: `nyxguard_settings.sqli_enabled`.
  - Per-app toggle stored in proxy host metadata (enforced only when WAF is enabled for that app).
  - Nginx/Lua-based request scoring that inspects:
    - Request URI
    - Query-string keys/values (parameter-aware)
    - Small request bodies for `POST/PUT/PATCH/DELETE` (JSON/form/text), up to `sqli_max_body`
    - For JSON bodies: recursive key/value inspection to reduce obfuscation (with safety caps)
  - Blocking logic:
    - Hard block (403) when `score >= sqli_threshold`
    - Rolling correlation per IP using `lua_shared_dict nyxguard_sqli_ip`:
      - accumulate scores when `score >= sqli_probe_min_score`
      - block when accumulated score reaches `sqli_probe_ban_score` within `sqli_probe_window_sec`
  - Tunables stored in `nyxguard_settings`:
    - `sqli_threshold`, `sqli_max_body`
    - `sqli_probe_min_score`, `sqli_probe_ban_score`, `sqli_probe_window_sec`
- Attack event persistence:
  - New `nyxguard_attack_event` table (typed: `sqli`, `ddos`, `bot`) with indexed queries by time/type/IP.
  - New `nyxguard_attack_state` table to track nginx attack-log read position (inode/offset).
- DDoS, Bot, and Failed-login auto-ban tuning (stored in `nyxguard_settings`).
- Auth bypass controls:
  - Global setting (`nyxguard_settings.auth_bypass_enabled`).
  - Per-app setting (`nyxguard_app.auth_bypass_enabled`).
- Updated installer defaults to v3.0.0 and kept in-place update strategy (volumes preserved).

### Changed
- UI navigation: redesigned into a left sidebar layout to avoid covering dashboard content and to use available space effectively.
- Sidebar menu structure: flattened NyxGuard and Hosts sections into full menu items (improves discoverability and reduces overlay UI).
- Product requirements: updated minimum disk guidance to **40 GB** for small installs (short retention).
- Versioning/publishing: `docker-compose.yml` targets the published Docker image tag for the current release.

### Fixed
- Real client IP handling behind proxies/CDNs (including Cloudflare) for NyxGuard visibility and logging reliability.
- Multiple security hardening and stability fixes across backend routing and NyxGuard modules.

## [2.0.5] - 2026-02-09

### Added
- Live Traffic: new windows `Last 7d` and `Last 30d`.
- Traffic analytics: per-request and per-host RX/TX byte counters (derived from NyxGuard access logs).
- NyxGuard dashboard: shows RX/TX totals and per-host RX/TX columns in the Active Hosts table.
- NyxGuard dashboard: Geo Source badge now reflects what local GeoIP databases are installed (GeoLite2, IP2Location, or both).

### Changed
- Version display (login + footer): now shows only the current version (build date hidden).
- Access log format: now includes `[Rx ...]` and `[Tx ...]` fields for traffic aggregation.

### Fixed
- Frontend build: added missing TypeScript module declarations for CSS modules and `humps` in strict builds.

## [2.0.4] - 2026-02-09

### Fixed
- GeoIP: prevent nginx config errors when only one GeoIP provider is installed (no more “unknown variable” failures).

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

<!-- NyxGuard Manager v3.0.4 -->
