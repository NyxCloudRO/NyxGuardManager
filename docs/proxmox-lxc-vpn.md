# Proxmox LXC: TUN prerequisites and historical 5.0.9 repair

The TUN prerequisite instructions below remain applicable. The release-pinned repair in section 9 is historical 5.0.9 guidance. Current 5.0.10 Agent activation is documented in [the VPN guide](vpn-client.md#host-tun-prerequisite); ordinary updates use the canonical command in the README.

NyxGuard Manager and its database can run without `/dev/net/tun`. The separate VPN Agent needs usable read/write access to this kernel device to provide VPN support. A missing Agent after a Manager-only installation does not mean your database needs reinstalling.

The Proxmox steps require administrator/root access to the **Proxmox host that runs your selected LXC**. NyxGuard does not configure the Proxmox host automatically. Keep the container unprivileged; do not change bridges, networking, firewalls, routing or other containers to follow this guide.

Commands below use **Bash as root**. Proxmox host and LXC guest are different shells. Replace `<CTID>` with the ID you verify; never paste the placeholder as a command. Keep the same host shell open through steps 2–7 so its `CTID` variable remains available.

### 1. Identify the Proxmox node and container

**Run on the Proxmox host**, not inside NyxGuard:

```bash
hostname
pveversion
pct list
pct help set
```

`pct list` shows container IDs, status and names. Find the intended NyxGuard LXC, then verify it in the next step. Names alone are not sufficient. Confirm `pct help set` includes `--dev[n]` with `path` and `mode`; this guide uses that supported device-passthrough method, verified on Proxmox VE 9.2. If your version lacks it, stop and consult your administrator/version documentation instead of adding broad legacy permissions.

### 2. Verify the selected LXC's identity and IP

**Proxmox host:** enter the ID from your own `pct list` output:

```bash
read -rp 'Verified target CTID: ' CTID
[[ "$CTID" =~ ^[1-9][0-9]*$ ]] || { echo 'Invalid CTID'; return 1 2>/dev/null || exit 1; }
pct status "$CTID"
pct config "$CTID"
pct exec "$CTID" -- hostname
pct exec "$CTID" -- ip -brief address
```

Compare the hostname and actual IP with the NyxGuard instance you intend to change. DHCP configuration may not show its current IP in `pct config`; `pct exec` reads the running guest. If it is stopped or the identity does not match, stop and resolve that with your administrator. Do not select another ID by guesswork.

### 3. Verify TUN on the Proxmox host

**Proxmox host:**

```bash
ls -l /dev/net/tun
test -c /dev/net/tun && (exec 9<>/dev/net/tun) && echo 'Host TUN opens read/write'
```

Expected: a character device, normally major/minor `10, 200`, followed by `Host TUN opens read/write`. If it is missing or access fails, stop: the Proxmox administrator must resolve the host prerequisite. A device listing alone does not prove usability.

### 4. Inspect configuration and select a free device slot

**Proxmox host:**

```bash
pct config "$CTID"
pct pending "$CTID"
```

Look for `dev0:`, `dev1:` and other `devN:` entries, including pending changes. If `/dev/net/tun` is already assigned, do not add it again: go to step 7 and verify guest access first. Otherwise choose an unused slot. `dev0` is only an example; use `dev1` or another supported free slot when it is occupied. Never replace an existing device entry. Coordinate with other administrators so the configuration does not change during this operation.

### 5. Back up only this container's configuration

**Proxmox host:**

```bash
install -d -m 700 /root/lxc-config-backups
BACKUP="/root/lxc-config-backups/${CTID}-$(date +%Y%m%d-%H%M%S).conf"
cp -p -- "/etc/pve/lxc/${CTID}.conf" "$BACKUP"
chmod 600 "$BACKUP"
ls -l "$BACKUP"
```

Expected: a nonempty configuration backup for the selected ID. This is a configuration backup, not a replacement for your normal LXC/application-data backup. Retain it privately.

### 6. Pass through TUN using the free slot

**Proxmox host:** type the unused slot you verified in step 4:

```bash
read -rp 'Verified unused slot (for example dev0 or dev1): ' DEV_SLOT
[[ "$DEV_SLOT" =~ ^dev[0-9]+$ ]] || { echo 'Invalid slot'; return 1 2>/dev/null || exit 1; }
CONFIG="$(pct config "$CTID")" || { return 1 2>/dev/null || exit 1; }
if printf '%s\n' "$CONFIG" | grep -q "^${DEV_SLOT}:"; then
  echo 'STOP: slot is occupied; do not overwrite it'
else
  pct set "$CTID" "--${DEV_SLOT}" path=/dev/net/tun,mode=0666
fi
pct config "$CTID"
```

This executes `pct set <CTID> --devN path=/dev/net/tun,mode=0666` for one selected container. Expected: that slot now contains `path=/dev/net/tun,mode=0666`. The mode allows guest processes to open this specific device; it does not make the LXC privileged or grant access to all host devices. If Proxmox rejects the operation, stop and retain the exact error. Do not substitute global device permissions.

### 7. Verify guest access; restart only if needed

**Proxmox host:** test inside the selected guest:

```bash
pct exec "$CTID" -- bash -c 'test -c /dev/net/tun && (exec 9<>/dev/net/tun) && echo "Guest TUN opens read/write"'
```

Expected: `Guest TUN opens read/write`. Supported Proxmox versions can apply device passthrough to a running LXC; if this succeeds and no relevant change is pending, no restart is needed.

If access is still unavailable or the change is pending, arrange downtime for **this LXC only**. Use a graceful shutdown/start on the **Proxmox host**:

```bash
pct shutdown "$CTID" --timeout 60
if [[ "$(pct status "$CTID")" == 'status: stopped' ]]; then
  pct start "$CTID"
else
  echo 'STOP: container did not stop; ask the administrator'
fi
```

After it starts, repeat the guest-access test above. Do not force-stop it, restart the Proxmox host or restart other containers. If access still fails, stop and ask the administrator to inspect the selected configuration and device permissions.

### 8. Verify TUN from the NyxGuard guest shell

Open the verified LXC's console/SSH session. **Run inside the LXC guest as root**, not on Proxmox:

```bash
hostname
ip -brief address
ls -l /dev/net/tun
test -c /dev/net/tun && (exec 9<>/dev/net/tun) && echo 'Guest TUN opens read/write'
```

Check identity again. This proves the device is present and can be opened; it does **not** prove that VPN Agent is healthy or that a WireGuard peer can carry traffic.

### 9. Repair the missing Agent with the public 5.0.9 updater

First retain your normal database, volumes, Compose configuration, `.env` and licensing-vault backup. **LXC guest, as root:** for an existing 5.0.9 installation at the default path:

```bash
INSTALL_DIR=/opt/nyxguardmanager
[ "$(docker exec nyxguard-manager node -p "require('/app/package.json').version")" = 5.0.9 ]
test -f "$INSTALL_DIR/docker-compose.yml" && test -f "$INSTALL_DIR/.env"
```

Read the actual application version using `docker exec nyxguard-manager node -p "require('/app/package.json').version"`; `.version` may be historical. For a custom installation, set `INSTALL_DIR` to its actual directory. Stop if the installation files are missing; this is a same-version repair guide, not a fresh install or downgrade.

Download the updater and checksums from the immutable published release, verify it, then run the explicit repair:

```bash
set -euo pipefail
REPAIR_DIR="$(mktemp -d)"
chmod 700 "$REPAIR_DIR"
curl -fLsS https://github.com/NyxCloudRO/NyxGuardManager/releases/download/v5.0.9/update.sh -o "$REPAIR_DIR/update.sh" &&
curl -fLsS https://github.com/NyxCloudRO/NyxGuardManager/releases/download/v5.0.9/SHA256SUMS -o "$REPAIR_DIR/SHA256SUMS" &&
(cd "$REPAIR_DIR" && grep -E '^[0-9a-f]{64}  update\.sh$' SHA256SUMS | sha256sum -c -) &&
env INSTALL_DIR="$INSTALL_DIR" FORCE_TAG=5.0.9 NYXGUARD_REPAIR_VPN=1 bash "$REPAIR_DIR/update.sh"
```

Expected: checksum `update.sh: OK`, then `VPN agent stack is installed and running.` A checksum/download failure prevents repair. Keep the command output for diagnosis; do not post credentials, `.env` files or private WireGuard profiles publicly.

The official repair path reuses the existing Compose service, starts only the Agent with `--no-deps`, and persists all enabled services in systemd. Manager/DB containers and VPN keys remain intact; a healthy repeated repair retains the Agent too. An ordinary already-current update without `NYXGUARD_REPAIR_VPN=1` does not perform repair. Manager 5.0.9 uses compatible VPN Agent **5.0.1**; the Agent version need not match Manager. Run the command as root, or prefix `env` with `sudo` as an ordinary sudo user.

### 10. Check health and test an actual VPN

**LXC guest:**

```bash
docker ps --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}'
docker inspect --format '{{.Name}} {{.State.Status}} {{if .State.Health}}{{.State.Health.Status}}{{end}}' nyxguard-manager nyxguard-db nyxguard-vpn-agent
systemctl is-active nyxguardmanager.service
```

Expected: Manager and VPN Agent are `running healthy` after startup probes complete, database is `running`, and the service is `active`. The database may have no Docker health-check label.

Sign in normally and open **Settings → VPN Client**. Agent should be available. Import a valid WireGuard client profile from your VPN administrator, connect, check for a recent handshake, and test a permitted private destination using the connectivity check. Then disconnect/reconnect. During planned downtime, verify recovery after a paired Manager/Agent restart and a guest reboot using the supported stack. TUN presence, green containers or a handshake alone do not prove private-network connectivity. A failed destination test may need peer/profile/return-path diagnosis; do not change Proxmox networking as a shortcut.

### 11. Troubleshooting without broad changes

- **`dev0` occupied:** preserve it. Inspect every existing/pending `devN` entry and choose a supported unused slot. If TUN is already assigned, verify it instead of adding another entry.
- **TUN missing on the host:** stop and ask the Proxmox administrator to resolve host kernel/device availability.
- **TUN present but cannot open in the guest:** check the selected CTID, configured path/mode and pending state. Perform only the selected LXC's planned shutdown/start if required. Do not convert it to privileged or allow all devices.
- **Agent still missing:** verify the guest TUN open test, version and actual `INSTALL_DIR`. Confirm the updater checksum and explicit repair flag. Preserve the first failing command and its exact error; do not reinstall Manager or delete volumes.
- **Agent exists but is unhealthy:** inspect `docker logs --tail 100 nyxguard-vpn-agent` locally and the updater output. Ask support with a redacted error, version and relevant device entry. Never share private keys or credentials.
- **Agent healthy but VPN traffic fails:** use the [VPN Client guide](vpn-client.md) to check the profile, allowed networks and remote peer with the VPN administrator. Do not treat a prerequisite check as a working-VPN result.

References: [Official Proxmox command/device reference](https://github.com/proxmox/pve-docs/blob/master/generated/pct.1-synopsis.adoc), [NyxGuard 5.0.9 release](https://github.com/NyxCloudRO/NyxGuardManager/releases/tag/v5.0.9), [website VPN Client guide](https://nyxcloud.ro/nyxguard/vpn-client.html#proxmox-lxc).
