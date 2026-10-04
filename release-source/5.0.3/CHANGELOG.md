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
