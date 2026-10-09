# NyxGuard Manager 5.0.9

Corrects duplicate legacy Threat History migration so each legacy identity keeps a distinct canonical association. Existing canonical ownership is preserved across partial migration and retry; persisted history verification remains strict.

Recovery handles legitimate SQL NULL unactivated licensing states while authenticating populated states. Completed audit-table schema/index work reports bounded progress without extending the migration watchdog or maximum budget. Integration credentials/configuration remain protected while authenticated last-use timestamps can advance.

Retains mandatory verified SQL backup, staged restore, guarded rollback/retry, schema 45 and VPN Agent 5.0.1. Supported guarded sources are 5.0.0–5.0.8. Established Ubuntu/Debian support carries forward independently of hotfix retesting.

Use the [upgrade and recovery guide](../../docs/upgrade-5.0.9.md) and review [validation coverage](../../docs/validation-5.0.9.md). Preserve prior recovery evidence and verify service topology before retrying. No production upgrade is claimed by this release.

Audit and native threat-event retention wait until the durable upgrade commits or recovery completes. The existing retention policy resumes afterward; mandatory preservation checks remain unchanged. Only the cleanup decision is readable by the application user; private recovery ledgers remain protected.

Validation: complete isolated 5.0.0-to-5.0.9 upgrade committed after a deliberately interrupted attempt reached verified rollback. 59 focused/durable tests, 12 host contracts, 8 publication-gate tests and the SQL duplicate/retry regression passed. See the validation guide for precise scope and inherited VPN/OS coverage.
