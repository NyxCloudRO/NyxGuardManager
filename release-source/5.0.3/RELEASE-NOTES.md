# NyxGuard Manager 5.0.3

## [5.0.3] - 2026-10-04

NyxGuard Manager 5.0.3 extends historical analytics, administrative audit intelligence, and the shared application workspace. The database advances to 45 migrations.

### Large-window analytics

- Reworked historical access-log retrieval with bounded, file-validated parsed snapshots and complete-window aggregation, including archived logs for recent-row pagination. A measured MariaDB covering index supports traffic-summary queries.
- Extended IP reporting to 180 days, with explicit dataset-limit notices and Retry for the active historical query. Existing cancellation and response ordering keep newer selections authoritative.

### Event Center audit intelligence

- Refined actor/action/target/result records and occurrence-aware access history. Repetitive missing-session checks are grouped; credential failures and administrative actions remain individually meaningful.
- Retained exact scoped counters, server-side filtering/pagination, and physical scope clearing. Indexed retention deletes bounded batches. Threat Activity remains the authoritative attack history.

### Application workspace

- Unified bounded central-page scrolling across the authenticated shell while keeping navigation and the footer stationary. User-specific browser theme preferences restore before application paint and persist through reauthentication.
- Refined management-page density, action layouts, and profile-picture handling. Removed obsolete Redirection Hosts, 404 Hosts, and Streams product pages/endpoints while preserving shared certificate, domain, nginx, reporting, and historical-data services.

### Update and recovery

- Extended the guarded shell handover to 5.0.3 with actual-runtime detection and explicit compatibility with VPN Agent 5.0.1. Manager-only installations retain their topology; installed agents rejoin the replacement Manager network namespace. Dashboard pending-update status follows reconciled Manager discovery, including unknown/error states.

Use the supported updater from 5.0.2 and keep an independent database/volume backup. Migrations 44 and 45 are forward-only: rollback requires a verified pre-upgrade database and volume recovery set. Configuration exports alone cannot restore the database.
