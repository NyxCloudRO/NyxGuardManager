# Automatic startup

The optional [systemd unit](nyxguardmanager.service) starts the Docker Compose stack on boot. See the [project overview](../README.md). The installer manages startup automatically.

For a manual deployment in `/opt/nyxguardmanager`, run as root:

```bash
install -m 0644 systemd/nyxguardmanager.service /etc/systemd/system/nyxguardmanager.service
systemctl daemon-reload
systemctl enable --now nyxguardmanager.service
```

Ordinary users with sudo privileges prefix each command with `sudo`. Review the unit before installing: enable the Agent only when TUN is usable and the VPN Compose service is configured. Manager-only deployments must start just Manager and database.
