# 5.0.13 validation coverage

Manager 5.0.13 retains schema 46 and uses compatible VPN Agent 5.0.2. Acceptance uses synthetic identities and disposable fixtures. Private screenshots, browser state, credentials and operational reports are excluded from public artifacts.

Qualification covers authenticated management workflows at 1366×768, 1440×900, 1920×1080 and supported narrow layouts; actual custom-certificate import and trusted TLS/SNI routing; ordered Access List persistence and enforcement; all twelve runtime themes; notification Webhook/Slack/Email persistence and credential masking; real Auth Bypass overrides with global OFF; and real WireGuard full-tunnel import, peer handshake/ping, preserved Manager access and disconnect cleanup.

HTTP/DNS issuance failures, reachability responses, recovery-key acknowledgement, post-update notes, and destructive system actions use explicitly controlled responses where actual execution would alter external infrastructure or unrelated state. They do not establish live ACME issuance, production upgrades, real owner recovery changes, or power-loss behavior.

The underlying host installation/update/recovery implementation carries forward [5.0.12 coverage](validation-5.0.12.md). Do not interpret historical operating-system validation as a fresh test of every OS version for this release. Current published Manager and Agent artifacts target Linux amd64.

Routine no-session access checks add no new administrative audit rows. Invalid cookies and changed credentials remain audited, and existing history is preserved. Historical production occurrence counts are not evidence that all past denials were false.

Custom certificate renewal/archive download remain baseline unsupported workflows; actual imported-certificate TLS is tested independently. Remote peer forwarding, endpoint reachability and application/firewall policy remain installation-specific dependencies.
