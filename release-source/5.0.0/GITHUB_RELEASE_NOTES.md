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

The in-app Update Manager can hand over a supported 4.0.18 Compose installation to 5.0.0. Before migration it verifies a full MariaDB, volume, configuration and exact-image recovery set and prepares a persistent vault key. It checks the new Manager and VPN agent, including their shared network namespace. If startup fails after migration, it restores the pre-upgrade database and volumes before resuming 4.0.18. The updater also reports Docker socket group access problems with actionable details.

## Security and Privacy

Local entitlement state is encrypted with a separately persisted vault key. Signed entitlement verification checks product, capability, installation binding, validity, and revision. Support bundles use structured field selection and redaction and do not intentionally include raw credentials, private keys, or raw configuration archives.

## Upgrade Notes

Version 5.0.0 adds database migration 42. Before upgrading, retain your own MariaDB dump, persistent volume archives, Compose configuration and exact rollback image. The public host-side `update.sh` automatically invokes the verified major handover for a supported 4.0.18 installation and creates its own recovery set. The in-app Update Manager also supports that handover. Docker socket access must grant the application's runtime group, and the VPN agent needs host TUN access. Follow the [upgrade procedure](https://github.com/NyxCloudRO/NyxGuardManager#update-in-place). An image-only rollback after migration 42 is unsafe; restoring 4.x requires the matching pre-upgrade database and volumes.

## Compatibility

The core reverse proxy and security features remain available without Professional Support. Existing customer configuration is retained by the supported in-place upgrade procedure. The VPN client uses the paired agent and its persistent volumes.

## Docker

After publication, pull `nyxmael/nyxguardmanager:5.0.0` or the immutable digest recorded in the release announcement. Verify the digest before deployment. The VPN agent image must match the supported release pairing.

## Full Changelog

See [CHANGELOG.md](https://github.com/NyxCloudRO/NyxGuardManager/blob/v5.0.0/CHANGELOG.md).
