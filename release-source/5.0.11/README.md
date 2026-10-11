# NyxGuard Manager 5.0.11 release source

Current stable Manager release: **5.0.11**, database schema **46**, compatible VPN Agent **5.0.1**.

The release reuses the qualified image built from application source revision `463c5d331c8129871d0a2727bc4b17366e90fda0`. Publication documentation is committed separately; application build inputs and the qualified host updater are unchanged.

The pinned public 5.0.10 filesystem is sanitized before building fresh layers. Certbot seed/recovery, certificate confidentiality, Access List enforcement and additive operational diagnostics are integrated. The self-contained host updater verifies cold backups, preserved durable state and readiness, including bounded progress and recovery diagnostics.

Build locally with `python3 build-release.py --revision <reviewed-application-source-commit>`. See [release notes](RELEASE-NOTES.md) and [qualification scope](../../docs/validation-5.0.11.md). Historical bases and release tags remain immutable.
