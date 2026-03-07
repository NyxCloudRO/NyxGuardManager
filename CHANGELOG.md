# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [4.0.0] - 2026-03-07

### Distribution
- NyxGuard Manager is now distributed exclusively as a prebuilt Docker image (`nyxmael/nyxguardmanager`) from Docker Hub.
- `install.sh` auto-detects the latest published semver tag from Docker Hub and pulls the image directly — no source code is deployed to end-user servers.
- `update.sh` detects the current running tag, fetches the latest published tag from Docker Hub, compares versions, prompts for confirmation, and applies the update in-place without removing Docker volumes (DB, config, and certificates are fully preserved).
- Systemd unit (`nyxguardmanager.service`) is automatically installed and enabled by `install.sh` for reboot persistence.
- `.env` with strong random passwords is generated automatically on first install if not already present.

### Security Layer — NyxGuard

#### WAF & Custom Rules
- WAF custom rule management: create, edit, reorder, enable/disable, and delete custom Nginx/Lua rules via the UI.
- Rules are applied live to Nginx without a full restart.
- Per-rule enable/disable toggle with instant propagation.

#### Web Controls Policy Engine
- Web Controls policy engine with full versioning: create, activate, and rollback policy versions.
- Effective-policy visibility: view the currently active policy vs. the draft.
- Rollback to any previous policy version from the UI.

#### Auth Bypass Hardening
- Per-proxy auth bypass toggle: enable or disable auth bypass protection per proxy host.
- Global master toggle in GlobalGate for auth bypass across all protected apps.
- Bidirectional sync: global toggle changes reflect per-app state; per-app overrides are respected independently.
- Auth bypass defaults to OFF on fresh installs.

#### GlobalGate Shieldwall
- Global master toggles for Bot Defence, DDoS Shield, SQL Shield, and Auth Bypass — applied across all protected apps simultaneously.
- Partial badge indicator: shows when some apps differ from the global state.
- Save/Reset feedback on GlobalGate controls.

#### SQL Shield (SQLi Protection)
- Global master toggle and per-app toggle for SQL injection protection.
- Nginx/Lua-based request scoring: inspects URI, query-string keys/values, and request bodies (JSON, form, text).
- Recursive JSON key/value inspection to resist obfuscation.
- Hard block (403) at threshold; rolling IP correlation for probe-pattern bans.
- Configurable tunables: threshold, max body size, probe window, and probe ban score.

#### Bot Defence & DDoS Shield
- Per-proxy and global toggles for Bot Defence and DDoS Shield.
- Auto-ban tuning for DDoS, bot, and failed-login patterns (configurable thresholds and ban durations).

#### Attacks Center
- Centralized attack stream: SQLi, Bot, DDoS, and AuthFail events with per-IP counters and last-seen timestamps.
- IP ban actions directly from the Attacks table: 24h, 30d, or permanent ban.
- Time window selector (1d / 7d / 30d) with auto-refresh.
- Sortable columns (IP, type, count, last seen) and filter bar (IP search, type filter, min-count filter).
- Clear logs action scoped to the selected time window.

#### IPs & Locations
- IP activity table with time windows: 15m, 1h, 1d, 7d.
- GeoIP country attribution per IP (MaxMind GeoLite2, IP2Location, or Cloudflare header).
- Sortable columns across all columns.
- GeoIP database management: manual upload (MaxMind or IP2Location `.mmdb`) or auto-update via MaxMind credentials.
- JSON export of the current IP table.
- Log retention controls.

#### Traffic Analytics
- Live traffic table with per-request and per-host RX/TX byte counters.
- Time windows: live, 1h, 1d, 7d, 30d.
- Sortable traffic log and sortable host summary table.
- Country column per request entry.

#### Rules Engine
- Allow/deny rules by IP, CIDR range, or Country (ISO code).
- Optional expiry per rule.
- Enable/disable individual rules without deleting them.

### Operations & Integrations

#### Event Center
- Centralized event log for operational, security, and change activity streams.
- Category filters (all / security / operational / change) and clear actions per category.
- Per-event severity indicators (critical, high, medium, info).

