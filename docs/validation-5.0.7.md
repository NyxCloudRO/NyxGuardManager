# 5.0.7 validation coverage

The release addresses SQL monitoring latency and optional VPN activation. Tests use disposable fixtures; customer dumps, credentials, raw logs and installation identities are excluded from public artifacts.

| Coverage | Result |
| --- | --- |
| Full SQL restore and complete row/schema fingerprints | Passed with constrained MariaDB resources |
| Injected monitoring latency | Original client timeout reproduced; corrected monitor completed |
| Invalid SQL, idle/total deadlines and persistent observation failure | Failed safely without changing the live database |
| Failed staging schemas and restricted import users | Cleanup verified |
| Backup-worker interruption and guarded retry | Rollback verified, then committed upgrade from 5.0.0 to schema 45 |
| Login, settings, proxy APIs and protected configuration | Preservation verified |
| Missing TUN, later activation and repeated VPN-only repair | Manager/database retained; compatible Agent activated |
| systemd startup and Compose recreation | Enabled services returned healthy |
| Root without sudo and ordinary sudo user | Privilege entry points passed |
| Debian 12 package resolution | Required packages and Docker/Compose dependency resolution passed |
| Ubuntu 24.04 installation | Tested using existing Docker/packages |

A successful injected-latency test establishes tolerance to that fault, not the cause of every database timeout. Container health does not certify an external VPN peer or every customer route. Full fresh Debian systemd/Docker host installation was not exercised by this focused suite; package-only checks must not be described as that coverage. Unchanged migrations and application behavior reuse applicable 5.0.6 validation.

SQL observation uses separate monitoring/control connections, tolerates transient failures without resetting progress, and retains idle/total deadlines and full backup verification. See the [upgrade and recovery guide](upgrade-5.0.7.md).

The focused 5.0.7 checks did not cover a new upgrade with a retained completed 5.0.6-target ledger. That compatibility case is a known limitation of the published image; see the upgrade guide before retrying.
