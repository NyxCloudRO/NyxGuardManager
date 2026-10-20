# NyxGuard Manager v5.0.14 — Release Highlights

NyxGuard Manager 5.0.14 brings the development cycle's access controls, interface refinements and monitoring corrections together. Administrators gain a dedicated read-only NyxAgent experience, clearer policy navigation, more reliable traffic collection and alerts, and a portable monitoring setup. The release retains the six supported languages, twelve themes, existing licensing model and independently versioned VPN Agent.

### Identity, Access & Agent Experience

- NyxAgent provides native read-only monitoring with server-enforced access boundaries. Delegated Manage, View Only and Hidden permissions continue to determine available operations; monitoring responses redact secrets.
- Identity & Access organizes Access Policies, TLS & Certificates, and Accounts & Roles in the existing application interface. Each tab remains independently authorized, including direct navigation.
- Owned profile operations remain available within their existing permissions. Action menus expose permitted record operations, and existing access-policy ordering and certificate workflows remain intact.
- Proxy Hosts gain search and structured inventory filters, making larger configurations easier to navigate.

### Internationalization & Personalization

- English, Spanish, French, German, Italian and Romanian catalogs cover the accepted interface additions.
- Settings → Interface brings language and theme controls into the native Settings workspace. All twelve themes remain available.
- Language and theme preferences use the existing browser providers and are scoped per user. Existing valid preferences are retained, with legacy language preferences seeded on first use. This does not introduce account synchronization across browsers.

### Traffic Security & Visibility

- Blocked Requests retains observations of actual enforcement with bounded collection, reason attribution and permission-controlled history operations.
- Custom WAF rule blocks and Access Portal signature/scope rejections produce dedicated monitoring signals. Ordinary upstream HTTP errors, expired sessions, failed passwords and valid portal bypass do not count as those specific security events.
- Portal sessions without an explicitly configured signing secret use an installation-specific key. Sessions signed with the former shared fallback must authenticate again; configured private secrets remain supported.

### Dashboard & Observability

- All six Dashboard ranges calculate traffic summaries from retained request records, avoiding the previous switch between recent logs and incomplete long-range collector buckets. RX measures request length; TX measures bytes sent. Retention still limits available history.
- Event Center uses occurrence timestamps for discrete administrative actions and preserves first/latest timestamps for recurring records. Missing timestamps are not fabricated, and existing history remains intact.
- The collector handles missing upstream statuses, partial lines, rotations, bounded backlogs and interruptions. Schema 49 makes traffic counter/cursor updates transactional by converting the two traffic tables to InnoDB.
- Prometheus corrections cover inventory, active bans, certificate expiry, country enforcement, automatic bans and application traffic. Rolling values remain gauges, with compatible legacy names and preferred gauge aliases.
- The portable Grafana dashboard retains its identity and 58 panel IDs. Authenticated integration, an optional private mTLS adapter and provisioning resources support deployment outside the Manager host. Unavailable sources remain distinguishable from measured zeroes.

### Notifications & Integrations

- Notification event selections persist correctly, including empty selections. Delivery follows saved subscriptions rather than sending every event to every channel.
- Discord, Slack and email messages use readable event descriptions and context. Manual connectivity tests are clearly labeled.
- Retry bookkeeping, permission checks and existing secret-handling boundaries are retained.

### User Interface & Administration

- Compact action controls, native confirmation dialogs and theme-aware menus improve consistency across management pages.
- Native Settings and administration layouts retain their forms, tables and existing workflows. Scrolling and footer clearance were refined without replacing the application shell.
- Sidebar preferences are consolidated into Settings → Interface; account/profile, support and licensing navigation remain available within existing permissions.

### Installation, Upgrade & Reliability

- The host workflow preserves the existing database image and persistent storage. When needed, it configures InnoDB automatically before migration 49; ordinary supported upgrades require no manual SQL repair.
- The CLI retains staged progress, verified cold backups, migration status, service health checks and actionable recovery output. Recovery metadata records controlled database recreation prerequisites.
- The frozen linux/amd64 image passed clean installation and a separately seeded 5.0.13 upgrade with an administrative account, schema 49 and healthy VPN reattachment. All 66 original fixture rows were unchanged. Earlier restoration and interrupted-update evidence is retained only for unchanged updater paths. Functional acceptance does not establish security clearance.

### Security Hardening

- The tested application image incorporates locked dependency updates, MySQL JSON compatibility, upstream SQLite 3.54.1 and the verified Nginx map/regex bounds, TLS-upstream state and rewrite-escaping backports while retaining OpenResty integration.
- This release also integrates the security-only OpenResty advisory backports, three compatible glibc corrections and fourteen curl advisory backports while retaining the original protocols, TLS backends and public ABI. Focused testing corrected legacy HTTP/2 pushed-stream buffer and timer initialization; both curl backends pass push/share lifetime checks. The prepared PBDS heap and Python streaming-tar EOF fixes are included. The aligned-allocation overflow in the GCC 12 C++ runtime is source-corrected, preserving all 5,981 exported symbols and versions; boundary allocation, normal allocation, threads and exception regressions pass. Cache semantics 4.3.0 retains private/no-store/Vary behavior; the disputed advisory is not declared fixed merely by its version.
- Additional compatible runtime corrections reject oversized Expat buffers, retain a 128-bit XML hash salt in Expat and Python’s built-in XML consumers, correct ASN.1 long-name bounds and LDAP allocation-failure handling, preserve DTLS writes during retransmission timers, and reset gzip’s shared decompressor state. Legacy APIs, library SONAMEs, protocols and the Python built-in module set are preserved. ACL 2.4 retains the existing ABI; corrected cp/mv and tar callers bind ACL operations to file identities, preserving ordinary symlink, archive and restoration behavior while rejecting changed restoration targets.
- Exact-image security and privacy checks reconcile retained scanner observations with source corrections and supported component/configuration boundaries. Scanner warnings are not represented as distinct exploitable defects, and no zero-warning or universal security claim is made.

### Compatibility & Upgrade Notes

- Manager: **5.0.14**. Database: **schema 49**. Compatible VPN Agent: **5.0.2**, independently versioned.
- Intended immediate upgrade path: **5.0.13 → 5.0.14** through the reviewed host updater. Preserve the matching verified database/volume recovery set before upgrading.
- Migration 49 converts `nyxguard_traffic_stat` and `nyxguard_traffic_state`; other Aria tables keep their engines. Schema rollback requires the matching pre-upgrade recovery set; an image-only downgrade is insufficient.
- Only **linux/amd64** is qualified for this release. No multi-platform support is asserted.

### Known Limitations

- Traffic totals cover retained records; missing historical logs cannot be reconstructed. Dashboard changes do not repair old incomplete database rollups.
- Legacy Prometheus gauge names remain for compatibility and can produce suffix-lint warnings. External monitoring requires configuration and authentication.
- Real external ACME issuance/renewal was not repeated in this qualification. Existing local TLS and Certbot compatibility evidence has a narrower scope.
- Build reproduction requires documented local base images and pinned vendor inputs. The history-free source archive alone is not a standalone application rebuild kit.
