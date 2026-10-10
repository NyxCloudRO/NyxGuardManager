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

The exact root installation pipeline from `main` installed published Manager 5.0.10 and compatible Agent 5.0.1, followed by setup/login, representative data and dormant VPN validation. A fresh public pinned 5.0.0 Manager-only installation then ran the exact root normal update pipeline without upgrade overrides, with actual terminal confirmation. Schema 42 → 45, published Manager digest, login, durable data, keys, volumes and the same database container passed. A second public invocation reports already current.

```bash
curl -fsSL https://raw.githubusercontent.com/NyxCloudRO/NyxGuardManager/main/install.sh | bash
curl -fsSL https://raw.githubusercontent.com/NyxCloudRO/NyxGuardManager/main/update.sh | bash
```

The first interactive public invocation revealed that opening a terminal in Python `r+` mode required seeking; it failed before service changes. Separate read/write terminal streams corrected it. Real terminal cancellation and accepted public upgrade were then tested. Original release assets are immutable snapshots and retain the earlier confirmation defect; use the canonical current `main` updater. The release notes clearly distinguish that snapshot. No release tag or Manager digest was rewritten and no additional corrective release was published.

Prepublication image qualification used an explicit reviewed local selector; ordinary users require no selector. The Manager artifact is unchanged between local qualification and published tests.

## Scope and limits

Focused release qualification covers Debian 13; established Ubuntu/Debian support is retained independently of these tests. No new fresh-host results on other operating systems are claimed. This host already had functional Docker/Compose. External VPN peer connectivity and activated commercial licensing require independent authorized peers/test entitlements; those are not claimed. Unactivated identity and dormant synthetic VPN configuration passed local tests. Production is outside the qualification scope.
