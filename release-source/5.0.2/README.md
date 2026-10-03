# 5.0.2 development: audit integrity and security lifecycle

This overlay builds a DEV candidate on the immutable 5.0.1 image validated
by `build-dev.sh`. The inherited application remains an external image
prerequisite. New Event Center code is authored JavaScript; its build step
replaces the asserted inherited route module. Backend and other inherited
frontend changes use source-controlled patches with match-count assertions.
No generated output needs to be edited manually. The public release pointer
is unchanged. This directory does not publish images or releases.

## Architecture and ownership

Event Center reads only `audit_log`, with explicit security, user,
application, access and configuration categories. Filters and physical
clears use the same actor/action/category/time predicates. A clear never
accesses Threat Activity or native Web Threat history. Counts cover the
entire selected scope, independently of pagination. Old audit results are
marked unknown unless the old action records a known authentication outcome.

Authenticated audit actors come from the validated server token, regardless
of supplied actor fields. Context passes through a centralized scalar
allowlist. Existing user, host, access-list, certificate and stream audit
producers retain their hooks. Additional state-changing security and
configuration routes record actor, action, target, timestamp and response
result. Internal bootstrap and certificate maintenance have a separate
System audit path; unauthenticated access attempts do not impersonate an
administrator. Metadata is not a request-body dump.

Threat Activity remains authoritative in `nyxguard_attack_event`. Migration
43 recovers only inbound events carrying the attack monitor's source marker
and a recognized attack rule. It preserves original timestamps (including
milliseconds), types and supported context. Unknown timestamps/IPs stop the
backfill; absent optional fields remain null. A stable source-row identity
and persisted evidence comparison allow interrupted runs to resume. Each
source deletion follows canonical read-back verification. Native Web Threat
and CSP rows remain in `web_threat_events`. Future attack-monitor detections
no longer create a copy there. GlobalGate global statistics aggregate native
Web Threat rows and canonical attack rows; app-scoped native statistics keep
their existing semantics.

Rules have explicit ownership: manual, automatic ban, or verified crawler.
Existing automatic producer signatures are classified once in the forward
migration. New manual creations and edits cannot opt into automatic ownership
through a note or actor field. Automatic producers do not revive or extend
manual rules. Manual edits adopt automatic state as manual configuration.

The existing single-flight attack worker performs expiry maintenance before
opening or ingesting logs. It deletes only expired temporary state owned by
automatic bans or verified crawlers, using `expires_on <= database NOW()`.
Missing, unchanged or empty logs cannot skip maintenance. Enforcement reloads
are retried; startup requests a full enforcement regeneration even if a
previous process stopped after deletion. Disabled, expired and permanent
manual rules remain available in the management API. Permanent automatic
rules are retained. Crawler allows are expiring verified-enforcement cache,
not detection history, so expired owned rows are physically removed.

## Retention and recovery

Regular attack history retains the existing 30-day policy. Recovered legacy
history is exempt, so migration cannot immediately erase the surviving
historical evidence. An explicit Threat Activity clear can remove it. The
new All retained history scope makes recovered evidence visible with its
original dates. Audit retention uses the existing setting: default 180 days,
0 meaning retain indefinitely. Maintenance runs independently of new traffic.
Native Web Threat retention is unchanged.

MariaDB/Aria does not provide transactional rollback across these tables.
Backfill therefore uses insert, verify, delete and stable provenance rather
than claiming transaction guarantees. Event clear is one scoped delete on
one table. Migration 43 is forward-only; rollback after migration requires a
verified pre-migration database/volume backup. Existing same-major recovery
workers remain unchanged and can create that backup before guarded handover.

## Validation

`tests/integrity.test.mjs` runs in the candidate image against a disposable
MariaDB/Aria schema fixture. It explicitly refuses any database host other
than the fixture container. It covers recovery, millisecond timestamps,
deduplication, failed verification, reruns, audit spoofing and secret exclusion,
filtering, physical clear, independent history preservation, expiry boundaries,
manual state preservation, crawler expiry, missing/empty logs, producer routing,
authenticated APIs, native CSP and GlobalGate statistics.

Run the relevant inherited update/recovery, diagnostics, frontend, VPN and
Threat Activity regression suites as well. Build/tests do not establish
acceptance alone: guarded DEV handover must verify browser/API/database state,
enforcement, Manager/database restarts, persistent volumes and service health.
Keep authentication material, backups, extracted schema/source, screenshots
and acceptance output outside tracked source.
