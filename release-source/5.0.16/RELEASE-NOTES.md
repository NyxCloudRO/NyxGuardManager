# NyxGuard Manager v5.0.16

## Monitoring reliability

Correct collector-heartbeat freshness evaluation after database reads. A healthy heartbeat advancing during exporter generation no longer causes the identified false degraded-source response. Genuine stale, missing, pending, malformed and failed sources remain unavailable; token authentication and existing metric names, labels and rolling-window semantics are preserved.

## Historical Dashboard performance

Reuse bounded, exact aggregates for unchanged retained log files when their occurrence boundaries permit it. Repeated historical summaries can avoid unnecessary parsing and decompression while preserving requests, allowed/blocked counts, exact unique IPs, RX/TX, host attribution, pagination and coverage semantics. Appends, rotation, truncation and replacement invalidate cached snapshots. Partial boundaries and oversized entries continue full authoritative scanning. Existing parsed-cache protections and the 250 MiB Node heap limit remain intact.

## Compatibility and operational notes

Schema remains 49; VPN Agent remains independently versioned at 5.0.2. Licensing, proxy/WAF/security policies, persistent formats and backup/rollback workflows are unchanged. The image layers on the immutable qualified v5.0.15 runtime without rebuilding unrelated libraries.

Cold or changing historical scans can still take seconds; favorable synthetic warm-cache timings are not a universal production guarantee. Monitoring still requires valid integration credentials, mTLS and scrape configuration. An adapter inheriting the Manager readiness probe needs separate, explicitly authorized deployment maintenance. Publishing this release does not upgrade production or establish that its Grafana dashboard has recovered. No claim of zero CVEs is made.
