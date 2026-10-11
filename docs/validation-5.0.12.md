# 5.0.12 validation coverage

Manager 5.0.12 retains schema 46 and VPN Agent 5.0.1. All fixtures use synthetic identities and disposable storage; production screenshots, browser profiles and operator evidence are excluded from public assets.

## Executed acceptance

- Protected Apps browser acceptance: one/many applications, a large list, long names/domains, mixed feature states, five persisted updates, failed updates, loading/empty/error states. Viewports: 1366×768, 1440×900, 1920×1080 and 390×844.
- Management page layout audit: all eighteen principal screens at the same four sizes, including the opened Update Manager and VPN Client interfaces. Geometry and browser errors were checked. This is not a claim that every action on every page was exercised.
- Actual Nginx traffic: enabled/disabled protection headers, Bot Defence, SQL Shield, Auth Bypass and DDoS limiting. Disposable external-source traffic avoids trusted internal-address exemptions.
- Licensing compatibility and repair tests: 26 passing tests covering strict verification, transport classification, recovery identity persistence, retries and expiration/refresh behavior.
- Administrative audit tests: 500 missing-session checks produce zero database writes; supplied invalid credentials and exceptional access failures remain individually auditable. No historical audit deletion is performed.
- Nginx activation tests preserve ingress and active proxy connection checks while excluding connected outbound DNS resolver sockets.
- Certificate workflows exercise shipped modules with controlled Certbot execution: HTTP/DNS creation, renewal, failure cleanup, existing certificate preservation and API confidentiality.
- Existing access, migration, certificate error and historical recovery compatibility tests remain passing.
- Genuine v5.0.0 and v5.0.11 host updater routes reach schema 46, preserve database/container/volume identity and application fingerprints, survive recreation and support same-version no-op updates.
- Injected cold-backup failure and termination restart unchanged original services. Injected target readiness failure performs verified rollback to the previous application/data state. All three scenarios preserve application fingerprints and clear pending recovery only after health checks.
- A real database fixture reproduces timezone-dependent fingerprints under the old check and verifies identical fingerprints under UTC and Bucharest with the corrected check. DEV rollback was verified after the same correction.
- Controlled WireGuard import, connection, ping and fresh handshake succeed through the Manager API without returning private keys.

## Real-world findings and boundaries

A failed Cloudflare request contained a validly spelled but unintended second domain outside the accessible zone. The plugin failed during zone discovery, before an ACME propagation decision. Correcting the requested wildcard/apex pair produced a real valid certificate. Existing working certificate material was inspected read-only and preserved. Exposed provider credentials must be rotated before additional live testing; no new agent-run live staging or production issuance is claimed.

Licensing transport failures, email delivery failures and recovery binding mismatches were investigated separately. Authorized infrastructure maintenance restored public authority transport and queued recovery email delivery. Live customer recovery confirmation and entitlement replacement are not replayed as qualification tests. Case-sensitive purchase identities remain distinct; this release does not merge customers or modify unrelated product entitlements.

Historical OS compatibility carries forward. A focused disposable Ubuntu host check does not certify every supported distribution or hardware configuration. OpenVPN and broad attack-detection efficacy remain unqualified.
