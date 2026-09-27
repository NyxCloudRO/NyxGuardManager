# NyxGuard Manager 5.0.0

NyxGuard Manager 5.0.0 introduces optional Professional Support and a Diagnostics & Support workspace while retaining the core reverse proxy and security platform for all installations.

## Highlights

- See application, database, migration, OpenResty, and resource health in one workspace.
- Troubleshoot configured hosts with bounded DNS, routing, TCP, HTTP, and TLS checks.
- Create a structured redacted support bundle, upload it securely, and use its Support ID for follow-up.
- Activate and recover installation-bound Professional Support with signed entitlements.
- Use eligible NyxCloud Premium Support coverage for NyxGuard Manager diagnostics.

## Professional Support

Professional Support unlocks Diagnostics & Support. The License page shows entitlement and authority status and provides activation, refresh, and recovery controls. Core proxy hosts, certificates, access control, and security features do not require this optional entitlement.

## Diagnostics & Support

The new workspace brings together system health, recent problems, guided troubleshooting, and support bundles. Host checks use configured NyxGuard hosts and bounded network probes. Results distinguish a failed check from a check that could not be completed.

## License Recovery & Replacement

Customers can recover an existing entitlement for a replacement installation through the supported authority workflow. Entitlements remain bound to the installation and are verified before support features unlock.

## NyxCloud Premium Support

An eligible signed NyxCloud Premium Support entitlement can unlock NyxGuard Manager diagnostics when it explicitly includes NyxGuard coverage.

## Update & Reliability

The updater reports Docker socket access problems with actionable runtime group information and preserves the socket group and health checks when preparing a replacement container. Major-version handover requires the host-side upgrade runbook and a verified full recovery set. In-place upgrades retain named volumes; the paired VPN agent must be recreated against the new Manager network namespace.

## Security and Privacy

Local entitlement state is encrypted with a separately persisted vault key. Signed entitlement verification checks product, capability, installation binding, validity, and revision. Support bundles use structured field selection and redaction and do not intentionally include raw credentials, private keys, or raw configuration archives.

## Upgrade Notes

Version 5.0.0 adds database migration 42. Before upgrading from 4.x, verify a MariaDB dump, persistent volume archives, Compose configuration, the exact rollback image, and the persistent vault key. Follow the [upgrade procedure](https://github.com/NyxCloudRO/NyxGuardManager#update-in-place). An image-only rollback after migration 42 is unsafe; restoring 4.x requires the matching pre-upgrade database and volumes.

## Compatibility

The core reverse proxy and security features remain available without Professional Support. Existing customer configuration is retained by the supported in-place upgrade procedure. The VPN client uses the paired agent and its persistent volumes.

## Docker

After publication, pull `nyxmael/nyxguardmanager:5.0.0` or the immutable digest recorded in the release announcement. Verify the digest before deployment. The VPN agent image must match the supported release pairing.

## Full Changelog

See [CHANGELOG.md](https://github.com/NyxCloudRO/NyxGuardManager/blob/v5.0.0/CHANGELOG.md).
