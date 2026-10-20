# Task 7.1 source and release integration

This layer extends the accepted Task 7 image and preserves the existing uncommitted source layers. It contains the collector/exporter correction, Notifications reliability and readability fixes, the owner-requested removal of the visible traffic-history banner, and the upgrade-ready Grafana dashboard.

## Build input

The local `nyxguardmanager:5.0.14-task7_1-baseline` tag must resolve to the accepted Task 7 image:
`sha256:31d63242fd9ec8e54aca774532912ad56e4250247f261c6070a3cda76d356d39`.

From `release-source/5.0.14`, build with `docker build --pull=false -f task7_1/Dockerfile -t nyxguardmanager:5.0.14-task7_1-candidate .`. The frontend patch verifies the Task 7 asset manifest, changes only the specified semantics, parses the output and versions the asset graph coherently. Tools use the existing locked dependency set. This command does not publish an image.

## Required release assets

Include the accompanying canonical `update.sh`, `install.sh` and `docker-compose.yml` changes in the reviewed release. They are necessary because the established MariaDB image disables InnoDB by default. The target policy declares `database.trafficEngine=InnoDB` and schema 49.

The host updater takes its existing verified cold backup first. Only when that target prerequisite is missing does it pin the currently installed database image and recreate the database on exactly the same mounts/credentials/networks with persistent engine command flags. It records that controlled transition, verifies image/mount identities, and restores the matching previous database configuration and cold backup during recovery. Other update paths keep the existing database-identity guard. New installs use the same engine flags. Other tables retain their current engines; only traffic counters/cursors are converted.

Use the published current host updater for the eventual release upgrade. Replacing only the Manager image on an engine-disabled database is insufficient. Do not downgrade only the image across schema 49; use the verified matching recovery set. The engine migration is resumable and its destructive down migration is deliberately refused.

## Monitoring upgrade contract

The corrected native exporter emits contract version 1, generation time, source failures and explicit coverage/collector health. The isolated adapter recognizes a fresh, healthy v1 response and passes through its corrected metric families automatically. It otherwise continues the legacy normalization and withholds known unreliable families. The integration credential remains in the preserved application database; the stable internal service name remains available across Manager recreation.

The dashboard keeps its existing identity and all 58 panel IDs. Nine supported source panels are numeric queries prepared for automatic activation after upgrade: active deny rules, certificate expiry, observed country denials, auto-bans, per-app HTTP errors, requests and bytes. Empty/unavailable observations are not fabricated as zero. Dedicated WAF-rule-block and auth-bypass-hit counts remain uninstrumented and have explicit capability status. The rolling-event selector and history time picker have separate meanings; refresh remains one minute. Historical monitoring samples accumulate from actual collection, without manufactured backfill.

Legacy traffic is an observed, unverified closed-five-minute rollup gauge, with supported durations through 180 days. The accepted Dashboard retains its exact rolling retained-log source. Country enforcement observations reuse Task 4 and retain its 30-day history limitation. No duplicate/overlapping historical replay is introduced.

## Notifications

Canonical events are `attack_ban`, `cert_expiring`, `cert_renewed`, `failed_login`. Empty selection means no automatic events; a clearly labeled manual connectivity test may still be sent by an authorized operator. The native controlled form is the serialization authority; the old global serialization/DOM compatibility interception is removed. CRUD replaces subscriptions exactly, preserves masked credentials and records safe administrative audit context. Real event routing uses persisted subscriptions. Concurrent local deliveries coalesce; acknowledged delivery is recorded for dedupe and failed attempts remain retryable. No claim of universal exactly-once delivery across ambiguous external timeouts is made.

Discord, Slack and email have readable titles/field labels/dates; manual tests do not invent incidents. Generic webhook real-event payload structure is preserved. UI additions use all six existing language catalogs. Existing theme/style definitions are not redesigned.

## Validation and remaining release work

Focused collector, exporter, updater-prerequisite, real Grafana/Prometheus pipeline, Notifications backend/transport/API/browser/permission/audit and integrity evidence is retained privately in the Task 7.1 acceptance directory. No owner webhook was used for test delivery. External account receipt and external SMTP TLS/authentication are not claimed as tested.

The final Docker Security & Release Audit, full release qualification/publication and actual production application upgrade remain separate activities. The current production Manager was not replaced. Preserve this layer, current DEV Compose, all recovery backups and acceptance evidence during subsequent workspace cleanup; remove workspaces only after an explicit reviewed cleanup manifest is approved.
