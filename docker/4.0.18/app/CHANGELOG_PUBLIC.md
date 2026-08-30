# NyxGuard Manager 4.0.18

## Developer experience

- Added an optional Developer Message describing NyxGuard Manager's independent development, local-first philosophy, and free-to-use model.
- Normal dismissal lasts for the current authenticated session; choosing **Support NyxGuard** persists acknowledgement for that user.
- Preserved the existing sidebar support action with no donation verification, tracking, or feature restriction.

## Reverse proxy and Custom Locations

- Improved Custom Location reliability while preserving strict backend validation.
- Corrected numeric forward-port serialization and improved compatibility for generated configurations and generic host-with-path routing.
- Preserved compatibility with existing Proxy Hosts.

## Threat Activity

- Added accurate independent filtered totals and bounded server-side pagination.
- Added server-side search, filtering, minimum-count selection, and sorting with deterministic secondary ordering.
- Large result sets beyond 200 rows are now represented accurately.

## Updates

- Upgrades now discard stale Compose build-metadata overrides and report the authoritative version embedded in the release image.
