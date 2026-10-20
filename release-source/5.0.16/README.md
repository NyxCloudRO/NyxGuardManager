# NyxGuard Manager 5.0.16

Build the linux/amd64 overlay with `docker buildx build --platform linux/amd64 --build-arg BUILD_REVISION=<reviewed-source-commit> --load -t nyxguard-local:5.0.16 .`. The immutable public 5.0.15 digest is the runtime base and rollback reference. Only the exporter freshness check, exact historical-summary reuse and release metadata/asset identities change. Schema 49, Agent 5.0.2 and the 250 MiB Node heap remain unchanged.

See [release notes](RELEASE-NOTES.md) and [focused regression inputs](tests/README.md). The complete earlier runtime source remains in versioned historical directories. Public qualification must cover real APIs, collector coexistence, adapter/mTLS/Prometheus ingestion, installation, seeded upgrade and rollback against the exact frozen image. Publication requires the owner's explicit approval of its qualified digest. Production deployment and local adapter maintenance are separate actions.
