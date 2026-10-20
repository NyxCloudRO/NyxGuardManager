# Task 6 — native Settings Interface (DEV)

Guarded frontend-only layer on the accepted Task 5 image. Production and publication
are excluded. Build from release-source/5.0.14 using task6/Dockerfile.

The native Settings card, header, grid, sections, headings, fields, navigation styles,
keyboard handler and Task 5 page shell are reused. Interface follows VPN Client.
Exactly two compact native Settings sections host the existing floating selector,
React theme provider, theme registry, locale helper and unsaved-language draft guard.
New translations add two keys in all six existing catalogs; accepted keys remain.

The accordion, its event handlers, twenty class mappings and exclusively obsolete
CSS selectors are removed. The remaining license/support/community actions keep
their renderer, links, authorization and styles, mounted in a plain sidebar action
slot. The user profile/account menu and sidebar dimensions are unchanged.

Settings tab selection uses the existing router and `?tab=interface`; native VPN tab
activation is synchronized with it. The other six native tab subtrees are retained.
VPN behavior and API operations remain unchanged. Browser back/forward and refresh
retain the selected panel.

A restricted account can enter the same Settings shell but renders only Interface.
Administrative route capabilities are not broadened: the outer route presentation
and Settings sidebar link admit personal access, while the Settings component and
unchanged backend authorization preserve administrative boundaries. Update, license
and support gates continue using the accepted capability checks.

Themes already use `app_theme:user:<id>`. Language previously used one browser-wide
`locale` key, so it had no cross-account isolation. The existing locale read/write
path now scopes saved values as `locale:user:<id>`, seeded from the current legacy
value without defaults/reset. `locale` remains the compatibility mirror for accepted
imperative code. No server API, database preference store, schema migration, theme
engine or localization engine is introduced. Persistence remains browser-local,
with the same storage lifetime as the accepted mechanism; it does not sync devices.
Language selection retains the native immediate browser reload and draft guard;
theme switching remains immediate through the existing React provider.

The patch checks all accepted Task 5 input asset hashes and source identity, parses
JavaScript and renames the complete asset graph for coherent cache invalidation.
Existing Task 1–5 source packages and their manifest identities are retained.
Private authenticated DEV evidence and acceptance report belong in
`[private operator evidence excluded from distribution]`.
