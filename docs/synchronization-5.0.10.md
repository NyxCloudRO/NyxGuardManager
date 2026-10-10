# 5.0.10 release and documentation synchronization

The former normal updater mixed application replacement with container handovers, duplicate database verification, recovery workers and historical transaction dependencies. The replacement is one host process: verify versions/prerequisites, pause services for a verified cold backup, pull official images, replace application code using existing Compose services/storage, run versioned migrations, verify health/data, then commit or restore. Successful upgrades retain the existing MariaDB container. Fresh provisioning and advanced recovery are separate operations.

The dedicated Debian test installation was reset without changing the OS, Docker or unrelated applications. No production data or services were used. Fresh installation and actual 5.0.0 → 5.0.10 upgrades passed, including schema 42 → 45, login, representative records, certificates, application/licensing keys, storage identities and the same database container. Controlled activation failure, SIGKILL after migrations, reboot recovery, retry, Manager recreation, restart/reboot, Manager-only and VPN-enabled operation passed. Download failure and insufficient-disk preflight were exercised on the live host. See [qualification coverage](validation-5.0.10.md) for scope and limits.

## Published application

- [GitHub release 5.0.10](https://github.com/NyxCloudRO/NyxGuardManager/releases/tag/v5.0.10).
- [Docker Hub Manager](https://hub.docker.com/r/nyxmael/nyxguardmanager): `5.0.10` and `latest` resolve to `sha256:cf047ae7065913bfdaf0da77dac027f1d69035f64a73f526f6c4e78f3dc4ba64`.
- [Compatible VPN Agent](https://hub.docker.com/r/nyxmael/nyxguardmanager-vpn-agent): `5.0.1`, official digest `sha256:1467a4cd22298de7543fed2e4673ab6af0e0259e616c7c9f61b83fd0d32415fe`. Its unchanged build label is 4.0.18; compatibility is defined by Manager policy and official digest.
- Schema: **45**. Historical application tags and digests remain unchanged.

The exact public root installer installed the official published image. A public pinned 5.0.0 Manager-only installation then upgraded through the exact canonical command with terminal confirmation and no upgrade overrides; a repeat returned already current. Data and the same database container survived a full reboot after the published upgrade.

As root:

```bash
curl -fsSL https://raw.githubusercontent.com/NyxCloudRO/NyxGuardManager/main/install.sh | bash
curl -fsSL https://raw.githubusercontent.com/NyxCloudRO/NyxGuardManager/main/update.sh | bash
```

Ordinary sudo-enabled users use `sudo bash`. Root shells require no sudo.

## Public surfaces reviewed and verified

| Surface | Changes and live verification |
| --- | --- |
| [GitHub README](https://github.com/NyxCloudRO/NyxGuardManager#readme) | Current version/Agent/schema, canonical root/sudo commands, storage architecture, manual collapsed examples, requirements and support matrix; rendered page and command blocks checked |
| [Installer](https://raw.githubusercontent.com/NyxCloudRO/NyxGuardManager/main/install.sh) and [updater](https://raw.githubusercontent.com/NyxCloudRO/NyxGuardManager/main/update.sh) | Complete implementations reviewed; exact public pipelines exercised on Debian; live source matched reviewed code |
| [Lifecycle](https://github.com/NyxCloudRO/NyxGuardManager/blob/main/docs/application-lifecycle.md), [installation](https://github.com/NyxCloudRO/NyxGuardManager/blob/main/docs/installation.md), [VPN](https://github.com/NyxCloudRO/NyxGuardManager/blob/main/docs/vpn-client.md), [advanced recovery](https://github.com/NyxCloudRO/NyxGuardManager/blob/main/docs/advanced-recovery.md) | Document actual backup/migration/recovery and optional Agent activation; rendered public pages checked |
| Historical upgrade/Proxmox guides and release-source map | Previous handover/repair procedures explicitly historical and release-pinned; current entry points link to the host workflow |
| [Changelog](https://github.com/NyxCloudRO/NyxGuardManager/blob/main/CHANGELOG.md), [Compose](https://github.com/NyxCloudRO/NyxGuardManager/blob/main/docker-compose.yml), [systemd](https://github.com/NyxCloudRO/NyxGuardManager/blob/main/systemd/README.md) | Current 5.0.10/Agent 5.0.1 examples; manual startup retains containers using stop/no-recreate; source/version checks passed |
| GitHub release notes, original assets and image manifest | Release notes explain the immutable original host-script snapshot separately from the corrected rolling main updater; image digests verified against the public registry |
| Docker Hub overview, release tag and latest | Overview now describes the same root/sudo commands and persistent-storage workflow; public readback and registry digests verified |
| [NyxCloud homepage](https://nyxcloud.ro/) and [NyxGuard overview](https://nyxcloud.ro/nyxguard/) | Current version, Agent and release mechanism; metadata and release references updated |
| [Website installation/requirements/update guide](https://nyxcloud.ro/nyxguard/install.html) | Rewritten normal workflow, root/sudo commands, collapsed/advanced examples, exact supported Compose content, requirements/support evidence and recovery distinction |
| [Website VPN](https://nyxcloud.ro/nyxguard/vpn-client.html) | Optional activation replaces obsolete normal repair instructions; current commands and compatible Agent |
| [Website architecture](https://nyxcloud.ro/nyxguard/architecture.html) and [features](https://nyxcloud.ro/nyxguard/features.html) | Persistent data/migration/recovery distinction; update feature directs users to host command |

Twenty relevant website pages, including legacy redirect pages, were reviewed; six required changes. Existing design and unrelated content were preserved. All six deployed pages were tested live at mobile, tablet and desktop widths: 18 page/viewport checks passed, with working command copying and navigation, no JavaScript errors and no horizontal overflow. Origin files matched reviewed content; public HTML preserved that content, with only the existing CDN challenge script appended.

Established Ubuntu 22.x, 24.x, 25.x, 26.04 LTS and Debian 12/13 support remains intact. Historical support is distinguished from focused Debian 13 release acceptance.

## Publication hygiene and limitations

Source, packaged source and publication dependency/version checks passed. Every final Manager layer and environment was audited for identified operational credentials/runtime content; unused private-key test fixtures are excluded and reviewed public vendor examples are distinguished from installation data. Website changes passed publication review. Private operational evidence, credentials, infrastructure identities and development paths were not published.

The original 5.0.10 release assets are immutable and retain the earlier interactive-terminal defect. Current `main/update.sh` corrects that defect and passed actual terminal cancellation and the public confirmed upgrade. Use the canonical main command, rather than the original asset/tag updater snapshot. Release notes and current documentation explicitly label that distinction; no extra corrective release or rewritten image/tag was used.

External VPN peer connectivity and activated commercial licensing were not retested; local acceptance covers dormant synthetic VPN configuration and unactivated licensing identity. Historical-image credential remediation remains separate. Backups require capacity and ongoing management; restoring a retained backup loses later writes. Other operating systems retain their established support, without new fresh-host claims.
