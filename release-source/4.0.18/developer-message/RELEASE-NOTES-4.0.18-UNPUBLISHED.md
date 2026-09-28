# NyxGuard Manager 4.0.18 — UNPUBLISHED DRAFT

NyxGuard Manager 4.0.18 improves reverse-proxy reliability, scales Threat
Activity beyond the previous 200-row ceiling, and introduces an optional new
developer message.

## What’s new

- Added a new developer message highlighting NyxGuard Manager’s independent
  development, local-first philosophy, and free-to-use model, with an optional
  way to support continued development. Normal dismissal lasts only for the
  current signed-in session; choosing **Support NyxGuard** remembers the choice
  for that user while leaving the existing sidebar support action available.

## Improvements and fixes

- Fixed Custom Location saves so numeric forward ports are serialized correctly
  while retaining strict backend validation, generic host-with-path routing, and
  compatibility with existing Proxy Hosts.
- Improved Threat Activity accuracy and scalability with an independent filtered
  total, bounded server-side pagination, server-side search and filtering, and
  deterministic sorting for result sets larger than 200 rows.

This draft is intentionally unpublished. It is not a release marker, tag,
installer entry, updater entry, image tag, or public announcement.
