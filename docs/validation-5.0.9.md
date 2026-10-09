# 5.0.9 validation coverage

The corrective overlay preserves guarded upgrade data, schema 45 and VPN Agent 5.0.1. Validation uses an isolated existing-data fixture and synthetic regression cases; operational identifiers, data and raw logs remain private. No production installation was upgraded.

| Coverage | Result |
| --- | --- |
| Licensing, integration identity/usage, startup budgets, historical-ledger compatibility, retention isolation and durable recovery | 59 tests passed |
| Installer, updater containment and VPN routing contracts | 12 tests passed |
| Publication gate regression | 8 tests passed |
| Original duplicate-event defect | Reproduced; corrected migration keeps distinct legacy associations |
| Duplicate, replayed, partially migrated and canonical history | SQL regression passed, including strict mismatch rejection, idempotence and safe interrupted retry |
| Complete 5.0.0 → 5.0.9 isolated existing-data upgrade | Verified SQL backup/staged restore, schema 42 → 45, readiness, protected files, application/history/licensing/integration preservation and final **COMMITTED** passed |
| Deliberately interrupted isolated replacement | **ROLLBACK_COMPLETE**, verified source restoration, then committed guarded retry passed |
| Authenticated integration metrics | HTTP 200 on the isolated fixture after recreation; legitimate usage advance exercised |
| Repeat updater and Compose recreation | No-op repeat update and healthy recreated Manager passed |
| Root and sudo pipe entry points | Installer parsing and existing-installation refusal passed; prerequisite and privilege requirements retained |
| Existing Debian 13 host | Prior committed upgrade evidence retained; focused Manager/Agent health, network namespace, TUN and persistent Agent startup checks passed |

The existing-data acceptance ran on Debian 13 with Manager-only topology. It is an upgrade test, not a fresh-host installation certificate. The previously validated VPN-capable upgrade remains historical evidence; no new full 5.0.9 remote-peer acceptance is claimed. All supported source schema/policy entries are tested, while every source-version runtime path and every supported OS were not rerun.

Unchanged SQL monitoring/deadline/cleanup and VPN-only repair behavior reuse prior validated coverage plus the current focused contracts. Licensing tests authenticate populated states and reject corruption/wrong keys; no new customer-specific entitlement or external authority validation is claimed.

The [supported OS matrix](installation.md#supported-operating-systems) carries forward historical support independently of this focused release scope. Audit/native threat retention waits for durable commit or verified completed recovery, then resumes its existing policy. A pending historical recovery remains a blocker; the new release does not silently replace a retained older helper or bypass its evidence.

See the [upgrade and recovery guide](upgrade-5.0.9.md). Require a checksummed committed transaction and healthy runtime, rather than inferring success from completed migration steps.
