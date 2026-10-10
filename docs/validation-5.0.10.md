# 5.0.10 qualification record

Real Debian 13 acceptance gates release publication. Fixtures and unit tests are not substitutes for installation, migration, recovery and reboot tests.

## Qualified final Manager artifact

The sanitized final image passed an audit of all five layers and image environment, scanning 30,118 files for identified operational credentials, runtime snapshots and private-key material. Unused dependency key-test fixtures are excluded. An embedded vendor-library self-test key pattern was reviewed separately; it is not an installation key. The build uses no host application data. Historical image tags and digests remain unchanged; historical-image security remediation is separate.

| Scenario | Observed result |
| --- | --- |
| Test reset | Owned NyxGuard installation, dedicated containers, volumes, keys and stale recovery state removed; OS, Docker and unrelated resources preserved |
| Fresh final 5.0.10 provisioning | Installer-created Manager/MariaDB/Agent, schema 45, setup/login and Nginx validation passed |
| Fresh provisioning reboot | Same database container, named volumes, database credentials, application/admin certificate keys, licensing vault and dormant VPN configuration |
| Official pinned 5.0.0 provisioning | Public installer with documented APP_TAG pin; schema 42, working setup/login and representative data |
| Controlled activation failure | Final-image test derivative deliberately exits; updater returns nonzero after verified restoration of 5.0.0/schema 42 and the same database/data |
| Hard interruption after migrations | SIGKILL after actual schema 42 → 45; full reboot automatically restores 5.0.0/schema 42 before startup, retaining the database container and data |
| Retry 5.0.0 → final 5.0.10 | Actual migrations 42 → 45, final image identity, healthy Manager/DB/Agent, data and keys preserved; no cloned database or replacement stack |
| Manager removal/recreation and restart/reboot | Login, representative records, keys, VPN configuration, volumes and the same database container passed |
| Already-current updater | Reports already current; container IDs/start timestamps and Compose/environment bytes unchanged |

Representative data includes an administrative account, settings, proxy host, ACL, synthetic certificate, traffic rule, administrative audit events, unactivated licensing identity and dormant synthetic WireGuard profile. Database comparisons protect durable records while allowing reviewed timestamps, runtime bookkeeping and legitimate retention.

## Earlier host workflow qualification

The same host design was also exercised with Manager-only installations, a real failed official image pull, genuinely insufficient disk capacity, previous-version rollback, repeated upgrade attempts and reboot persistence. The disk preflight rejected before stopping services; failed pulls restarted unchanged services without restoring data. A historical shutdown unit originally removed containers; the corrected systemd lifecycle uses `stop` and `up --no-recreate` and passed subsequent reboot tests.

## Published command verification

Exact public-script and registry-artifact fresh installation and older-version upgrade will be recorded here after release publication. Prepublication qualification uses the reviewed local artifact through an explicit test-only image selector; ordinary users require no such selector.

## Scope and limits

Focused release qualification covers Debian 13; established Ubuntu/Debian support is retained independently of these tests. No new fresh-host results on other operating systems are claimed. This host already had functional Docker/Compose. External VPN peer connectivity and activated commercial licensing require independent authorized peers/test entitlements; those are not claimed. Unactivated identity and dormant synthetic VPN configuration passed local tests. Production is outside the qualification scope.