#### Notification Channels
- Webhook, Slack, and Email notification channels.
- Per-channel event-type selection (attack detected, ban applied, policy change, etc.).
- Test-send from the UI to verify channel configuration.

#### Integrations (Prometheus / Grafana)
- Token-based metrics endpoint compatible with Prometheus scraping.
- Metrics include: attack counters by type and window, traffic totals, active host count, and protection status.
- Integration tokens with rotation support.
- Ready-to-import Grafana dashboard JSON provided: panels for attack counters (24h/7d/30d/90d windows), traffic RX/TX, active hosts, and protection status per app.
- Full setup guide available at https://nyxcloud.ro/nyxguard/observability.html

#### Update Manager
- Built-in Update Manager in the UI: check for new versions, view changelog, and apply updates.
- "What's New" acknowledgement flow on first login after an update.

#### SSO (OIDC)
- SSO support via OIDC-compatible providers (Authentik and compatible auth providers).
- SSO login button on the login page; callback handled server-side.
- Users must have a matching local account (same email) before SSO login is permitted.
- CSRF-protected state store for the SSO flow.

#### LAN Access Controls
- IP/CIDR and MAC address allow-rules for the admin UI (port 8443).
- ARP-assisted host discovery to identify LAN devices for rule creation.
- Self-lockout prevention: LAN Access management routes are always exempt from MAC enforcement.
- Lockout warning when no active rules exist with LAN Access enabled.

### Proxy & Certificate Management
- Proxy Hosts (HTTP), Redirection Hosts, Streams (TCP/UDP), and 404 Hosts.
- Per-host SSL controls, access policies, advanced Nginx config, and custom locations.
- Let's Encrypt certificates via HTTP-01 and DNS challenge (multiple DNS providers supported).
- Access Lists, Users/Roles, and full audit logging.
- Setup wizard for first-run configuration.

### Login & Account Security
- Password recovery via recovery code: users can request a recovery code and reset their password without admin intervention.
- Two-factor authentication (2FA/TOTP) support for user accounts.
- Login page SSO button alongside standard credentials form.
- Timing-safe credential validation to resist enumeration attacks.
- Local SVG initials avatar (no external avatar requests).

### Dashboard & Observability
- NyxGuard main dashboard: live service posture, active host count, protection status badges, and decision stream.
- Defense Controls panel: bulk enable/disable WAF, Bot Defence, and DDoS Shield across all apps.
- Apps Overview: connected apps with per-app protection status.
- IP Intelligence panel: top countries, blocked rate, request totals.
- Host resource metrics: CPU, RAM, disk used/free/total.
- Container metrics: app container CPU, RAM, NET I/O, and BLOCK I/O.

### Themes
- 12 built-in themes: Nyx Cobalt, Control Matrix (Premium), Ember Forge, Forest Core, Midnight Steel, Oceanic Pulse, Crimson Noir, Frost Glyph, Velvet Singularity, Cobalt Eclipse, Obsidian Guard, Void Black.
- Theme is persisted and applied before first paint (no flash of unstyled content on page load or refresh).
- Theme switcher accessible from the sidebar.

### Infrastructure & Quality
- Startup time improvements: certbot site-packages persisted across restarts; IPv6 configuration skipped when unchanged.
- Exponential backoff on backend startup retry (capped at 60s).
- nginx default proxy timeout 60s; long-running paths keep 15m timeout.
- CSP header added to production nginx config.
- Integration tokens use 256-bit entropy with timing-safe comparison.
- API rate limiter uses per-user+IP composite key.
- Poll intervals for attack monitor and web threat monitor configurable via `NYXGUARD_POLL_INTERVAL_MS`.

---

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

## [3.0.3] - 2026-02-10

### Changed
- UI/UX polish: refined left sidebar density and spacing (more compact, more readable).
- UI/UX polish: made the left sidebar background fully transparent so the dashboard gradient shows through.
- UI/UX polish: applied a consistent glass palette across cards, tables, dropdowns, and form controls.
- Header branding: updated the top-center wordmark styling to be compact and clean.
- Login branding: updated the login header branding to match the global header palette.
- Navigation copy: renamed GlobalGate menu entry to **GlobalGate Shieldwall**.

