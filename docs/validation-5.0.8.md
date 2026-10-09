# 5.0.8 validation coverage

The patch corrects historical-ledger compatibility using the immutable 5.0.7 image. Disposable fixtures contain synthetic installation identities; private operational evidence is excluded.

| Coverage | Result |
| --- | --- |
| Original historical-ledger rejection | Reproduced using the published 5.0.7 runtime and a read-only ledger |
| Historical targets 5.0.4–5.0.8, corruption and identity/schema/mutation gates | 8 focused tests passed |
| Durable interruption, restart and rollback contracts | 20 tests passed |
| Installer, updater containment and VPN routing | 12 host tests passed |
| Full 5.0.0 to 5.0.8, Manager with VPN and Manager-only | Verified SQL backup, staged restore, schema 42 to 45 and final commit passed |
| Forced backup-worker interruption, then retry | Verified rollback, source application checks and committed retry passed |
| Retained completed 5.0.6 ledger | Read successfully and preserved byte for byte |
| Login, settings, proxy API, traffic and protected configuration | Application fingerprints and acceptance checks passed |
| Compose recreation and repeat updater | Healthy startup and no-op update passed |

Unchanged SQL latency/deadline/cleanup and TUN activation behavior reuse the [5.0.7 focused coverage](validation-5.0.7.md). Full fresh Debian systemd host installation, every source-version end-to-end upgrade, real remote VPN peer traffic, and customer-specific licensed application checks were not newly exercised. Source-version policy checks cover 5.0.0–5.0.7; they are not a claim that every environment was tested. No production upgrade was performed.

See the [upgrade and recovery guide](upgrade-5.0.8.md). Completed historical transactions remain evidence; incomplete recovery and invalid ledgers still block upgrades.
