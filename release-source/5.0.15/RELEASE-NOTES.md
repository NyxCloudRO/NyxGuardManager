# NyxGuard Manager v5.0.15

- Prevent backend heap exhaustion when Dashboard and Live Traffic scan larger retained access-log histories. Bound the optional parsed-log cache by estimated memory and record count; continue scanning every retained record when a file is too large to cache.
- Preserve traffic totals, time ranges, pagination, blocked-request attribution and the distinction between unavailable values and measured zero.
- The coordinated standalone host updater retries temporary readiness-command failures within a bounded deadline and records the failing command category. Database, Nginx, application and VPN health acceptance and verified rollback remain enforced.

Schema remains 49. VPN Agent remains independently versioned at 5.0.2. Existing licensing, security runtime and persistent-data formats are retained. Production deployment and post-deployment validation are separate operator actions.
