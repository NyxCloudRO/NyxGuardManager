# NyxGuard Manager 4.0.16

## Attack monitor reliability

- Prevented overlapping attack-monitor polling jobs when a database operation takes longer than the polling interval.
- Kept polling single-flight so a slow or locked state update cannot consume the application database connection pool.
- Preserved the existing attack detection, event processing, state tracking, and best-effort error behavior.

## Operational safety

- Validated the change under deliberate MariaDB table-lock contention.
- Confirmed that only one monitor query waits while the remaining pool connections stay available.
- Existing application data, certificates, proxy configuration, WAF policy, access controls, and VPN profiles remain unchanged during the update.
