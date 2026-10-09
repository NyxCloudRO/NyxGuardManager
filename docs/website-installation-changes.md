# Required website instruction changes (website not modified)

At the official NyxGuard installation page, replace the single `curl ... | sudo bash` instruction with the two root/sudo command blocks in README.md under Installation. Root on minimal Debian must run `bash` directly; non-root users need installed sudo and administrator privileges. Download successfully before executing.

For Update, show README.md root and sudo updater commands. For VPN pending, use the current-version `NYXGUARD_REPAIR_VPN=1` download/execute command without forcing an application upgrade. State that repair tests actual TUN creation, starts only the Agent and updates systemd. Keep the Proxmox host TUN assignment as administrator guidance; do not imply the guest installer can grant it.

Show Manager 5.0.7 / VPN Agent 5.0.1 after publication. Link the immutable v5.0.7 release, checksums and docs/upgrade-5.0.7.md. Do not alter historical release links or claims.
