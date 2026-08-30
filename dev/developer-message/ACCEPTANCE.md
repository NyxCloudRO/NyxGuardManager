# Developer Message — final DEV acceptance

Accepted on 2026-08-30 against the local NyxGuard Manager 4.0.18 DEV
candidate. This is an internal acceptance record, not a release marker.

## Architecture and persistence

- The frontend waits for the authenticated application shell, reads the current
  JWT from NyxGuard's existing authentication store, and performs one
  acknowledgement check per token.
- `Continue`, close, backdrop, and Escape write only the per-user
  `sessionStorage` guard. Refresh stays dismissed; logout clears the guard; a
  later login shows the message again.
- `Support NyxGuard` reuses the existing sidebar's canonical HTTPS destination,
  `https://buymeacoffee.com/nyxmael`, with `_blank` and
  `noopener noreferrer`, then records acknowledgement. No donation verification,
  telemetry, feature restriction, or payment state exists.
- Migration `20260830120000_developer_message_acknowledgement.js` adds nullable
  `user.developer_message_acknowledged_on`. Existing and new/unmigrated users
  remain unacknowledged by default; no existing rows are rewritten.
- GET and POST `/api/developer-message` require a valid JWT, derive the user ID
  only from that token, authorize access to that same user, and accept no user
  ID from request body, path, or query. Unauthenticated GET and POST both remain
  rejected.

## Browser and accessibility acceptance

The committed `browser-acceptance.py` passed once after a clean DEV Manager and
VPN-agent recreation:

- Unacknowledged login displayed the dialog.
- Continue dismissed for the session, remained dismissed on refresh, and
  displayed again after logout/login.
- X and Escape dismissed for the session and displayed again after later login.
- Support opened the canonical destination safely, persisted User A's
  acknowledgement, suppressed User A's later automatic dialog, and left the
  sidebar Support action present and functional.
- User B remained unacknowledged, proving per-user isolation.
- The dialog exposed `role="dialog"`, `aria-modal="true"`, an accessible title
  and description, initial close-button focus, trapped/wrapped Tab focus,
  meaningful action labels, visible focus styling, Escape handling, inert hidden
  background content, and supported focus restoration.
- Refresh produced neither repeated mounting nor a repeated acknowledgement
  request loop.
- Chromium recorded zero severe console errors.

Viewport measurements:

| Target | Rendered viewport | Dialog horizontal bounds | Dialog/footer bottom | Document/modal overflow | Background |
| --- | --- | --- | --- | --- | --- |
| 1920×1080 desktop | 1920×937 | 520–1400 | 921 / 920 | 1920 / 878=878 | locked |
| 1366×768 constrained | 1366×625 | 243–1123 | 609 / 608 | 1366 / 878=878 | locked |
| 390×844 mobile | 390×701 | 8–382 | 693 / 692 | 390 / 372=372 | locked |

Read-only inspection of the captured renders confirmed NyxGuard's navy/cyan
identity, the existing magenta Support accent, clear title/lead hierarchy,
readable spacing and line length, clean internal scrolling, reachable actions,
and no clipped text, buttons, or horizontal overflow.

## Combined candidate regressions

- Custom Locations: build-time source and patched-image tests passed for numeric
  port serialization, strict validation, generic host-with-path rendering, and
  duplicate `absolute_redirect` compatibility. The deployed `nginx -t` passed;
  the four persistent DEV Proxy Hosts remained present.
- Threat Activity: build-time and deployed integration tests passed for the
  independent total, bounded 200/200/130 and 200/50 pagination, server-side
  search/filter/min-count/sort, deterministic ordering, and preserved ban data.
- Developer Message: image/source assertions, unauthenticated integration, and
  the clean committed browser sequence passed.

## DEV identity, health, and data safety

- Candidate source revision:
  `1bca4415e1de4082929525c3c1fbaa5b45f5c536`.
- Local image ID:
  `sha256:122dd21a5cda22077f8fc1604246d47d5fed722c0ce29c0a511ee4bc82c83871`.
- Image version label: `4.0.18-dev-developer-message`.
- Image revision label and runtime health commit: the exact candidate source
  revision above, not `release-4.0.18`.
- Runtime health: status OK, setup complete, version/build `4.0.18`, build date
  2026-08-30.
- Manager: healthy, restart count 0.
- MariaDB: `mysqld is alive`, restart count 0 (the image defines no Docker
  healthcheck).
- VPN agent: healthy, restart count 0; the unchanged 4.0.16 agent remains paired
  to the Manager's network namespace.
- Schema current version: `20260830120000`, migration batch 15.
- Persistent counts were unchanged across final acceptance: 7 total user rows,
  2 active users, 4 Proxy Hosts, 0 certificates, and 0 attack-event rows.
- Acceptance cleanup left 0 `codex-developer-message-acceptance-*` fixture users.
- The pre-existing authentication limiter remains unchanged at 10 attempts per
  15 minutes per IP and identity. It was not weakened, bypassed, or modified.

## Known limitation

Session-only dismissal intentionally relies on non-authoritative
`sessionStorage`. A browser that blocks session storage may redisplay the dialog
after refresh. Permanent acknowledgement remains authoritative and server-side.

PROD was not accessed, restarted, deployed, or migrated. No public tag, release,
image, artifact, installer/updater metadata, or download channel was created or
published.
