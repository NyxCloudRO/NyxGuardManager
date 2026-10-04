# Event Center V2 development

This overlay builds 5.0.3-dev from the unchanged published 5.0.2 image. The public
runtime-detection updater hotfix remains in the development baseline. Development
images and source commits must not be published as a release without separate
acceptance and authorization.

## Administrative audit model

Actor identity comes from the server-validated session. Client actor/user fields
cannot override it. System producers use explicit system attribution. Access
Portal visitors remain unauthenticated in the Manager identity model; no fake
user account is created for them. Access decisions target the server-resolved
Access List, rather than a missing incoming header. Object IDs remain available,
but zero does not render as a fictitious object. Safe names and operation labels
make Proxy Host, certificate and support targets readable.

| Producer | Category | Actor | Actions/results | Safe context and value | Expected frequency |
|---|---|---|---|---|---|
| `internal/token.js` password/2FA/SSO completion | Users / Authentication | Validated user | login_success / success | Authentication object ID; accountable session creation | Each completed login |
| `routes/tokens.js` invalid credential submission | Users / Authentication | Unauthenticated | login_failed / failed | Failure outcome; no credentials | Each actual failed login |
| `routes/tokens.js` logout | Users / Authentication | Validated user | logout / success | Session user ID | Each explicit logout, including leaving impersonation |
| `internal/token.js` ordinary refresh | Internal technical noise | Validated user | No administrative row | Routine session maintenance; not a new login | Browser refresh interval (five minutes) |
| `internal/token.js` explicit scoped issuance | Users / Authentication | Validated administrator | token_issued / success | Scoped-issuance reason; original issuing user | Each explicit issuance |
| `internal/user.js` | Users / Authentication | Validated user; system for initial setup | created, updated, deleted, impersonated | Stable user ID, safe name, outcome; includes password/role/security changes | Each administration action |
| `internal/certificate.js` | Configuration | Validated user; system for scheduled renewal | created, updated, deleted, renewed | Stable certificate ID, safe name, outcome | Each operation or renewal |
| `internal/proxy-host.js`, `redirection-host.js`, `dead-host.js`, `stream.js`, `access-list.js` | Configuration | Validated user | created, updated, deleted; host enable/disable operations | Stable object ID and safe name | Each administration action |
| `internal/admin-audit.js` security routes | Security Administration | Validated user | created, updated, deleted, activated, rolled_back, manual_ban; failed/denied outcomes | Traffic/Country/WAF rules, security settings, applications, Web Controls; response identity, status, route | Each mutation; successful native producers are not duplicated |
| `internal/admin-audit.js` settings/integration/notification routes | Configuration | Validated user | created, updated, deleted; failed/denied outcomes | Response identity, status, route | Each mutation |
| `internal/admin-audit.js` native administration failures | Native category | Validated user | Mutation action / failed or denied | Captures failures missing from successful native writers | Each failed mutation |
| `routes/nginx/access_portal.js` credential submission | Access | Unauthenticated Manager actor | login_success or login_failed | Resolved list/host, reason, source IP, status, fixed resource | Each submitted credential outcome; never grouped |
| `routes/nginx/access_portal.js` missing-session check | Access | Unauthenticated | deny / denied | Source/resource/list/host, session_absent reason, occurrence count and first/last time | One row per five-minute source/resource/agent bucket; every occurrence retained |
| `routes/nginx/access_portal.js` invalid session, missing user, changed credential hash, exception | Access | Unauthenticated | deny / denied | Source/resource/list/host and reason | Every occurrence individually |
| `routes/professional-support.js` | Application / Operations | Validated administrator | nyxcloud.support.diagnostics.run, troubleshooting.run, bundle.generated, bundle.downloaded, upload.requested | Named operation; no bundle, credentials or request body copied | Every requested operation |
| `routes/professional-support.js` entitlement operations | Application / Operations | Validated administrator | claim.requested, activation.requested, refresh.requested, recovery.requested, recovery.confirmed, deactivation.requested, replacement.requested | Meaningful operator request; no proof, key or claim code | Every requested operation |
| Attack/security monitors | Threat Activity | Security telemetry source | BOT/SQL/DDoS/Web Threat detections | Owned by Threat Activity; not copied into administrative audit | Detection-specific |

