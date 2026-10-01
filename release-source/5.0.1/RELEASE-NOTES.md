# NyxGuard Manager 5.0.1

NyxGuard Manager 5.0.1 improves update reliability, operational diagnostics, and smaller-screen usability. It adds no database migration; installations remain at 42 migrations.

## Highlights

- Supported 5.0.x updates use a guarded handover with verified recovery data and clear download, activation, and recovery states.
- Diagnostics & Support shows accurate Manager process uptime, service and VPN health, build information, and compact configured-host checks.
- Support bundles report the running release and retain structured redaction.
- License refresh reflects a successful authority response after an offline state.
- VPN Client reports an unreachable Agent explicitly, offers retry, and restores the saved site list when the Agent returns.
- Traffic Rules, Threat Activity, Dashboard, Settings, and the sidebar work better across laptop and narrow viewports.

## Upgrade notes

Use the supported update workflow for 5.0.0 to 5.0.1 and retain an independent backup. The matching 5.0.1 VPN Agent tag contains the unchanged 5.0.0 Agent image. Existing users, settings, certificates, and VPN state are preserved by the guarded handover.
