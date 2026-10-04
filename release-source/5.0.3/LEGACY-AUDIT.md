# Current product boundary and legacy dependency audit

Redirection Hosts, 404 Hosts and Streams were inherited from the published
5.0.2 image. They had lazy page registrations and old nginx aliases despite
being absent from the current navigation. They are removed from the 5.0.3
materialized application, without changing historical releases or database data.

| Classification | Finding | Decision |
| --- | --- | --- |
| A: unused surfaces | `index-BwmR1P0q.js`, `index-CAsSRkcc.js`, `index-DQuC1pRs.js`; `/nyxguard/redirection`, `/nyxguard/404`, `/nyxguard/stream` and corresponding `/nginx/` aliases | Remove pages, registrations and aliases; existing wildcard not-found handles obsolete URLs |
| A: dedicated frontend code | Six permission/editor exports, three dialog factories, exclusive query/mutation hooks and API clients in the active main bundle | Remove only dependency closures with no surviving import or binding consumer |
| A: inactive generated boot bundles | `index-CTHAIRmi.js`, `index-CTHAIRmi-408dev.js`, `index-CTHAIRmi-409dev.js`, `index-CTHAIRmi-409dev-4012certfix4.js` | Remove after verifying no current HTML/module consumer |
| A: controllers | `routes/nginx/redirection_hosts.js`, `dead_hosts.js`, `streams.js` and their imports/mounts in `routes/main.js` | Remove; existing API not-found handles old endpoints |
| A: dedicated API schemas | `schema/paths/nginx/{redirection-hosts,dead-hosts,streams}` and their Swagger path registrations | Remove endpoint descriptions; retain shared component/data schemas |
| B: shared services | `internal/certificate.js` disables/re-enables associated hosts during certificate operations; `internal/host.js` checks hostname collisions across historical host types; `internal/report.js` counts existing records | Retain these services and `internal/redirection-host.js`, `dead-host.js`, `stream.js` |
| B/C: configuration | Generic nginx generation and redirection/dead/stream/certificate templates can service existing stored configuration | Retain unchanged |
| C: persisted data | Models, certificate graph relations, permission columns, schema definitions, historical migrations and audit object types | Retain; no schema cleanup, forward migration or data deletion |
| C: shipped sources | Earlier release-source patches and baseline fixtures describe immutable published prerequisites | Retain; do not rewrite shipped history |
| B: unrelated stream references | Log scanners, Node/HTTP streams and Event Center activity streams | Retain; these are active features, not the obsolete Streams page |
| B: shared CSS/components | Layout, certificate/domain/value formatters, icons, modal primitives and common selectors have active consumers | Retain; remove a selector only if its exclusive class binding has no surviving consumer |

`prune-legacy.mjs` performs removal during the reproducible image build. It uses
pinned, integrity-checked Acorn/PostCSS archives, runs no lifecycle scripts and
removes build tools from the runtime image. It fails closed on unexpected route,
import, binding or filename consumers. `nyxguard-legacy-removal.json` records the
actual removed files, routes, exports and bindings inside the built image.

Removal is limited to unused product surfaces while retaining shared/data dependencies. No table/column or historical migration
is removed. Runtime nginx, certificates, Proxy Hosts, Applications and Access
Lists retain their existing shared services and data semantics.
