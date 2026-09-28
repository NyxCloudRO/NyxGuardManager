# Developer Message — final DEV acceptance

Accepted on 2026-08-30 against the local NyxGuard Manager 4.0.18 DEV
candidate. This is an internal acceptance record, not a release marker.

## Architecture and persistence

- The frontend waits for the authenticated application shell, reads the current
  JWT from NyxGuard's existing authentication store, and performs one
  acknowledgement check per token.
- `Continue`, close, backdrop, and Escape write only the per-user
  `sessionStorage` guard. Refresh stays dismissed. Whenever the frontend enters
  NyxGuard's unauthenticated state it clears temporary dismissal once, including
  on a freshly loaded login page, so a later login shows the message again.
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
- An immediate authentication removal plus hard reload reproduced the prior
  same-tab failure before the fix. The committed matrix now proves Continue,
  X, Escape, and another Continue across four consecutive logins; hard-reload
  logout; same-session refresh and navigation suppression; two-way temporary
  user isolation; and server-side acknowledgement isolation.
- Chromium recorded zero severe console errors.

Viewport measurements:

| Target | Rendered viewport | Dialog horizontal bounds | Dialog/footer bottom | Document/modal overflow | Background |
| --- | --- | --- | --- | --- | --- |
| 1920×1080 desktop | 1920×937 | 550–1370 | 898.5 / 897.5 | 1920 / 818=818 | locked |
| 1366×768 constrained | 1366×625 | 273–1093 | 605 / 604 | 1366 / 818=818 | locked |
| 390×844 mobile | 390×701 | 8–382 | 693 / 692 | 390 / 372=372 | locked |

Read-only inspection of the captured renders confirmed NyxGuard's navy/cyan
identity, the existing magenta Support accent, clear title/lead hierarchy,
readable spacing and line length, clean internal scrolling, reachable actions,
and no clipped text, buttons, or horizontal overflow.

### Final branding correction

Final human review found that the initial modal referenced the legacy upstream
`/images/logo-no-text.svg`. The modal now uses
`/images/favicon/favicon.svg`, the canonical square NyxGuard “N” vector declared
by the live application's favicon metadata and used by its active loading UI.
Focused browser acceptance verifies that the modal and application icon URLs
match, the SVG loads with its square 64×64 viewBox, renders at 34×34, remains
aligned with `NYXGUARD MANAGER`, and that no `logo-no-text.svg` reference remains
in the dialog. The accepted copy, structure, colors, layout, actions, dismissal,
acknowledgement, migration, security, and accessibility behavior are unchanged.

### Final composition polish

The accepted modal measured 880px wide at the 1920×1080 test target. Its title
and lead occupied 752px, while the 659px readable copy column remained anchored
to the left body padding, leaving visibly uneven side whitespace. The final
composition uses an 820px desktop dialog and centers the title, lead, copy, and
signature in a shared maximum 620px column while keeping all long-form text
left-aligned. Desktop maximum height is reduced from 905px in the test viewport
to 860px. Header, body, paragraph, signature, and footer spacing are tightened
slightly without changing typography or removing content. Focused browser
measurements verify balanced content margins within the usable scroll area (the
only outer-edge difference is the browser's scrollbar rail), clean internal
scrolling, reachable footer actions, and unchanged mobile edge spacing and
stacked actions.

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

- The exact candidate source revision is injected at build/deployment time and
  reported by both the runtime health endpoint and OCI revision label.
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
