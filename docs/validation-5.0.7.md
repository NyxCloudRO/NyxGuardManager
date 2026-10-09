# 5.0.7 focused validation and incident findings

All execution and fault injection used the existing DEV host. No Proxmox CT/VM was created. Production access was read-only; the repaired Debian installation and websites were unchanged.

## Supported incident cause

The retained 5.0.6 backup stack identifies the fatal exception at the SQL **progress monitor** query, a client `PROTOCOL_SEQUENCE_TIMEOUT` (five-second query budget). The importer cleanup subsequently kills that restricted user's SQL session. Consequently, the helper's `ERROR 2013 ... Lost connection ...` at an audit-log INSERT can be an updater-induced disconnect rather than proof that MariaDB crashed. The dump was 230,103,271 bytes, with 603,569 audit rows; line 529993 starts a multiline audit INSERT, not a standalone statement whose size is established by that line's length.

On DEV, the original monitor restored the retained dump successfully in 66.9 seconds with MariaDB limited to one CPU / 512 MB. Injecting seven seconds of database scheduling unavailability reproduced the original client timeout, without crashing MariaDB. The corrected monitor reconnected and completed the same controlled observation test. This is an injected latency test, not proof that production experienced precisely that scheduling delay.

No retained evidence establishes the exact source of production's slow monitoring response. Current resource counters after subsequent host/container startup cannot exclude a historical pressure event. No inspected retained log demonstrated a server crash, packet-size rejection or disk exhaustion. Five-second monitoring latency is not a valid basis for terminating an otherwise progressing import. The correction separates monitoring/control connections, excludes Aria table statistics while importing, tolerates missed observations without resetting progress, and retains strict idle/total limits and full verification gates.

Prior 5.0.6 certification is reusable for unchanged migrations/application behavior, but was a successful point-in-time run with different host conditions. It did not establish safety under every monitoring-latency condition. The original monitor's successful replay of the actual failed dump supports this limitation.

The real production Manager is 5.0.0 by package/build/image identity. The Agent's 5.0.0 and 5.0.1 tags share the same immutable image digest, with historical 4.0.18 image metadata. The prior identification of Manager as 5.0.1 is not supported by the inspected running image. Read-only checks found schema 42, zero auth/permission orphans, valid Nginx configuration and a decryptable licensing record. Agent HTTP was healthy, but the configured tunnel was disconnected at inspection; tunnel functionality is not certified by container health alone.

## Focused results

| Scenario | Result / actual coverage |
| --- | --- |
| Retained production SQL dump, full table/row/schema fingerprints | PASS, isolated MariaDB, one CPU / 512 MB; final run restore + comparison 149.3 s |
| Original monitor under injected database latency | Reproduced `PROTOCOL_SEQUENCE_TIMEOUT`; corrected monitor PASS |
| Invalid SQL / backup rejection | PASS; live fingerprints unchanged |
| Idle and total SQL-helper limits | PASS; importer terminated |
| Persistent monitor failure | PASS; idle budget exhausted, control connection usable |
| Failed staging schemas/import users | PASS; no newly failed stage/user remains |
| Backup worker killed during real upgrade | PASS; `ROLLBACK_COMPLETE`, healthy original 5.0.0 |
| Retry after completed rollback | PASS; normal guarded 5.0.0 → 5.0.7, `COMMITTED`, schema 45 |
| Login, proxy/settings APIs, protected identity/configuration/traffic | PASS before/after upgrade, complete recorded fingerprints match |
| Initial unavailable TUN → later activation | PASS on the same isolated DEV installation; absence injected, actual later interface-creation probe |
| Same-version VPN-only repair and repeated repair | PASS; Manager/DB retained; repeated healthy repair retains Agent container too |
| systemd enable, shutdown/start and Compose recreation | PASS on owned DEV unit; Manager/DB/Agent return healthy |
| Root with no sudo executable | PASS privilege entry points |
| Ordinary non-root with real sudo | PASS both scripts, temporary Debian shell with valid sudo privileges |
| Debian 12 base packages, exporter, official Docker/Compose v2 dependency resolution | PASS real Debian userspace; package install/resolution only |
| Ubuntu runtime installation | PASS on Ubuntu 24.04 DEV using existing Docker/packages; package provision functions deliberately reused/stubbed to avoid host changes |
| Installer TUN policy and unsupported-target containment | PASS existing focused regression suites updated to current artifact checks/host locking |
| Full fresh Debian systemd/Docker host installation | NOT RUN; no permitted clean Debian systemd host |
| Real CT109 reboot | NOT RUN; owner approval required |
| All historical routes / VPN peer end-to-end behavior | Reuse applicable immutable 5.0.6 evidence; not claimed as new 5.0.7 execution |

Only uniquely named DEV Docker resources and one temporary DEV systemd installation were used; protected existing DEV services/volumes were preserved. Temporary runtime resources are removed after public-artifact validation. Private evidence and the retained production SQL copy are excluded from the source/release artifacts.
