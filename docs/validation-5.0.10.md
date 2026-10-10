# 5.0.10 qualification record

Publication is gated on real Debian 13 installation, older-version upgrade, rollback, interruption recovery, container recreation and reboot acceptance. Simulations and fixture passes are not substitutes.

Completed design qualification before the sanitized final artifact:

| Scenario | Actual result |
| --- | --- |
| Dedicated test reset | Removed 41 attributable NyxGuard containers, 47 attributable volumes and obsolete installation/fixture state; preserved Docker, OS and 64 empty unattributed anonymous volumes |
| Public root installer, 5.0.9 | Fresh Manager/MariaDB/Agent installation; healthy services, administrator setup/login, proxy host, ACL and synthetic certificate passed |
| Version-pinned public installation, 5.0.0 | Fresh supported installation with schema 42 passed |
| Draft updater 5.0.0 → published 5.0.9 | Schema 42 → 45; same DB container and named volumes; login and durable data passed |
| Already-current invocation | No application or storage changes |
| Failed official image pull | Nonzero result; unchanged previous services restarted without restoring data |
| Real insufficient disk capacity | Rejected before stopping services |
| Controlled candidate activation failure | Previous application/data restored and verified; nonzero result |
| SIGKILL after actual 42 → 45 migrations | Reboot guard restored 5.0.0/schema 42 and the same DB container; login/data passed |
| Manager-only 5.0.0 → candidate 5.0.10 retry | Upgrade, traffic-rule preservation, stack restart and full reboot passed with the same DB container, volumes and keys |
| Remove/recreate only Manager | Login, proxy host, ACL, certificate, volumes and DB container retained |

A first reboot revealed that historical `ExecStop=compose down` removed the DB container; the corrected systemd lifecycle uses `stop` and `up --no-recreate`. The corrected lifecycle was then retested successfully.

The image security audit rejected an inherited-layer candidate containing historical runtime database credentials. That candidate is not eligible for publication. The final build exports the pinned public base without running it, excludes runtime/storage content, resets image environment defaults and creates fresh layer history. Historical image digests/tags remain unchanged; remediation of those historical images is separate.

Final sanitized-image qualification is pending. No release publication is claimed by this preliminary record. Remote VPN peer connectivity and activated commercial licensing require independent authorized peers/test entitlements; unactivated identity and dormant synthetic VPN configuration are the intended local acceptance scope.
