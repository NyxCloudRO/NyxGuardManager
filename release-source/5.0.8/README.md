# Historical handover compatibility correction

Patch release based on the immutable 5.0.7 image. The transaction validator now accepts the completed historical target versions 5.0.4–5.0.7 as well as the current target. Checksum, source schema, immutable identity, mutation and recovery gates remain mandatory. No database migration or VPN behavior changes.

Build with `docker build -f release-source/5.0.8/Dockerfile --build-arg NYXGUARD_SOURCE_REVISION=<reviewed-commit> -t <local-image> .`.
Run the focused ledger tests inside the candidate image with a writable disposable `/tmp` and this test mounted read-only. Reuse applicable SQL, application and installer regression suites from earlier overlays. Never run fault injection against operational installations.
