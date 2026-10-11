# NyxGuard Manager v5.0.11

Official stable release. Manager 5.0.11 uses database schema 46 and the existing VPN Agent 5.0.1. Installation and updates retain the conventional host-managed Docker Compose model.

## Improvements

- Repaired Certbot initialization, immutable dependency seeding, corruption recovery and Cloudflare DNS plugin handling.
- Repaired certificate API confidentiality: certificate JSON omits stored private keys, PEM material and provider credentials while retaining safe presence indicators. Authorized binary certificate export remains available.
- Improved Access List enforcement: successful mutations wait for effective Nginx enforcement; uncertain or partial activation returns a truthful failure with operational diagnostics.
- Improved CLI updater stages, elapsed time, bounded progress, long-operation heartbeats and sanitized failure diagnostics, including large-history verification.
- Improved verified rollback and partial backup-preparation recovery; optional SQL port defaults to 3306.
- Added persistent operational error diagnostics and additive database migration/schema 46, safe native error classification and bounded failure grouping.
- Improved sanitized Support Bundle content, Recent problems and troubleshooting while preserving the Diagnostics & Support design.
- Integrated relevant administrative audit, Event Center, UI and regression fixes.

## Installation and updates

As root on a fresh supported Ubuntu/Debian systemd host:

```bash
curl -fsSL https://raw.githubusercontent.com/NyxCloudRO/NyxGuardManager/main/install.sh | bash
```

For an existing supported Manager 5.0.0–5.0.10 installation:

```bash
curl -fsSL https://raw.githubusercontent.com/NyxCloudRO/NyxGuardManager/main/update.sh | bash
```

Sudo users replace `bash` with `sudo bash`. The installer discovers the latest stable GitHub release and reads Agent compatibility from the Manager image. VPN requires usable TUN; Manager-only installations are supported. The updater preserves existing MariaDB, persistent volumes, certificates and the licensing vault key, verifies a cold backup and checks migration/readiness before success. Activated commercial entitlement preservation still needs live acceptance. Maintain independent backups and allow maintenance downtime.

Hardware sizing targets: 1/2/4+ vCPU, 1/2/4 GB RAM and 10/20/40+ GB SSD for minimum/recommended/high traffic. Capacity depends on Proxy Hosts, traffic, WAF/VPN and retention; minimum hardware was not validated by this release.

## Qualification scope

Available controlled offline qualification passed for the qualified application source and image: Certbot/Cloudflare runtime discovery, certificate confidentiality and stored-key preservation, Access List enforcement, fresh empty-storage startup and retained-volume recreation, schema 46, representative upgrades from 5.0.0 and 5.0.10, verified rollback/interruption recovery, operational diagnostics and sanitized bundles. Controlled WireGuard handshake and connectivity passed. Selected later checks were differential checks on the final image; unchanged earlier matrices were retained. These results do not establish fresh-host acceptance across every supported OS. See [validation coverage](https://github.com/NyxCloudRO/NyxGuardManager/blob/main/docs/validation-5.0.11.md).

## Known Limitations

- Live Let's Encrypt HTTP-01 issuance not yet validated.
- Live Cloudflare DNS-01 issuance not yet validated.
- Live license activation/recovery and activated entitlement preservation not yet validated.
- Host reboot and power-loss recovery not fully validated for 5.0.11.
- OpenVPN connectivity not validated.
- Original legacy production startup stall remains unexplained.

Database-down diagnostics use a safe log fallback and cannot guarantee durable storage. Older Managers restored by rollback cannot display the new diagnostic format until 5.0.11 runs again. Comprehensive protection efficacy, live reputation-feed correctness and every UI workflow were not qualified.
