# NyxGuard Manager 5.0.3 development

## Event Center audit intelligence

Refined administrative audit history with occurrence-aware access decisions,
server-authoritative actor attribution and useful target details. Repeated
missing-session access checks are grouped in five-minute source/resource buckets;
credential failures and other denials remain individual. Routine session refresh
no longer produces administrative rows; explicit scoped-token issuance remains
visible. Existing audit retention now deletes bounded batches using a time index.
Audit history retains server-side filtering and pagination, with a stable desktop
shell, internal history scrolling, distinct actor types and truthful loading,
empty, error and retry states.

Threat Activity continues to own attack telemetry. This development work does not
change production until a separately authorized release and deployment.

## Interface consistency and persistent preferences

Standardized dashboard scroll ownership through shared shell primitives and
modest action-group spacing, preserving existing page controls and workflows.
Theme preferences now restore before application paint and persist per user in
the existing browser preference store across navigation and reauthentication.

## Large-window analytics retrieval

Historical access-log retrieval reuses bounded, file-validated parsed snapshots
without trimming requested intervals; traffic-summary aggregation uses a measured
MariaDB covering index. Historical recent-row pagination includes archived logs.
IPs & Locations exposes the supported 180-day interval and the API's complete
bounded dataset, with an explicit notice if the IP result ceiling is reached.
Event Center deep pages fetch narrow selected IDs before audit payloads, preserving
its accepted exact occurrence, filter, ordering and scoped-clear contracts.
