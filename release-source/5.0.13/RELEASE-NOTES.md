# NyxGuard Manager 5.0.13

Manager 5.0.13 consolidates management UI presentation and ships with VPN Agent 5.0.2. Database schema remains 46.

- Stable five-step Proxy Host wizard, compact shared toolbars, viewport-aware action menus, compact protection switches and traffic-rule actions.
- Shared accessible in-app confirmations and compact management dialogs, preserving original forms, validations and permission checks.
- Update notifications appear only for freshly verified, compatible newer stable images; manual Update Manager remains available in Settings.
- Theme-aware notification channel selection, single-write saves, Slack configuration compatibility, preserved masked email credentials, and removal of raw credential-bearing configuration JSON from responses.
- Correct effective Auth Bypass override presentation and immediate reconciliation after failed mutation responses.
- Ordered Access List client persistence and literal handling of passwords beginning with a dash.
- Full-tunnel WireGuard profile imports without mandatory subnet overrides, preserved local/control response routes, explicit manual-table semantics, and upload draft retention.

Normal updates retain existing MariaDB, licensing vault, profiles and storage. The release policy selects Agent 5.0.2. No production installation is automatically upgraded by publication.

See [validation coverage](../../docs/validation-5.0.13.md) for executed scenarios and qualified limitations. Live public ACME issuance is not a UI acceptance test. Imported custom certificates retain the baseline limitation that renewal and archive download are supported for Let's Encrypt certificates; no custom renewal/download success is claimed.
