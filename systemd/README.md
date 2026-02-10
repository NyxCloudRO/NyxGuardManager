# NyxGuard Manager v3.0.2

This folder contains an optional `systemd` unit to start the Docker Compose stack on boot.

## Install

```bash
sudo install -m 0644 systemd/nyxguardmanager.service /etc/systemd/system/nyxguardmanager.service
sudo systemctl daemon-reload
sudo systemctl enable --now nyxguardmanager.service
```

By default, the service expects the stack in `/opt/nyxguardmanager` (as installed by `install.sh`).

<!-- stamp 2026-02-10T22:03:52Z -->
