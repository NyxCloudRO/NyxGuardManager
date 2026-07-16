# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [4.0.14] - 2026-07-15

### Major improvement — Multi-site WireGuard VPN Client

- Introduced multi-site VPN management directly in NyxGuard, with independent WireGuard profiles, interfaces, routes, connection state, transfer statistics, handshakes, and connectivity tests for every remote site.
- Promoted VPN Client to a dedicated main-sidebar workspace instead of mixing tunnel operations into Settings.
- Added clear per-site workflows for upload, validation, naming, renaming, connect, disconnect, removal, and private-address testing.
- Added an always-visible connection action for disconnected sites, including a distinct Connect VPN control in the site details and a quick-connect action in the site list.
- Refined Add VPN site into a guided validation workflow with optional naming, immediate file-selection feedback, actionable errors, and clearly active controls.
- Added route and tunnel-address overlap protection so traffic cannot be sent through the wrong remote site.
- Added preflight protection against remote CIDRs that overlap a network already attached to NyxGuard.
- Added safe handling for full-tunnel profiles, DNS directives, and executable WireGuard hooks while preserving NyxGuard's host networking and resolver configuration.

### Security architecture

- Privileged tunnel operations run in a dedicated loopback-only VPN agent with narrowly scoped `NET_ADMIN` and TUN access; the NyxGuard Manager web application remains unprivileged.
- WireGuard private keys remain in a restricted persistent volume and are never returned by the Manager API or displayed in the interface.
- Each site receives an isolated interface and explicit destination routes, with validation before a profile can be stored or activated.

### Operations and documentation

- Published matching Manager and VPN agent images, Compose definitions, installer support, reboot persistence, and in-place upgrade support for version 4.0.14.
- Added host capability detection so installations remain operational when optional VPN prerequisites are not yet available.
- Added a comprehensive networking guide for remote-site planning, routing, firewalls, NAT, diagnostics, application publishing, and multi-site deployments.
- Expanded release documentation and in-app guidance for production planning and day-two operations.

## [4.0.13] - 2026-07-13

### Added
- Published the official `nyxmael/nyxguardmanager:4.0.13` Docker image and updated `latest` to the identical release digest.
- Added an explicit `Expires` attribute alongside `Max-Age` for protected-application session compatibility.

### Changed
- Updated application, container, installer, Compose, and compiled frontend version metadata to `4.0.13`.
- Updated the release image identity to `release-4.0.13` with a `2026-07-13` build date and OCI version label.
- Set the documented protected-application session lifetime to 400 days, the maximum persistent-cookie lifetime supported by current Chromium browsers.
- Kept the legacy `nyxguard_access` cookie valid during migration to avoid invalidating existing sessions unnecessarily.
- Refreshed the public installation guide with 4.0.13 Compose examples and current hardware guidance.

### Fixed
- Fixed successful protected-application logins that could redirect back to the NyxGuard login page after several minutes because subsequent requests arrived without the session cookie.
- Hardened protected-application sessions with a host-only `__Host-nyxguard_access` cookie on HTTPS.
- Added explicit persistent-cookie expiry and cross-site/WebSocket-safe HTTPS cookie attributes.
- Ensured plain HTTP development environments retain the compatible legacy cookie name and `SameSite=Lax` behavior.

### Security
- Bound hardened access cookies to the protected hostname by using the browser-enforced `__Host-` prefix with `Secure` and `Path=/`.

## [4.0.12] - 2026-05-16

### Added
- Added a fresh Docker release image for `4.0.12`.
- Added the long-window IP Insights hotfix to the published release image.
- Added the latest local UI polish assets for dashboard panels, GlobalGate spacing, theme badges, Event Center controls, settings text backgrounds, and action menus.

### Changed
- Updated production deployment references, Docker Compose examples, installer examples, and local version metadata to `4.0.12`.
- Updated release metadata so the container reports `NPM_BUILD_VERSION=4.0.12`, `NPM_BUILD_COMMIT=release-4.0.12`, and `NPM_BUILD_DATE=2026-05-16`.
- Increased the bounded attack-log request limit used by IP Insights so longer reporting windows can load complete result sets.
- Standardized the Event Center current-version label to match the Settings version pill wording.

