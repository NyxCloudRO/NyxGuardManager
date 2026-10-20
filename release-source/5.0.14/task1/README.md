# NyxAgent monitoring boundary

Task 1 layers on the pinned Manager 5.0.13 image and keeps VPN Agent 5.0.2 and schema 46. It is a development candidate, not a public release.

The existing roles JSON field stores `nyxagent`. Administrator and NyxAgent are mutually exclusive on account writes. An invalid historic combination fails closed as monitoring. Existing non-administrator accounts using the full monitoring permission preset remain recognized without a migration; scoped ordinary users retain their existing permission model.

Every authenticated request validates the signed token, token revocation, live account status and current roles. Monitoring requests pass an explicit operation allowlist before upload/body parsing or route execution. Unknown operations and alternate mutation routes fail closed. Service permission checks independently reject monitoring writes. Responses are redacted on the server, including nested configuration and legacy JSON metadata. Same-user session refresh may return a session token. Authorized ordinary Manage accounts receive newly created or rotated integration credentials once; subsequent reads redact stored credentials. Ordinary users also retain the original one-time owned 2FA setup/enable/backup-code responses; monitoring accounts cannot access these operations. Static schema and DNS provider field descriptors retain their non-secret form metadata. Logout persists token hashes and expiry in a restricted revocation ledger. The developer-message acknowledgement is an explicit personal preference exception: its handler selects only the authenticated user and updates that user's acknowledgement timestamp, ignoring client target IDs.

All roles use the original application pages and shell. Reviewed native controls use a shared capability guard; filters, sorting, tabs, pagination and inspection remain functional. Native Proxy Host and Access List dialogs retain their organization with locked configuration regions for read-only inspection. Obsolete text-based DOM masking is disabled. Existing module groups retain Manage / View Only / Hidden; an explicit monitoring role always has application-wide View Only access. Administrator-only operations retain their stronger restriction. The prior generic monitoring renderer is removed. Existing six localization catalogs supply navigation and authorization feedback. Diagnostics return current observations and cached results without running remote probes, generating bundles or writing diagnostics. Licensing status retains its existing client contract while skipping installation initialization for monitoring.

The existing groups map to actual routes: Proxy Hosts, Access Lists, Certificates, Security (Dashboard, Traffic, IPs, Rules, Apps, Threat and Shieldwall), Web Controls, Users, Audit/Event Center, and Settings (including VPN, updates and support). Three inactive legacy groups remain stored without invented pages. Missing ordinary assignments mean Hidden; View Only permits reviewed reads; Manage remains subject to the original service permissions and Administrator-only restrictions. Proxy-backed protection changes require both Security and Proxy Hosts Manage.

NyxAgent retains the native self-service profile, avatar and password dialogs. Exact owned routes allow name, nickname and email edits, avatar upload/removal, and password changes using the existing current-password verification. Self-service rejects privileged profile fields and cross-user requests. Ordinary users retain these personal operations independently of module visibility. Native avatar MIME, signature and size validation remains authoritative.

Build with the full committed source revision:

```sh
docker build --build-arg NYXGUARD_SOURCE_REVISION="$(git rev-parse HEAD)" -t nyxguardmanager:5.0.14-task1-candidate release-source/5.0.14/task1
```

Run the Node test runner against `tests/*.test.mjs` using Node 22. Build-time patches require exact baseline prerequisites and syntax-check the resulting JavaScript. Authenticated DEV API state verification and browser acceptance are separate required gates; unit tests alone do not qualify this task.
