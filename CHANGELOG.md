# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [2.0.1] - 2026-02-09

### Added
- NyxGuard dashboard: IP Intelligence insights panel powered by live IP activity (top countries, blocked rate, and top blocked IPs).
- NyxGuard dashboard: Apps Overview panel now reflects connected apps and protection status, with a quick preview list.
- `update.sh`: in-place updater for existing installs (fetch latest `main`, rebuild frontend + Docker image, restart stack) without wiping `.env` or volumes.
- Support badge: new “Buy me a coffee” button asset (`assets/buy-me-a-coffee.svg`).

### Changed
- Bumped default version/tag from `2.0.0` to `2.0.1` (`.version`, `install.sh`, `docker-compose.yml`, `README.md`).

### Fixed
- NyxGuard dashboard: “Apps Overview” no longer shows “No apps are connected” when proxy hosts exist.
- NyxGuard dashboard: “IP Intelligence” no longer stays empty when IP activity exists (uses `GET /api/nyxguard/ips`).

## [2.0.0] - 2026-02-08

### Added
- Initial NyxGuard Manager v2.0.0 release.

<!-- NyxGuard Manager v2.0.1 -->
