# Installation and operating system compatibility

Use the [README installation commands](../README.md#installation) for a root shell or an ordinary user with sudo privileges. Existing installations use the [guarded update procedure](../README.md#update-in-place).

## Supported operating systems

| Operating system | Official support | Historical validation | 5.0.9 OS retesting |
| --- | --- | --- | --- |
| Ubuntu 22.x | Supported | Working installs recorded in 3.0.0 | No new OS-specific validation claimed |
| Ubuntu 24.x | Supported | Working installs recorded in 3.0.0; 5.0.7 runtime install with existing packages | No new OS-specific validation claimed |
| Ubuntu 25.x | Supported | Advertised as tested in the historical README; detailed acceptance not recovered | No new OS-specific validation claimed |
| Ubuntu 26.04 LTS | Supported | 26.04.1 runtime, startup/reboot and VPN accepted in 5.0.4 | No new OS-specific validation claimed |
| Debian 12 | Supported | Working installs recorded in 3.0.0; 5.0.7 privilege/package checks | No new OS-specific validation claimed |
| Debian 13 | Supported | Working installs recorded in 3.0.0 | No new OS-specific validation claimed |

Support carries forward independently of hotfix retesting. The [compatibility evidence below](#compatibility-evidence) records the evidence and configuration limits; [5.0.9 validation coverage](validation-5.0.9.md) describes the focused release tests. Historical family labels do not certify every point release or a fresh-host installation in 5.0.9.

The installer requires Ubuntu or Debian, apt-get and a running systemd host; it prepares Docker/Compose dependencies. VPN also requires usable host TUN and a reachable WireGuard endpoint. Restricted guests without TUN can run Manager and MariaDB without VPN. Other distributions and versions outside this matrix have no established official support; manual Docker deployment is an evaluation path, not a support guarantee.

## Compatibility evidence

The matrix restores the established support contract; the focused hotfix test list does not replace it.

- **Ubuntu 22.x, Ubuntu 24.x, Debian 12 and Debian 13:** the [3.0.0 changelog](../CHANGELOG.md#300---2026-02-10) records confirmed working installs. The [historical README](https://github.com/NyxCloudRO/NyxGuardManager/blob/3120d1d0dc7ae3a8de6b1d4906eb96b7165010b5/README.md#supported-distributions) also records these supported families, including Debian 13 production-style validation. These are historical published results, not new 5.0.8 acceptance runs.
- **Ubuntu 25.x:** the maintainer's [support-matrix change](https://github.com/NyxCloudRO/NyxGuardManager/commit/643f73df90b9bfde33915c8e01e202cf7e45feff) explicitly advertised this family as tested; it remained in subsequent release matrices. The reviewed history did not recover detailed acceptance results or exact 25.x point releases. Official support is retained without inventing those details.
- **Ubuntu 26.04 LTS:** the [5.0.4 release notes](../release-source/5.0.4/RELEASE-NOTES.md#ubuntu-2604-lts) record accepted Manager/MariaDB operation, installer execution with distribution Docker/Compose packages, schema 45, application APIs, systemd startup and reboot persistence on 26.04.1. VPN acceptance required usable TUN and included handshakes, connectivity and restart/reboot checks.
- **Later focused coverage:** [5.0.7](validation-5.0.7.md) records Ubuntu 24.04 runtime installation with existing packages and Debian 12 privilege/package resolution. These checks are narrower than full fresh-host validation. [5.0.8](validation-5.0.8.md) records upgrade, recovery and host-contract tests and explicitly states their limits; it does not establish new fresh-host acceptance for every OS in the matrix.

The [installer](../install.sh) checks distribution identity (Ubuntu/Debian), apt-get availability and a running systemd host; it does not filter OS version numbers. That broad check is an installation prerequisite, not evidence that every release or derivative is officially supported. No installer, updater, recovery or Docker behavior changed in this documentation correction.

## Prerequisites and manual installation

The one-line installer needs `curl`, trusted CA certificates and root privileges. On a minimal host, prepare the download tools first:

```bash
apt-get update
apt-get install -y ca-certificates curl
```

Ordinary sudo users prefix both commands with `sudo`. Then use the [root or sudo one-line command](../README.md#installation). To review the script before executing it, download it with `curl -fsSL https://raw.githubusercontent.com/NyxCloudRO/NyxGuardManager/main/install.sh -o /tmp/nyxguard-install.sh`, inspect it, then run `bash /tmp/nyxguard-install.sh` as root (or `sudo bash /tmp/nyxguard-install.sh`). Manual Docker Compose installation remains in the [README](../README.md#docker-deployment).
