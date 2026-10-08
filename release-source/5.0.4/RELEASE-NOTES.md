# NyxGuard Manager 5.0.4

A corrective and stability release for safer upgrades, consistent management pages, and supported modern Linux hosts.

## Upgrade and recovery

Supported sources are public Manager 5.0.1, 5.0.2 and 5.0.3. Guarded activation
protects the previous database, files and installed topology, verifies the
replacement and application data, and restores the protected source on failure.
Interruption/resume behavior and bounded startup/network operations use the
established recovery implementation. A CONNECT deadline closes the underlying
request/socket and joins its worker. This release retains schema 45 and the
compatible VPN Agent 5.0.1; it introduces no new migration.

## Product corrections

- License and all four Diagnostics & Support tabs reuse the existing AppPage and Settings content surface with one bounded
  scroll frame, with matching desktop/mobile geometry and existing themes.
- Traffic Rules reports effective expiration instead of presenting an expired
  stored enabled flag as an active allowance. Expired verified-crawler rules
  cannot be revived manually through stale enable/edit controls. Fresh verified
  traffic can recreate a finite allowance; manual disable remains authoritative.
- Footer, Settings, and Event Center version labels match runtime 5.0.4.
- Existing button spacing and configured multi-site VPN behavior are retained.
  VPN Agent remains 5.0.1; Manager and Agent restart as a pair so the Agent
  joins the current Manager network namespace.

- Preserve verified Compose identity through Manager/Agent handover and automatic boot.
- Preserve the Docker socket-access group with default monitored container names,
  restoring container uptime and aggregate resource metrics.

## Ubuntu 26.04 LTS

Manager/MariaDB operation, installer execution with Ubuntu's Docker/Compose
packages, schema 45, application APIs, systemd startup, and reboot persistence
were accepted on Ubuntu 26.04.1 LTS. The LXC certification host was subsequently given usable TUN through the
validated minimal host prerequisite. Agent installation/repair, real WireGuard
handshakes, controlled connectivity, paired restart and cold reboot were accepted.
VPN operation requires usable host TUN and a reachable WireGuard endpoint; the
installer does not configure Proxmox host permissions.

## Updating

Follow the [main update guide](../../../README.md#update-in-place). Keep an independent backup. Do not substitute
a bare Docker image change for a supported guarded upgrade, and do not start
an older image against a newer database schema.