The audit pipeline preserves existing administration, login failures, security
changes and support operations. The grouped policy does not trust a user-agent as
an exemption and does not discard genuine denials. Supplied session credentials
remain individual even if the user-agent looks like a monitor. Grouping increments
a durable database counter atomically; concurrent requests and restarts do not
lose occurrences. No historical noisy rows are deleted by the migration.

Details use an explicit scalar allowlist. Tokens, cookies, passwords, API keys,
private credentials, nested request bodies, arbitrary URLs and query strings are
excluded. Source IP is accepted from the controlled loopback proxy path; direct
requests use the socket peer. This describes attribution evidence, not proof of
external request ownership.

## Retention and query behavior

The existing `audit-log-retention-days` policy remains: default 180 days, explicit
zero means manual retention. Invalid policy values fall back to the default.
The existing maintenance cadence removes at most 1,000 expired audit rows per
pass, ordered by time/ID. MariaDB enforces the limit in a parameterized single-table
DELETE; the Knex MySQL delete compiler does not implement limit/orderBy.
Threat Activity lifecycle is unchanged. Forward migration adds occurrence count,
last-seen time, a nullable unique grouping key and a `(created_on,id)` index.
The index supports unfiltered history order and bounded retention. Existing
category/actor/action-time indexes remain; exact counts and literal substring
search can still scan matching history. No approximate count or search semantics
are substituted for correct results.

Events are filtered/paginated on the server (100 rows per browser page, API maximum
500), including category, authenticated actor ID, actor type, action, result,
time window and literal search of actor/action/target/context. Displayed summary
counters count occurrences; pagination counts stored records. Clear selected scope
uses the same validated query predicate and deletes physical audit rows only,
including their occurrence totals. It cannot alter Threat Activity.

Desktop layout constrains the page frame to the existing dashboard shell. Title,
summary, filters and pagination stay visible; the remaining history area scrolls
with sticky headers. Mobile uses natural page flow plus bounded table overflow.
Request generations prevent stale data/counts overwriting newer filters. An
uncertain clear response hides stale counts until Retry verifies persistence.

## Broader data-view consistency follow-ups

IPs & Locations provides the reference behavior: bounded data region inside the
application shell, independently of server pagination. Compare these candidates
in the later 5.0.3 consistency/button-spacing audit:

- Threat Activity: paginated security rows; confirm its height chain and sticky
  header at constrained desktop heights without changing telemetry ownership.
- Traffic Rules and Web Controls: expandable management lists; preserve grouped
  controls and accessible action rows while bounding long lists.
- Proxy Hosts, Access Lists, Certificates and Users: cards/tables with expandable
  details; assess internal scrolling against card interaction and mobile flow.
- Diagnostics & Support: potentially long observations; keep operation controls
  visible and avoid competing detail/page scrollbars.

Only Event Center receives the layout changes in this task. No broad UI rewrite
or global button-spacing changes are included.

## Tests

Pure contracts: `node --test release-source/5.0.3/tests/audit-policy.test.mjs`.
Real MariaDB integration: `event-center-db.test.mjs` refuses any database except
an isolated synthetic `task1_fixture` on `nyxguard-task1-db`. Initialize that
fixture using the existing 5.0.2 integrity schema/test workflow and apply the
5.0.3 migration. Never run those destructive fixture tests on a deployed database.
Browser/performance acceptance artifacts and session state stay outside git.

## Task 2: shared shell, preferences and historical retrieval

The common frame, shell, dashboard viewport and route wrapper have named layout
primitives. Desktop ordinary long pages scroll in the dashboard viewport. Event
Center retains its accepted table-region ownership; Diagnostics/License retain
one existing page scroller. Mobile uses natural document flow. Existing code
editors and data tables retain justified local overflow. Shared action styles
adjust adjacent groups only; button sizing, order and operations are preserved.

