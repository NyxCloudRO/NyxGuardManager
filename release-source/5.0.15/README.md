# NyxGuard Manager 5.0.15 stability hotfix

Build this directory with `docker build --build-arg BUILD_REVISION=<reviewed-source-commit> -t nyxguard-local:5.0.15 .`. The immutable public 5.0.14 digest is the base and rollback reference. Only the parsed-log cache and release identity/notes change. The frontend asset graph receives new names to avoid mixing cached modules across versions; interface behavior is preserved.

The cache bounds optional parsed snapshots by estimated heap bytes and event count. An oversized file continues streaming to every aggregation callback; it is not partially cached and no retained records are removed. Fingerprint invalidation, compressed logs, parser isolation and scan-error propagation are preserved.

Schema 49 and Agent 5.0.2 remain independent. No security runtime or dependency installation occurs. Publication requires exact-candidate functional qualification, final scanner/provenance checks and owner approval. The separately qualified host updater is delivered through main independently of the image.
