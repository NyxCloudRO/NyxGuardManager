# NyxGuard Manager 5.0.8

Corrects rejection of a valid completed historical 5.0.6 handover ledger before a new upgrade can start. Historical target versions 5.0.4–5.0.7 remain readable, with checksum, identity, schema, mutation and recovery gates preserved. The bootstrap checks historical recovery before renaming services.

Retains verified SQL backups and staged restore, bounded recovery, schema 45 and VPN Agent 5.0.1. Supported guarded sources are 5.0.0–5.0.7. No new migration or functional UI changes.

Public documentation and packaging now consistently describe the current release. A permanent source, dependency, version and artifact publication gate protects future releases.

Before retrying an earlier failed setup, verify service-name and network-namespace topology. See the [upgrade guide](../../docs/upgrade-5.0.8.md) and [validation coverage](../../docs/validation-5.0.8.md). Do not bypass verification or delete recovery artifacts.
