# NyxGuard VPN Client networking guide

NyxGuard Manager 5.0.0 can connect to multiple remote sites as a WireGuard client. Each site has its own interface, routes, status, lifecycle controls, and connectivity test. Remote applications remain private and can be used as NyxGuard Proxy Host upstreams after the tunnel is working.

## Architecture and security boundary

The production stack uses two matching images:

- `nyxmael/nyxguardmanager:5.0.0` runs the web application without network-administration privileges.
- `nyxmael/nyxguardmanager-vpn-agent:5.0.0` owns WireGuard operations and receives only `NET_ADMIN` plus `/dev/net/tun`.

The agent shares the manager network namespace but listens only on loopback. Calls are authenticated with a random token stored in a dedicated shared volume. Client private keys stay in the restricted VPN volume and are never returned by the API.

## Required topology

For each remote site, identify:

- the public WireGuard endpoint, such as `vpn.example.net:51820`;
- a unique WireGuard tunnel address for the NyxGuard peer;
- every remote LAN in CIDR notation, such as `192.168.20.0/24`;
- an internal address used for testing, such as the gateway `192.168.20.1`;
- whether the remote gateway will use routed return traffic or source NAT.

An address such as `192.168.20.1` is a host or gateway. The corresponding LAN is normally written as `192.168.20.0/24` and that CIDR is what belongs in `AllowedIPs` or **Remote networks**.

## Example client profile

```ini
[Interface]
PrivateKey = CLIENT_PRIVATE_KEY
Address = 10.90.20.2/32

[Peer]
PublicKey = SERVER_PUBLIC_KEY
Endpoint = vpn.example.net:51820
AllowedIPs = 192.168.20.0/24
PersistentKeepalive = 25
```

Upload one dedicated profile per site and give it a clear name. NyxGuard accepts standard client profiles while applying these safety controls:

- `DNS` entries are ignored so a remote profile cannot replace NyxGuard DNS.
- `PreUp`, `PostUp`, `PreDown`, and `PostDown` commands are blocked.
- Full-tunnel routes (`0.0.0.0/0` or `::/0`) must be replaced with explicit remote networks during upload.
- Routes and tunnel addresses may not overlap with another configured site.
- Remote routes may not overlap a network already attached to NyxGuard itself; this protects the Manager, database connectivity, and existing local upstreams from route replacement.

## Remote gateway requirements

A successful WireGuard handshake proves only that both peers exchanged encrypted packets. To reach devices behind the remote gateway, that gateway must also forward traffic between WireGuard and its LAN.

The remote side needs:

1. IP forwarding enabled.
2. Firewall rules allowing traffic between the WireGuard interface and the required LAN.
3. Either a return route to the NyxGuard tunnel network or source NAT on the remote WireGuard gateway.
4. Host firewalls that permit the intended ICMP or application traffic.

Routed return traffic preserves the original tunnel source address and is preferred where the LAN router can carry a route back to it. Source NAT is simpler when the existing LAN router cannot be changed, but remote hosts will see the WireGuard gateway as the source.

## Multiple sites

The remote LAN can use any valid private range—such as `192.168.2.0/24`, `10.40.0.0/16`, or `172.22.5.0/24`—provided that route is unique from the other VPN sites and from networks NyxGuard already uses. The remote site does not need Azure or any particular vendor.

Distinct networks work simultaneously, for example:

| Site | Remote LAN |
| --- | --- |
| Office | `192.168.20.0/24` |
| Warehouse | `192.168.30.0/24` |
| Datacenter | `10.40.0.0/16` |

Overlapping networks cannot be routed safely in the current release. If two sites both advertise `192.168.20.0/24`, Linux has no unambiguous destination-based choice between the tunnels. NyxGuard rejects that configuration instead of risking traffic reaching the wrong site.

Sites with overlapping address space require one of the following before simultaneous use:

- renumber one remote LAN;
- translate one site's LAN to a unique range on its gateway;
- connect only one conflicting site at a time;
- wait for a future design using per-site policy routing or network namespaces/VRFs.

A different public endpoint does not solve an overlapping internal route. The endpoint selects the WireGuard peer; the destination LAN route selects where application traffic travels.

## Connect and test

1. Open **VPN Client** from the main sidebar.
2. Add a VPN site and upload its `.conf` file.
3. If the profile is full-tunnel, enter only the required private CIDRs in **Remote networks**.
4. Select **Connect VPN**.
5. Confirm the interface is up and a recent handshake appears.
6. In **Test this site**, enter an address inside that site's displayed remote networks.
7. Test the actual TCP application port even if ping is blocked by the remote firewall.

The test field deliberately rejects targets outside the selected site's routes. This prevents a diagnostic request from silently using a different tunnel or the host's normal network path.

