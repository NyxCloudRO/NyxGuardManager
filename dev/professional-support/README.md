# NyxGuard 5 diagnostics core

These ESM modules are pure application components. They do not read the live
database, credentials, filesystem, process environment, or network and do not
modify the current 4.0.18 container. The integrating route must load the host
and certificate by authorized database ID, enforce current admin and verified
NyxGuard Professional Support entitlement, then pass an allowlisted snapshot.

`diagnostics.mjs` exports `systemDiagnostics(snapshot)`,
`configuredTarget(host)`, `routingDiagnostics(host, observations)`,
`tlsDiagnostics(host, certificate, observations)`, and
`troubleshoot502(host, observations)`. The caller must perform bounded DNS,
TCP, TLS and HTTP observations against the configured host only, pin the
resolved address, disable redirects, omit credentials, and enforce time and
byte limits. An arbitrary URL from a request is never accepted here. Missing
observations return `SKIPPED`.

`bundle.mjs` exports `buildSupportBundle({version, installationId, system,
routing, tls, troubleshooting, now})`. It returns `{bundle, bytes}` with one
UTF-8 JSON object containing `format: nyxguard-support-bundle-v1`. Its schema
selects only result check/state/evidence; the recursive redactor then removes
sensitive fields and values. Size is capped at 1 MiB. Integrators must not
persist or log pre-redaction collector objects. Keep the exact `bytes` for
idempotent upload retries.
