# NyxGuard 5 diagnostics core

These ESM modules are pure application components. They do not read the live
database, credentials, filesystem, process environment, or network and do not
modify the current 4.0.18 container. The integrating route must load the host
and certificate by authorized database ID, enforce current admin and verified
NyxGuard Professional Support entitlement, then pass an allowlisted snapshot.

`diagnostics.mjs` exports `systemDiagnostics(snapshot)`,
`configuredTarget(host)`, `routingDiagnostics(host, observations)`,
`tlsDiagnostics(host, certificate, observations)`, and
`troubleshoot502(host, observations)`. The caller must perform bounded DNS,
TCP, TLS and HTTP observations against the configured host only, pin the
resolved address, disable redirects, omit credentials, and enforce time and
byte limits. An arbitrary URL from a request is never accepted here. Missing
observations return `SKIPPED`.

`bundle.mjs` exports `buildSupportBundle({version, installationId, system,
routing, tls, troubleshooting, now})`. It returns `{bundle, bytes}` with one
UTF-8 JSON object containing `format: nyxguard-support-bundle-v1`. Its schema
selects only result check/state/evidence; the recursive redactor then removes
sensitive fields and values. Size is capped at 1 MiB. Integrators must not
persist or log pre-redaction collector objects. Keep the exact `bytes` for
idempotent upload retries.

---

# NyxGuard 5.0.0 Professional Support UI overlay

This is an additive frontend layer for the existing 4.0.18 image composition build. It does not create or alter a React source tree. The main sidebar and lower User, Preferences, and Community controls retain their markup, classes, icons, and order. Viewport-height CSS compacts their spacing on shorter laptop displays and places the expanded Preferences panel beside the sidebar so it does not cover navigation.

The lower navigation gains `License` and `Diagnostics & Support` after Preferences. Diagnostics uses a cyan stethoscope icon drawn in the existing 14 px lower-navigation SVG format. The existing `Support NyxGuard` commercial link and Community destination remain unchanged. The hidden React `a.support-nyxguard` donation link remains unchanged because the existing Developer Message uses it for its separate donation action.

Both new destinations render in the normal main content area. Diagnostics & Support has internal Overview, Diagnostics, Troubleshooting, and Support Bundle sections. The old `#nyxguard-professional-support` route redirects to the new destination. The overlay uses the existing local JWT for same-origin requests. Backend authorization remains authoritative; diagnostics require `enabled: true`, while upload requires `state: "ACTIVE"`.

## Image composition

After the existing 4.0.18 frontend overlays are applied, copy `frontend/professional-support.js` and `frontend/professional-support.css` into `/app/frontend/assets/`, then run `node patch-frontend.mjs /app/frontend`. Exact base digests and anchored assertions protect the lower navigation, main sidebar, content wrapper, footer, Settings, theme cache, and notification version. The script fails before writing if the expected base has drifted. It also fails on a second application.

## API contract

The script calls these authenticated admin endpoints:

| Action | Endpoint | Payload/result used |
| --- | --- | --- |
| Status | `GET /api/professional-support/status` | `state`, `enabled`, `expires_at`, `installation_id`, verified `product` when active or in grace |
| Claim | `POST /api/professional-support/claim` | `{claim_code}` |
| Activate | `POST /api/professional-support/activate` | `{}`; the backend retains the short-lived activation proof |
| Refresh | `POST /api/professional-support/refresh` | `{}` |
| Diagnostics | `GET /api/professional-support/diagnostics` | `{checks:[...]}` |
| Troubleshoot | `POST /api/professional-support/troubleshoot` | `{workflow:"upstream_502",proxy_host_id}` → `{steps:[...]}` |
| Bundle | `GET /api/professional-support/bundle` | JSON bundle, downloaded locally |
| Upload | `POST /api/professional-support/upload` | `{}` → `{support_id,expires_at}` |

Diagnostic records display only `check`, `state`, an integer proxy host ID, fixed guidance for failed checks, and a bounded summary when available. The UI never renders arbitrary evidence objects, signed envelopes, tokens, or API error response bodies.

## Verification

Run `node --check` on the overlay script and patch script, then run `NYX_UI_BASE_DIR=/path/to/exact/base/frontend node dev/professional-support/patch-frontend.test.mjs`. Browser acceptance should confirm the unchanged main sidebar, the two lower destinations, native content rendering, internal tabs, and entitlement gates. The existing Support NyxGuard and Community links should retain their destinations.
