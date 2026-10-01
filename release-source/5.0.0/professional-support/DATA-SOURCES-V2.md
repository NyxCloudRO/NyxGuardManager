# Professional Support diagnostic data sources

Diagnostics are available only through the administrator and verified
Professional Support gates. Source records must not be copied verbatim into an
API response or support bundle.

| Source | Safe diagnostic use |
| --- | --- |
| OpenResty error logs | Read only allowlisted current files with bounded size, line count, host count, and time windows. Export fixed error categories, counts, and times, never raw lines or request details. |
| Audit records | Aggregate bounded action categories only. Do not export user identifiers or free-form metadata. |
| Traffic statistics | Use bounded aggregate counters by time window and host ID. Missing observations are unavailable, not zero traffic. Exclude internal log paths and ingestion offsets. |
| Threat events | Aggregate fixed categories and actions. Do not export source addresses, request IDs, reasons, rule IDs, or metadata. |
| Proxy host metadata | Use numeric IDs, booleans, scheme, port, counts, and fixed check outcomes. Do not export domains, upstream names, locations, advanced configuration, or metadata. |
| Certificate metadata | Export provider class, domain count, expiry, and derived validity states. Never include private keys, PEM contents, ACME account material, or raw metadata. |
| Backend container state and logs | Inspect only the fixed Manager container with strict time and size limits. Redact before classifying errors; export counts and times only. |

The V2 route observes backend request handling, a bounded database query and
migration row, OpenResty process and configuration, resource capacity, current
OpenResty errors, generated host configuration, public certificate validity,
and optional configured upstream probes. It does not read audit, traffic, or
threat rows for diagnostics. Missing observations remain `SKIPPED` or
unavailable; they must not become healthy zeroes.