### Fixed
- Fixed long-window IP intelligence requests that were capped too low for larger 7-day, 30-day, and longer views.
- Preserved the certificate expiry table display fix in the new release image.
- Fixed several theme and panel consistency issues across modern, AppPage, and legacy menu surfaces.

## [4.0.11] - 2026-05-02

### Added
- Added a fresh Docker release image for `4.0.11`.
- Added a refreshed NyxGuard GitHub cover image using the new `Wallpaper1.png` artwork.
- Added a compact, release-ready Grafana dashboard JSON with the latest production fixes baked into the app download endpoint.

### Changed
- Updated production deployment references, Docker Compose examples, installer examples, and local version metadata to `4.0.11`.
- Reworked the Grafana attack-range summary pills so the selected range panel follows the active Grafana time picker instead of fixed 7-day or 90-day windows.
- Replaced the old fixed 90-day attack pill with an average-attacks-per-day view for easier sanity checking across selected ranges.
- Rewired the Top Attacked Hosts panel into Top Impacted Hosts (4xx/5xx), using complete per-app 4xx/5xx traffic metrics instead of the narrower attack-event table.
- Refined Grafana range-gating expressions so dashboard panels switch cleanly between 24h, 7d, 30d, and 90d windows.
- Updated README Changelog and Support buttons to match the default NyxGuard dark cyan theme.

### Improved
- Improved Grafana provisioning reliability by keeping the bundled dashboard JSON aligned with the live production dashboard source.
- Improved main dashboard GlobalGate status pill consistency by matching the actual GlobalGate toggle state styling.
- Compacted the main dashboard Decision Stream layout so recent allow/deny traffic is easier to scan.
- Improved the app favicon with a sharper NyxGuard-style mark for browser tabs.
- Improved SSO settings persistence and callback account matching for OIDC/Auth provider flows.

### Fixed
- Fixed Grafana dashboard panels that appeared stuck when changing the time range.
- Fixed misleading Top Attacked Hosts coverage when multiple apps had impacted traffic but no matching attack-event rows.
- Fixed duplicate notification sends for the same alert identity so repeated messages are not emitted for the same IP/event combination until the alert changes.
- Fixed intermittent Grafana "No data" behavior caused by stale or incomplete dashboard/query wiring.
- Fixed bundled Grafana dashboard export so fresh installs and future deployments include the latest production dashboard fixes.
- Fixed SSO save handling for enablement, provider URL, client ID, client secret, and application slug settings.

## [4.0.10] - 2026-05-01

### Added
- Added a refreshed Docker release image for `4.0.10`.
- Added improved Grafana dashboard coverage for security, application, and host observability views.
- Added Failed Login notification coverage for failed app login attempts, including Discord/webhook delivery with attempted identity, source IP, user agent, and reason.

### Changed
- Updated production deployment references and setup examples to `4.0.10`.
- Refined bundled monitoring assets for cleaner Prometheus/Grafana onboarding.
- Improved release metadata consistency across Docker Compose, installer guidance, and update examples.
- Improved notification channel presentation so saved webhook data stays in the background while event options remain organized.
- Improved Discord notification formatting with cleaner embed-style payloads and safer field formatting.
- Improved email notification setup and test handling for SMTP channels, including TLS behavior and password preservation while editing saved channels.

### Improved
- Enhanced dashboard query compatibility for host CPU, memory, disk, and network telemetry.
- Improved dashboard portability across fresh monitoring installs and existing Prometheus setups.
- Polished operational documentation for faster install, update, and manual Docker Compose workflows.

### Fixed
- Fixed duplicate Failed Login event pills and stray Failed Login checkboxes appearing outside the notification channel form.
- Fixed the built-in Update Manager overlay so upgrade steps, logs, confirmations, and action buttons stay visible above the dashboard instead of being hidden behind the page layout.
- Fixed Update Manager version detection so the app uses the runtime build version before package metadata.
- Fixed Docker image pull/apply behavior in the Update Manager to use published plain Docker tags like `4.0.10` instead of non-existent `v4.0.10` tags.

## [4.0.9] - 2026-04-29

