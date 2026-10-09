# Manager 5.0.7 overlay

This minimal overlay inherits the immutable public 5.0.6 image by digest. It replaces SQL helper monitoring/staging cleanup, the versioned release policy, resume policy discovery and displayed version markers. Migrations, application UI and other runtime behavior remain inherited. VPN Agent remains 5.0.1.

Build from the repository root with `docker build --build-arg NYXGUARD_SOURCE_REVISION=<exact-source-commit> -f release-source/5.0.7/Dockerfile -t <new-private-candidate> .`. Never build over a published tag. `manifest.json` on the release records the source commit, base image, registry digest, runtime image identity and script/bootstrap checksums.

The published validation summary distinguishes execution, injected faults, package-only tests and inherited evidence. The real origin of the production monitor's slow query remains unproven; the reproduced fatal-client-timeout behavior is corrected without loosening backup acceptance.