## [3.0.2] - 2026-02-10

### Changed
- Container hardening: removed remaining system Python wheel packages from the production image to further reduce reported CVEs.

## [3.0.1] - 2026-02-10

### Changed
- Container hardening: reduced shipped CVE surface by removing runtime-unneeded tooling from the production image.

## [3.0.0] - 2026-02-10

### Added
- NyxGuard GlobalGate Security Layer: expanded global protection controls and tuning options.
- NyxGuard Attacks: attacks visibility and controls (including IP ban actions).
- Expanded install validation: confirmed working installs on Ubuntu 22, Ubuntu 24, Debian 12, and Debian 13.
- SQL Shield Protection (SQL Injection Shield) with global and per-app toggles.
- Attack event persistence: nyxguard_attack_event and nyxguard_attack_state tables.
- DDoS, Bot, and Failed-login auto-ban tuning stored in settings.
- Auth bypass controls: global setting and per-app setting.

### Changed
- UI navigation: redesigned into a left sidebar layout.
- Sidebar menu structure: flattened NyxGuard and Hosts sections into full menu items.
- Product requirements: updated minimum disk guidance to 40 GB for small installs.

### Fixed
- Real client IP handling behind proxies/CDNs (including Cloudflare).
- Multiple security hardening and stability fixes across backend routing and NyxGuard modules.

## [2.0.5] - 2026-02-09

### Added
- Live Traffic: new windows Last 7d and Last 30d.
- Traffic analytics: per-request and per-host RX/TX byte counters.
- NyxGuard dashboard: RX/TX totals and per-host RX/TX columns in the Active Hosts table.
- NyxGuard dashboard: Geo Source badge reflects installed GeoIP databases.

### Changed
- Version display (login + footer): now shows only the current version.
- Access log format: includes Rx and Tx fields for traffic aggregation.

## [2.0.4] - 2026-02-09

### Fixed
- GeoIP: prevent nginx config errors when only one GeoIP provider is installed.

## [2.0.3] - 2026-02-09

### Changed
- GeoIP auto-update: avoid re-downloading MaxMind databases on frequent restarts.
- GeoIP: added support for uploading an IP2Location .mmdb as a fallback country database.

## [2.0.2] - 2026-02-09

### Changed
- Container image publishing: installs now pull nyxmael/nyxguardmanager by default.
- Security: rebuilt the Docker image on the latest upstream base to pick up upstream patches.
- Security: rebuilt cert-prune from source during image build.

## [2.0.1] - 2026-02-09

### Added
- NyxGuard dashboard: IP Intelligence insights panel.
- NyxGuard dashboard: Apps Overview panel with connection and protection status.
- NyxGuard dashboard: Decision Stream with live allow/deny events and JSON export.
- NyxGuard Traffic page: live/recent traffic table with country column.
- NyxGuard Defense Controls: bulk enable/disable for WAF, Bot Defense, and DDoS Shield.
- IPs & Locations page: additional time filters and JSON export.
- Users: profile avatar upload/remove for user accounts.
- update.sh: in-place updater for existing installs.

### Changed
- NyxGuard dashboard layout: reorganized cards and tightened Defense Controls spacing.

### Fixed
- NyxGuard dashboard: Apps Overview no longer shows empty when proxy hosts exist.
- NyxGuard dashboard: IP Intelligence no longer stays empty when IP activity exists.
- NyxGuard rules: IP rule creation works correctly.
- NyxGuard bulk toggles: fixed WAF bulk endpoint routing.

## [2.0.0] - 2026-02-08

### Added
- Initial NyxGuard Manager v2.0.0 release.

---

> **Community & Support**
> NyxGuard Manager has a dedicated project website with full documentation, installation guides, feature breakdowns, architecture overview, and observability setup instructions.
> - Website & Docs: https://nyxcloud.ro/nyxguard
> - Install guide: https://nyxcloud.ro/nyxguard/install.html
> - Discord: join via the support link on the website for community help, feature requests, and release announcements.
> - Docker Hub: https://hub.docker.com/r/nyxmael/nyxguardmanager

<!-- NyxGuard Manager v4.0.0 -->
