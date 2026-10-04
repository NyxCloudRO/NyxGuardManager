# NyxGuard Manager 5.0.3 release source

This overlay builds on the validated immutable public 5.0.2 Manager image. Run
`release-source/5.0.3/build-release.sh` from a clean, committed checkout. The build
records the exact source revision, rejects a different prerequisite image, and
checks generated JavaScript syntax. Publication is a separate operation.

## Architecture

Event Center attributes actors on the server and retains safe target/context
metadata. Repetitive missing-session checks use five-minute source/resource
buckets; credential failures remain individual. Exact scoped counters and
clearing share the same validated predicate. Deep offset and literal search
retain their measured linear costs. Retention uses bounded indexed batches.

Historical access-log snapshots validate file identity and modification before
reuse. Cache ceilings limit retained memory, never the scanned reporting window.
Eviction, rotation, replacement, append, and restart trigger complete rescans.
A MariaDB covering index supports the existing traffic-summary aggregation.
The API reports its IP result ceiling explicitly; each returned IP covers the
complete selected interval. Existing pagination, export, and request cancellation
remain in place.

The application shell fixes viewport/navigation/footer geometry; existing bounded
route frames own vertical overflow. Dataset tables and editors retain their local
regions. Theme preferences remain browser-local and isolated per authenticated
user; no cross-device preference service is introduced. Avatar policy is shared
by browser, multipart parser, and API with an exact 5 MiB boundary.

Obsolete UI and endpoint dependency closures are pruned with integrity-pinned
build tools. Shared certificate/domain/nginx/report services and historical data
models remain available. See [legacy dependency boundaries](LEGACY-AUDIT.md).

## Compatibility and recovery

Manager 5.0.3 retains the unchanged public VPN Agent 5.0.1 image. Both built-in
and shell updates use verified database/volume recovery before replacement and
reconcile the actual runtime rather than relying on stale Compose metadata.
Manager-only installations remain Manager-only. Schema 45 comprises two new
forward-only migrations; rollback requires restoring a verified pre-upgrade
database and persistent-volume recovery set.

Automated tests use isolated synthetic databases and refuse deployed database
identities. Browser acceptance requires privately supplied session state and
writes evidence outside the public source tree.
