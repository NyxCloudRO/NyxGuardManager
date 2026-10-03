# NyxGuard Manager 5.0.2

NyxGuard Manager 5.0.2 improves audit integrity, temporary security-rule cleanup, traffic-view performance, and responsive administration. This release brings the database to 43 migrations.

## Audit and security history

- Event Center now presents structured administrative and operational audit history in framed cards, with category, actor, action, search, and time filters.
- Actors are attributed to authenticated server-side identities. Client-supplied actor fields cannot impersonate an administrator, and audit metadata excludes sensitive fields.
- Event Center counts and clearing follow the selected scope. Clearing audit records does not clear Threat Activity or native Web Threat history.
- Threat Activity remains the authoritative attack history. Migration 43 verifies and recovers recognized legacy attack records before removing duplicate source records.

## Security-rule lifecycle

- Expired automatic bans are cleaned up without waiting for new telemetry. Expired automatic enforcement state is physically removed and enforcement reloads are retried.
- Disabled manual rules remain manageable; automatic cleanup preserves manual configuration.
- Expired temporary rules for verified crawlers are removed independently of incoming traffic.

## Presentation and performance

- Sidebar density adapts to small-height and larger desktop displays while retaining navigation and mobile controls.
- Proxy Hosts uses a more compact layout while retaining visible information.
- Traffic Rules Save and Cancel actions have clearer spacing.
- WAF PARTIAL state uses a compact, readable amber badge.
- Diagnostics & Support shows Manager process uptime in human-readable form.
- Large traffic and IP datasets use more efficient selection and pagination. Filtering and export retain the full loaded IP dataset.
- Cancellation and stale-response handling keep older requests from replacing newer results.
- Traffic, IP, Dashboard, GlobalGate, and Web Controls provide clearer loading, error, empty, and retry states.

## Upgrade and recovery

Use the supported guarded update workflow for 5.0.1 to 5.0.2 and retain an independent database and volume backup. Migration 43 is forward-only: rollback after migration requires a verified pre-upgrade recovery set. Configuration exports alone are not database recovery backups.

The VPN Agent remains compatible with the unchanged 5.0.1 Agent image. Release validation covers fresh installation, same-major upgrade, persistence across restarts, and recovery behavior.

## Deferred work

A global action/button spacing audit is planned for a future release. Save/Cancel, Edit/Delete, Delete All and adjacent actions, confirmations, table actions, modal footers, and compact toolbars still need a consistent modest-spacing review across supported viewport sizes. This release corrects the Traffic Rules Save/Cancel spacing; it does not claim to resolve every action group.
