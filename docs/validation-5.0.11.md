# 5.0.11 validation coverage

The qualified application source revision is `463c5d331c8129871d0a2727bc4b17366e90fda0`; the retained linux/amd64 image identity is `sha256:b3d885582c64a8ac216c1ace04c7bf8ed2c79fdeea77270ac0895916a0f5bdc5`. Registry manifest digests are separate publication receipts.

Controlled qualification covered fresh empty-volume startup, setup/authentication, schema 46, retained-volume recreation, Certbot 5.3.1 and Cloudflare plugin/dependency checks. Representative 5.0.0 large-history and 5.0.10 upgrades, verified rollback, SIGTERM recovery, backup-preparation failure, insufficient-space refusal and already-current behavior passed. Earlier unchanged matrices were retained; final certificate/API/TLS checks and image recreation were differential checks.

Access List enforcement and failure reporting, certificate JSON confidentiality with stored-key/TLS preservation, proxy routing/WebSockets/HTTP2, traffic-rule/WAF mutations, restricted authorization, operational error persistence, bounded grouping and sanitized Support Bundles were exercised. Diagnostics browser workflows passed at 1366×768 and 1920×1080; final JS/CSS matched those qualified assets. Controlled WireGuard handshake, ping and restart/recreation connectivity passed with the existing Agent 5.0.1.

Supported OS families and historical results remain in [installation compatibility](installation.md). This release does not claim a fresh-host test across that matrix, validated minimum hardware, comprehensive security efficacy, every UI flow or live reputation-feed accuracy. Database-down diagnostics do not guarantee durable persistence.

## Known limitations

Live Let's Encrypt HTTP-01 and Cloudflare DNS-01 issuance, live licensing activation/recovery and activated entitlement preservation remain unvalidated. Host reboot and power-loss recovery are not fully validated for 5.0.11. OpenVPN connectivity was not tested. The original legacy production startup stall remains unexplained. Mocked failures do not establish live external-service success.

Private qualification logs, browser profiles, credentials, Support Bundles and production-derived datasets are excluded from public artifacts. The user will perform live acceptance on a new clean Proxmox VM.
