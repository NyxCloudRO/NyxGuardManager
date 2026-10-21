# NyxGuard Manager v5.0.17

A focused release introducing improved historical monitoring, safer storage management and additional reliability improvements.

## What's New

**Historical Monitoring**

- Seven historical presets: 1D, 2D, 7D, 14D, 30D, 60D and 90D.
- Optimized historical aggregation with bounded resource usage.
- Clearer reporting of retained observations and data availability.

**Grafana Integration**

- Updated official Grafana dashboard with one historical time selector.
- Existing dashboards and supported monitoring configurations remain compatible.
- Existing integration token management and self-signed TLS support preserved.

**Backup & Storage Management**

- Compact Upgrade Backups and Docker Image Management sections in Settings → Backup & Restore.
- Review and remove eligible obsolete backups and images, with an explicit external-backup override for local rollback resources and selected stopped containers.
- Running containers and the current deployment remain protected; volumes are preserved.

**Reliability**

- Automatic licensing and support-entitlement refresh after startup.
- Faster storage inventory loading and improved configuration import/export and restore validation.
- Additional runtime and trust-store security maintenance.

## Compatibility

- Database schema: 49 (unchanged).
- VPN Agent: 5.0.2 (unchanged).
- Existing configuration, licensing, integration tokens and persistent data remain preserved.

## Important Notes

- Historical statistics depend on retained data and source coverage; complete coverage is not verified and expired data cannot be reconstructed.
- External Prometheus retention is managed separately.
- Import the updated Grafana dashboard explicitly; existing dashboards are not replaced automatically.
- Public image publication does not automatically upgrade production.
