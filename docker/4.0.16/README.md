# NyxGuard Manager 4.0.16 container sources

Container build sources for the official NyxGuard Manager 4.0.16 images.

This release prevents overlapping attack-monitor polls from exhausting the
database connection pool when an Aria state-table update is delayed by a lock.
The monitor remains best-effort and retains its existing one-second schedule,
but a new poll is skipped while the previous poll is still running.

The Manager image is built from the exact tested 4.0.15 hotfix digest and
contains only the single-flight monitor correction plus 4.0.16 version and
release-note metadata. The VPN agent is unchanged apart from its release label.
