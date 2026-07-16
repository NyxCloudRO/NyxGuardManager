# NyxGuard VPN Client networking guide

NyxGuard Manager 4.0.14 can connect to multiple remote sites as a WireGuard client. Each site has its own interface, routes, status, lifecycle controls, and connectivity test. Remote applications remain private and can be used as NyxGuard Proxy Host upstreams after the tunnel is working.

## Architecture and security boundary

The production stack uses two matching images:

- `nyxmael/nyxguardmanager:4.0.14` runs the web application without network-administration privileges.
- `nyxmael/nyxguardmanager-vpn-agent:4.0.14` owns WireGuard operations and receives only `NET_ADMIN` plus `/dev/net/tun`.

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

Upgrade or repair an existing standard installation:

```bash
curl -fsSL https://raw.githubusercontent.com/NyxCloudRO/NyxGuardManager/main/update.sh \
  | sudo env FORCE_TAG=4.0.14 NYXGUARD_AUTO_YES=1 bash
```

The updater preserves existing data volumes, pulls both matching images, adds the VPN Compose overlay, and makes the additional service persistent across reboot when `/dev/net/tun` is available. If TUN is absent, it deliberately keeps the manager running without the VPN sidecar and prints remediation instructions.

### Host TUN prerequisite

Check the NyxGuard host before expecting the VPN agent to start:

```bash
test -c /dev/net/tun && echo "TUN ready" || echo "TUN missing"
```

On a normal VM or bare-metal Linux host, load it with `sudo modprobe tun`; the installer/updater also attempts this automatically. For Proxmox LXC, run `modprobe tun` on the **Proxmox host**, add the following to `/etc/pve/lxc/<CTID>.conf`, and restart the container:

```text
lxc.cgroup2.devices.allow: c 10:200 rwm
lxc.mount.entry: /dev/net/tun dev/net/tun none bind,create=file
```

An LXC guest cannot safely manufacture this device itself: both kernel support and the cgroup device permission belong to its host. After the device appears inside the guest, rerun `update.sh`; a same-version 4.0.14 repair enables the agent.

## Health and troubleshooting

```bash
docker ps --filter name=nyxguard
docker logs --tail=100 nyxguard-manager
docker logs --tail=100 nyxguard-vpn-agent
docker compose --env-file /opt/nyxguardmanager/.env \
  -f /opt/nyxguardmanager/docker-compose.yml \
  -f /opt/nyxguardmanager/docker-compose.vpn.yml ps
```

Common states:

- **Disconnected**: the profile exists but its interface is down.
- **Waiting**: the interface and routes exist, but no recent handshake was received.
- **Connected**: the interface is up and the remote peer completed a recent handshake.
- **Ping fails with a handshake**: inspect remote forwarding, routes, NAT, NSGs/firewalls, and whether the target permits ICMP.
- **Target outside remote networks**: use an address contained by the selected site's displayed CIDRs or correct that site's profile.
- **Agent unavailable**: confirm `/dev/net/tun`, rerun the general updater, and inspect `nyxguard-vpn-agent` logs. On LXC, configure TUN passthrough on the hypervisor first.

Never include client private keys in screenshots, logs, support tickets, exported diagnostics, or public repositories.
