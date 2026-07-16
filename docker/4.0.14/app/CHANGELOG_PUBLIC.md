# NyxGuard Manager 4.0.14

## Major improvement — Multi-site WireGuard VPN Client

- Connect NyxGuard to multiple remote offices, datacenters, homes, or cloud networks through independent WireGuard client profiles.
- Manage every remote site from one focused workspace with its own name, interface, private routes, endpoint, tunnel address, handshake, transfer totals, and restart policy.
- Open VPN Client directly from the main sidebar as a dedicated workspace, separate from application Settings.
- Connect and disconnect sites independently, rename existing sites, and run a route-bound connectivity test against private remote addresses.
- Disconnected sites provide a prominent **Connect VPN** action in the detail view and a direct quick-connect action in the site list.
- Add VPN site now provides a guided, always-actionable profile workflow with optional naming, file readiness feedback, and clear validation messages.

## Secure by design

- Tunnel operations are isolated in a dedicated VPN agent; the NyxGuard Manager application remains unprivileged.
- Private keys are kept in a restricted persistent volume and are never displayed or returned through the Manager API.
- Explicit destination routes, tunnel addresses, and existing sites are validated before a profile is accepted.
- Remote CIDRs are also checked against networks already attached to NyxGuard before storage and connection.
- Unsafe full-tunnel defaults are narrowed to the remote networks selected by the administrator.
- Profile DNS changes and executable WireGuard hooks do not modify the NyxGuard host.

## Production operations

- Matching Manager and VPN agent images provide a consistent versioned deployment.
- Fresh installation, in-place update, restart persistence, and same-version repair flows preserve existing application data, certificates, and VPN profiles.
- Host capability detection keeps the core Manager available when the optional VPN tunnel device is not enabled.
- Comprehensive documentation covers address planning, firewall rules, return routing, NAT, overlapping networks, testing, and publishing private applications.

## NyxGuard 4 platform

NyxGuard 4 combines reverse proxy management, application protection, access control, traffic intelligence, certificate automation, notifications, SSO, observability, and private multi-site connectivity in one self-hosted platform.
