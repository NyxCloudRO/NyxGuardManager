# NyxGuard Manager 5.0.9 corrective overlay

Build from the reviewed repository root using the immutable 5.0.8 base pinned in the Dockerfile. Supply `NYXGUARD_SOURCE_REVISION` with the reviewed source commit. This overlay preserves schema 45 and VPN Agent 5.0.1.

Recovery accepts a legitimate unactivated SQL NULL licensing state while retaining strict authentication of populated states. Audit-table migration reports completed schema/index work without extending idle or absolute startup limits. Duplicate legacy threat events preserve distinct canonical associations. Integration credentials and configuration remain protected while authenticated last-use timestamps can advance.

Tests cover licensing, startup budgets, integration preservation and duplicate-history migration. The SQL regression requires an explicitly authorized disposable database; it must never run against an application database. See [release notes](RELEASE-NOTES.md) and [validation coverage](../../docs/validation-5.0.9.md).

Audit and native threat-event retention wait until the durable upgrade commits or recovery completes. The existing retention policy resumes afterward; mandatory preservation checks remain unchanged. Only the cleanup decision is readable by the application user; private recovery ledgers remain protected.
