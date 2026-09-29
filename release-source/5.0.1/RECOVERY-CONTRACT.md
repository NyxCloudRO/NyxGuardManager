# 5.0.x same-major recovery contract (Task 1A)

This is the target-image handover implementation for same-major updates. It
does not change the immutable 5.0.0 image or the accepted public 4.0.18 host
updater. The rest of the 5.0.1 updater, topology UI, version, and deployment
work remains in Task 1.

## Write boundary and protected state

The replacement Manager runs migrations and setup before its HTTP health
check. It can write MariaDB, `/data`, and `/etc/letsencrypt` during that time.
The VPN Agent can write its state and shared authentication-token volumes.
The Manager's licensing vault key is mounted read-only; the host Compose and
environment files are not rewritten by this same-major path. Docker socket
access is reserved for the update engine; it is not a general host snapshot.

The observed installation uses MariaDB, not PostgreSQL. Its application
tables are Aria, so a transactional dump alone is insufficient. The helper
stops the old VPN Agent (if present) and old Manager before backup. It keeps
MariaDB running, dumps the database with `mariadb-dump --lock-all-tables`, and
archives the quiescent `nyxguard_data` and `nyxguard_letsencrypt` volumes.
For VPN installations it also archives `nyxguard_vpn` and
`nyxguard_vpn_auth`; Manager-only installations get neither VPN archive nor
VPN container. It captures and verifies the existing vault key. The live
`nyxguard_db` directory is used only for a conservative disk-size estimate;
it is never copied as a database backup.

The recovery directory is mode 0700, files are mode 0600, and a manifest with
SHA-256 digests is written last. Available space must exceed 2.5 times the
measured database and volume bytes plus 256 MiB. A failed SQL dump, tar,
integrity check, or space check prevents replacement startup. Unknown
writable mounts and an unhealthy or detached VPN Agent fail before quiescence.

## Handover

The sequence is: validate mounts and topology supplied by the caller; stop
old runtime; complete recovery point; start replacement Manager; verify
Manager health; start and verify VPN if present; verify its namespace; record
success; remove old containers; remove the recovery point. The old containers
remain available until health and state commit.

On a post-start failure, the helper stops and removes the replacement,
verifies every recovery digest, restores volume archives and SQL, checks the
original migration count, restores the vault identity, then starts and checks
the old Manager and optional VPN Agent. It clears `pendingVersion` and
`restartPending`, records the failure and recovery status, and permits a new
attempt. If restoration or old-runtime health fails, it leaves the old
runtime stopped, retains recovery material, and records
`manualRecoveryRequired=true` where the state volume remains writable. It
never records success after a failed restore.

SIGTERM and SIGINT during backup or activation are handled as update failures;
the helper finishes or rejects backup safely, then restores after any
replacement write. The disposable fixtures interrupt the helper after a
replacement write in both topologies and verify the old runtime and data.

This contract relies on the old Manager and VPN Agent being the only normal
application writers while MariaDB is dumped. Unexpected writers and unknown
writable application mounts must be handled before activation. An abrupt host
failure can leave a retained recovery point requiring operator intervention;
automatic resume after power loss belongs to the remaining Task 1 state
machine work. A hard SIGKILL likewise requires inspection of the retained
recovery point before the old runtime is restarted.

## Test scope

`same-major-handover.test.mjs` exercises Docker API ordering, both topologies,
failed backup, post-start health failure, restore failure, stale-state
reconciliation, cleanup invocation, and fail-closed mount/namespace checks.
Run in a container without a real Docker socket using
`NYX_UPDATER_MOCK_CONTAINER=1`.

The two `*-dind.sh` scripts run only with `NYX_TASK1A_DISPOSABLE=1` inside
disposable Docker-in-Docker fixtures already running 5.0.0. They exercise
actual Aria SQL dump/restore, migration 42, settings and marker records,
application and certificate files, vault fingerprint, optional VPN files,
insufficient space, SQL and archive failures, corrupt recovery material,
restore failure, and cleanup. `same-major-handover-dind.mjs` runs the real
helper against a disposable replacement that writes SQL and persistent files
then fails before health. Its independent evidence volume proves that the
fault occurred after the writes. The same test can be repeated to prove a
retry after rollback. The fixture images use a test-only tag and must not be
published.
