# Installation, upgrade and recovery

Fresh installation provisions storage once. An ordinary upgrade replaces application code and reuses storage. Recovery restores data only after a genuine failure or an explicit administrator request.

## Persistent storage

| Data | Default storage |
| --- | --- |
| MariaDB records: accounts, settings, proxy hosts, access lists, traffic/WAF rules, licensing state and audit/security history | `nyxguard_db` mounted at `/var/lib/mysql` on the existing MariaDB container |
| Generated proxy configuration, application signing keys, custom/admin TLS certificates, logs and operational files | `nyxguard_data` mounted at `/data` |
| ACME accounts, certificates and private keys | `nyxguard_letsencrypt` mounted at `/etc/letsencrypt` |
| VPN configuration and keys | `nyxguard_vpn` mounted at `/var/lib/nyxguard-vpn` on Agent |
| Persistent Manager-to-Agent authentication token | `nyxguard_vpn_auth`, shared with Manager and Agent |
| Licensing vault encryption key | `/var/lib/nyxguard-licensing/vault.key`, mounted read-only in Manager |
| Database credentials, Compose configuration and installed version | Root-owned `/opt/nyxguardmanager/.env`, `docker-compose.yml`, `.version` |

The Manager image contains disposable application code. Removing only Manager does not remove these volumes or bind mounts. Do not use `docker compose down --volumes` on an installation whose data you intend to retain. Host runtime files such as the Docker socket, local timezone and ARP view are not application data.

## Fresh installation

As root:

```bash
curl -fsSL https://raw.githubusercontent.com/NyxCloudRO/NyxGuardManager/main/install.sh | bash
```

Sudo-enabled users replace `bash` with `sudo bash`. The installer installs prerequisites only when missing, creates secrets once, starts healthy services and enables systemd startup. Existing storage or a licensing key prevents accidental fresh provisioning over surviving data. VPN is enabled only when TUN can be used. To explicitly provision Manager-only, download the installer and run `NYXGUARD_VPN=off bash /tmp/nyxguard-install.sh` as root. `NYXGUARD_VPN=required` makes absent TUN an installation error.

A reproducible older supported installation uses the SAME public installer with a pinned official Manager tag:

```bash
curl -fsSL https://raw.githubusercontent.com/NyxCloudRO/NyxGuardManager/main/install.sh -o /tmp/nyxguard-install.sh
APP_TAG=5.0.0 bash /tmp/nyxguard-install.sh
```

Run this only for fresh provisioning. The updater never regenerates existing credentials or keys.

## Normal upgrade

As root:

```bash
curl -fsSL https://raw.githubusercontent.com/NyxCloudRO/NyxGuardManager/main/update.sh | bash
```

Sudo-enabled users replace `bash` with `sudo bash`. No transaction ID, recovery command or manual Docker operation is required. Use the current `main` updater: the immutable original 5.0.10 asset/tag snapshot predates its terminal-confirmation correction. Release notes label that snapshot separately.

The updater discovers a supported installation, determines the latest stable GitHub release, prints the current and target versions, and asks for confirmation through the terminal. It validates service readiness, exclusive storage ownership and available space. Manager and Agent stop first; their durable configuration baseline is captured, then the same MariaDB container stops for a consistent cold backup. Every application volume and persistent bind mount is archived and extracted/compared before the recovery point is accepted. Storage needs backup, verification-extraction and recovery headroom plus image download capacity. This process intentionally includes maintenance downtime.

Official Manager and compatible Agent images are pulled and pinned by registry digest. Manager image labels and its actual package/build version must agree. The target's single release policy declares supported source schemas and its required migration count. Agent `5.0.1` aliases an unchanged build labelled `4.0.18`; its official registry digest and release compatibility contract identify that artifact.

The updater restarts the existing MariaDB container without recreating it, replaces only Manager through `docker compose up --no-deps`, and reconnects an installed Agent to Manager's new network namespace. Application startup runs versioned forward migrations. Success requires service health, Nginx configuration validation, required migrations, retained durable configuration/eligible audit records, the same database container, the same named volumes and the same licensing vault key. Runtime counters, notification bookkeeping and legitimate retention are not treated as immutable records.

Backups remain root-only under `.upgrade/backup-*`; successful upgrades do not restore or clone MariaDB, duplicate application stacks or create replacement data volumes. Keep independent backups and monitor retained backup disk usage. Published supported source policy currently covers Manager 5.0.0–5.0.9. Historical major transitions remain separate.

## Failure and interruption

Before replacement, failure restarts unchanged services without restoring data. After replacement, failure stops the application, verifies archive checksums, restores the cold data/configuration recovery point, and starts the previous application image. Restoring data is necessary because reverting an image cannot reverse a forward migration. The updater returns a nonzero status even after verified rollback.

One root-only pending record distinguishes an unmodified installation from a potentially migrated one. Ordinary reruns recover it automatically. A systemd `ExecStartPre` invokes the same saved recovery implementation after host interruption before normal stack startup. There are no separate recovery workers or container-renaming handovers.

See [advanced recovery](advanced-recovery.md) for an explicit pre-upgrade restore. Restoring loses writes made after that recovery point.