| Surface | Classification | Scroll owner |
|---|---|---|
| Dashboard | Mixed metrics and datasets | Dashboard viewport; existing bounded recent table |
| Live Traffic | Large dataset | Existing table viewport; dashboard fallback for controls |
| IPs & Locations | Mixed data and provider/settings controls | Existing paginated table; dashboard for long controls |
| Traffic Rules | Mixed editors and management tables | Dashboard and established list/table regions |
| Applications | Management list | Dashboard viewport |
| Threat Activity | Large dataset | Established paginated table; dashboard fallback |
| Web Controls | Long form and policy editors | Dashboard; local code-editor overflow |
| GlobalGate | Long form and telemetry | Dashboard viewport |
| Proxy/Redirection/404 Hosts, Streams | Management tables and modal editors | Dashboard/table region; dialog body for long editors |
| Access Lists, Certificates, Users | Management tables and modal editors | Dashboard/table region; dialog body |
| Event Center | Large audit dataset | Accepted internal history table |
| Settings tabs (Backup, Notifications, Integrations, SSO, Grafana, LAN, VPN) | Short or long forms | Dashboard viewport; local editor where appropriate |
| Preferences | Small portal panel | Panel/dropdown overflow within viewport |
| License; Support Overview/Diagnostics/Troubleshooting/Bundle | Mixed operations and observations | Existing support page scroller |
| Login/setup/2FA, error/not-found, legacy route redirects | Short forms or routing aliases | Existing unauthenticated/mobile flow |

There was no backend presentation-preference store: theme existed in React and a
single global localStorage key. Two startup version checks reset it on each load.
The existing browser preference mechanism now uses user-scoped theme keys,
validated against supported themes. Session identity is read only to choose a
presentation key; JWT decoding grants no permissions. Login/logout/impersonation
and cross-tab changes notify the existing theme provider. Logged-out/invalid or
missing preferences use the default. Preferences persist in that browser/origin,
not across devices; no parallel backend preference database is introduced.
Unattributed legacy global theme values are not copied between users.

Large-window IP analytics uses access logs, not attack-event rows. Parsed file
snapshots validate device/inode, size, modification and change timestamps before
reuse. Concurrent scans share work; callers receive fresh event objects. Cache
ceilings (250k events/file, 300k total, 32 files) bound retained snapshots and never
truncate the scan. Eviction/restart causes a complete source rescan. Read errors
remain errors. Clear logs invalidates snapshots; log disappearance/rotation,
append/truncate/replace and compressed-file changes invalidate fingerprints.
Existing result-cache TTLs remain the visible freshness contract (short queries
about two seconds, long summaries up to sixty seconds). Available log retention
still defines the historical source; no missing historical data is invented.

Schema 45 adds a covering traffic-summary index justified by real Aria plans.
It covers the existing global time predicate/host grouping and aggregate counters,
at an additional write/storage cost. No rollup tables or historical data migration
are introduced. Audit exact-count indexing was investigated but not added because
the measured benefit did not justify its write/storage cost. Event Center retains
the accepted scoped pagination query. A derived-ID join looked faster in an early
SQL-only trial but regressed the actual API workload and was rejected. Deep offset
and exact counts continue to scale with matching history; both remain documented
follow-up costs rather than unproven performance claims.

IP retrieval aggregates the full interval before its existing API result limit.
The UI requests the existing 50k ceiling, retains its 100-row pagination, filters
and JSON export, and reports an explicit top-IP notice if that ceiling is reached.
Historical summaries include archived recent rows; realtime intervals/polling are
preserved. Source cache optimizes parsing; it is not a persistent rollup or a
substitute for authoritative MariaDB traffic-stat aggregates.

Task 2 contracts run inside the candidate image with the source mounted. Its real
DB suite, like other destructive fixture suites, refuses any database except
`task1_fixture` on `nyxguard-task1-db`. Browser/performance/restart evidence and
credentials belong outside public source. Release/runtime updater interoperability
remains a permanent gate; Task 2 makes no updater changes or publication.