## Proxy Host upstreams

After the remote application is reachable, configure its private address and port as the Proxy Host upstream. Use the upstream origin only, for example:

```text
http://192.168.20.10:8080
```

Do not add an application path such as `/web` unless that application specifically requires it in the upstream configuration.

The VPN agent shares NyxGuard Manager's network namespace, so nginx uses the installed WireGuard route automatically. No special Proxy Host mode, Docker network, public exposure, or static route inside nginx is required. Scheme, private address, and application port are configured exactly like a local LAN upstream.

## Production installation and update

Fresh installation:

```bash
curl -fsSL https://raw.githubusercontent.com/NyxCloudRO/NyxGuardManager/main/install.sh | sudo bash
```

Upgrade a supported existing standard installation (see the release-specific upgrade guidance):

```bash
curl -fsSL https://raw.githubusercontent.com/NyxCloudRO/NyxGuardManager/main/update.sh \
  | sudo env FORCE_TAG=5.0.4 NYXGUARD_AUTO_YES=1 bash
```

The updater preserves existing data volumes. Manager 5.0.1, 5.0.2 and 5.0.3 use the guarded direct path to 5.0.4. A 4.0.18 installation must first use the verified 5.0.0 major handover; do not force a direct 4.x-to-5.0.4 replacement. Guarded upgrades preserve installed VPN topology. For a Manager-only installation, enable Agent through the explicit repair below after TUN is usable. See the [update guidance](../README.md#update-in-place) before upgrading a customized installation.

### Host TUN prerequisite

The installer uses actual TUN capability, not virtualization vendor, to decide whether to install Agent. It tests read/write access, attempts existing safe guest-side preparation if needed, then tests again. A VM or container with usable TUN follows the normal Agent path. If preparation fails, optional Manager installation may continue with **VPN Agent pending — TUN unavailable**; VPN has not passed readiness.

```bash
test -c /dev/net/tun && (exec 9<>/dev/net/tun)
```

For a confirmed Proxmox LXC, the tested minimal host-side preparation is one device assignment. Verify the target CTID, preserve its current configuration, and use a free device slot:

```bash
pct set <CTID> --dev0 path=/dev/net/tun,mode=0666
```

Keep the LXC unprivileged. Restart only the target guest if needed, then verify actual TUN access inside it and after reboot. This is infrastructure preparation by an authorized administrator; NyxGuard does not obtain hypervisor credentials or change host configuration. For other restricted containers, the host must expose usable TUN; no untested vendor-specific commands are prescribed.

After installing Manager while TUN was unavailable, repair Agent at the same Manager version instead of reinstalling Manager:

```bash
curl -fsSL https://raw.githubusercontent.com/NyxCloudRO/NyxGuardManager/main/update.sh \
  | sudo env FORCE_TAG=5.0.4 NYXGUARD_REPAIR_VPN=1 bash
```

Set `INSTALL_DIR` for a non-default location. The ordinary already-current updater leaves the installation unchanged. Explicit repair installs/recreates the compatible Agent and verifies its API from Manager. Confirm **Settings → VPN Client** availability, configuration persistence, and paired restart/reboot afterward.

## Health and troubleshooting

```bash
docker ps --filter name=nyxguard
docker logs --tail=100 nyxguard-manager
docker logs --tail=100 nyxguard-vpn-agent
docker compose --env-file /opt/nyxguardmanager/.env \
  -f /opt/nyxguardmanager/docker-compose.yml ps
```

Common states:

- **Disconnected**: the profile exists but its interface is down.
- **Waiting**: the interface and routes exist, but no handshake was received in the last three minutes.
- **Connected**: the interface is up and the remote peer completed a handshake within the last three minutes.
- **Ping fails with a handshake**: inspect remote forwarding, routes, NAT, NSGs/firewalls, and whether the target permits ICMP.
- **Target outside remote networks**: use an address contained by the selected site's displayed CIDRs or correct that site's profile.
- **Agent unavailable**: confirm usable `/dev/net/tun`, run the explicit same-version repair above, and inspect `nyxguard-vpn-agent` logs. On LXC, configure TUN passthrough on the hypervisor first.

Never include client private keys in screenshots, logs, support tickets, exported diagnostics, or public repositories.

## Supported host systems

See the current [supported operating systems](../README.md#requirements), including Ubuntu 26.04 LTS (tested on 26.04.1). VPN requires the host to expose TUN; a restricted LXC guest without that device remains Manager-only.

For a manual restart, restart Manager and then its VPN Agent as a pair. The Agent must join the current Manager network namespace. Check availability through **Settings → VPN Client**, in addition to individual container health.