### Changed
- Updated release references and setup examples to `4.0.9`.
- Improved small UI spacing and alignment details across the NyxGuard management views.
- Polished action controls and status labels for a cleaner, more consistent interface.

### Fixed
- Fixed attack-ban duration changes so switching from the default 24-hour ban to 30-day or permanent updates the active deny rule immediately.
- Cleared cached Threat Activity responses after ban changes so the UI reflects the new ban duration without waiting for stale route cache expiry.
- Disabled duplicate active deny rows for the same IP when a ban is adjusted, preventing old 24-hour rows from continuing to appear in Threat Activity.
- Improved frontend loading after upgrades so the app renders correctly after an asset refresh.
- Unified Certificates table row hover styling so each certificate uses one consistent hover color.
- Improved startup compatibility after NyxGuard Manager branding updates.

## [4.0.7] - 2026-04-28

### Changed
- Updated release references to `4.0.7`.
- Refined Control Matrix, Cobalt, and shared action-pill styling for better contrast, spacing, and alignment across themes.
- Improved GlobalGate, Traffic Rules, Web Controls, WAF Custom Rules, Threat Activity, IPs & Locations, and Live Traffic control spacing.
- Refined NyxGuard time-window pills and header action buttons so inactive controls stay visually separate and compact across themes.
- Updated Users table search styling so the search icon and input render as one unified field while Add User remains separate.

### Fixed
- Bridged NyxGuard attack monitor detections into Web Threat events so the Web Threat Recent Events panel receives inbound block events from existing protection logs.
- Fixed attack-ban adjustments from the 24-hour autoban flow so 30-day and permanent changes update the active deny rule correctly.
- Fixed IPs & Locations JSON export so it still downloads the current window payload when the result set is empty.
- Improved frontend loading after updates so the app renders fully instead of showing only the background.

## [4.0.5] - 2026-04-25

### Fixed
- Updated the app-wide runtime, footer, settings, login, and Event Center version markers to `4.0.5`.
- Fixed Event Center Access Logs so access portal login events and access-check denial events are included.
- Expanded the Event Center access-log lookback window to keep older access events visible.
- Improved the Users toolbar spacing so search and Add User controls no longer crowd each other.
- Fixed duplicate Community links in the sidebar preferences area.
- Refined sidebar action links so Support and Community remain visible and aligned without opening preferences.
- Replaced plain sidebar navigation icons with richer NyxGuard-styled icon tiles.
- Tightened sidebar navigation spacing so the upgraded icons do not force unnecessary sidebar scrolling.
- Removed the visible grid texture from the Premium Nyx background while preserving the dark cyan color depth.
- Improved Nyx Cobalt sidebar color coverage and account dropdown contrast.
- Scoped theme-specific account dropdown color fixes so other themes keep their own palette while retaining the dropdown stacking fix.

## [4.0.4] - 2026-04-23

### Fixed
- Improved bundled UI compatibility for the `4.0.4` release.

## [4.0.3] - 2026-04-23

### Fixed
- Fixed the built-in Update Manager modal so all update steps and options remain visible on shorter viewports.
- Made the update dialog top-aligned and scrollable, with viewport-height fallback handling for browsers without dynamic viewport unit support.
- Updated the bundled UI version marker to show `4.0.3`.

## [4.0.2] - 2026-04-23

### Fixed
- Improved the release update flow for tagged installs.
- Refreshed NyxGuard attack log and attack monitor handling with the latest `4.0.2` fixes.
- Kept temporary allow/deny rules out of active-ban API results after expiry.
- Preserved private/internal and trusted-self source ranges from automatic ban actions.

## [4.0.1] - 2026-04-22

### UI
- Replaced the sidebar Discord entry with a standard `Community` menu item.
- The new `Community` link opens `https://community.nyxcloud.ro/`.

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
- Full setup guide available at https://nyxcloud.ro/nyxguard/install.html

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
- Proxy Hosts (HTTP) (HTTPS)
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
- CSP header added to the nginx config.
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
- Host resources data path: restored backend system metrics reporting and container metrics collection.
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
- Container hardening: removed remaining system Python wheel packages to further reduce reported CVEs.

## [3.0.1] - 2026-02-10

### Changed
- Container hardening: reduced shipped CVE surface by removing runtime-unneeded tooling.

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
