# NyxGuard Manager 5.0.6

Corrective updater release. Manager schema45; compatible VPN Agent5.0.1 remains unchanged. Guarded sources:5.0.0/schema42,5.0.1/schema42,5.0.2/schema43,5.0.3–5.0.5/schema45. Historical4.0.18→5.0.0 remains the separate immutable major-transition route.

The host and application updater use one paired-container bootstrap and release policy. The engine selects services and persistent storage from actual Compose metadata, verifies a restorable quiesced backup, migrates, verifies readiness and protected data, then commits installed metadata. Uncommitted interruption resumes the owned transaction and restores the verified source before retry.

Audit migration43 performs the same privacy transformation in bounded SQL batches. A startup progress record advances only for real completed work or startup phases. SQL statements have deadlines; runtime and handover enforce short progress inactivity limits plus a bounded workload budget. Progress is never health. Readiness requires exact migrations, unlocked schema, authentication/settings, valid nginx and the admin interface. Docker's next ordinary probe receives only a bounded final readiness grace.

The updater supports explicit administrator acceptance of a current baseline when historical recovery artifacts are unavailable. `NYXGUARD_BASELINE_PLAN=1` prints an installation/evidence-bound challenge. `NYXGUARD_ACCEPT_BASELINE` and `NYXGUARD_BASELINE_REASON` explicitly authorize acceptance, after a fresh verified current SQL restore and protected file backup. Original ledger/raw state and staging trees remain audit evidence, with historical rollback unverified. Each attempt retains a separate receipt and proof; failed/incomplete acceptance retains the historical guard and permits an explicitly authorized fresh retry. No hand-edited recovery flags or manufactured manifests.

Only reviewed five-minute traffic counters permit historical retention or monotonic live increments. Cold backups/restores still compare all tables exactly. All operational tables, users/authentication, settings, proxy hosts, certificates, security rules and integrations remain protected. Monitor cursor identity is preserved while normal inode/offset/timestamp advances remain legitimate runtime work. Licensing identity/entitlement, vault, TLS/custom proxy files and VPN profiles/tokens are verified. Expired security rules remain stored and inactive rather than being deleted on startup.

Recovery workers inherit the installation's timezone environment and read-only clock mounts. Traffic-retention cutoffs therefore use the application's actual date formatting, including installations with a mounted host clock.

Installer defaults remain compatible. Independent instances can select container/volume names, ports and vault directory through documented instance variables. Existing installations are directed to the guarded updater rather than overwritten by installation.

5.0.5 remains immutable. Publication requires the actual upgrade, installation, failure/recovery and public-artifact certification evidence. CT106 cutover requires separate owner authorization after release review.
