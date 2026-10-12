# NyxGuard Manager v5.0.12

Corrective release based on v5.0.11. Database schema remains **46**; VPN Agent remains **5.0.1**.

## Changes

- Compact Protected Apps rows with domain badges, responsive action groups, accessible focus and confirmed backend state. Disabling protections or enabling Auth Bypass requires confirmation.
- Recovery requests retain the target installation identity across retries. Licensing errors distinguish configuration, transport, authority rejection and retryable failures without exposing credentials or upstream response bodies.
- Certificate names are validated before database insertion. Inaccessible Cloudflare zones receive a useful safe classification; failed certificate credential cleanup is awaited.
- Routine missing-session portal checks no longer create administrative audit writes. Invalid supplied credentials, revoked access and exceptional failures remain auditable; historical records remain intact.
- Nginx activation no longer treats connected outbound DNS resolver sockets as ingress listeners. Genuine ingress listeners and active proxy connections retain activation safeguards.
- Protection headers survive proxy-location header inheritance. Valid long hostnames fit generated maps, and a zero DDoS burst uses valid Nginx syntax.
- Durable database fingerprints use an explicit SQL timestamp time zone, preventing unchanged records from falsely failing preservation or rollback checks.
- Update Manager remains available when the application is already current.

## Install and update

As root on a supported Ubuntu/Debian systemd host:

```bash
curl -fsSL https://raw.githubusercontent.com/NyxCloudRO/NyxGuardManager/main/install.sh | bash
```

For an existing supported Manager 5.0.0–5.0.11 installation:

```bash
curl -fsSL https://raw.githubusercontent.com/NyxCloudRO/NyxGuardManager/main/update.sh | bash
```

Sudo users replace `bash` with `sudo bash`. Normal updates preserve persistent storage and the database container, verify a cold backup and check application readiness. VPN requires usable TUN; adding an absent Agent at the same Manager version uses the documented [Compose activation procedure](../../docs/vpn-client.md), rather than reinstallation.

## Qualification and limits

See [validation coverage](../../docs/validation-5.0.12.md) for executed tests and limits. Live wildcard/apex Cloudflare issuance was observed on an existing installation after correcting a domain-name mistake. Controlled certificate workflow tests cover HTTP/DNS creation, renewal, failure cleanup and confidentiality; these fixtures do not establish fresh live ACME staging issuance.

Professional Support remains optional. Customer entitlement transfers are not performed by release tests. Licensing authorities and unrelated products are independently managed; authority maintenance is not bundled into the Manager image.

OpenVPN connectivity, every supported OS point release and comprehensive protection efficacy are outside this corrective qualification. Database-down diagnostics retain their safe log fallback.
