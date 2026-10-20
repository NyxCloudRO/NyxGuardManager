# NyxGuard Manager 5.0.14 — Task 3 DEV candidate

Layers after the accepted Task 2 candidate. The patch verifies its localization source digest and every accepted asset checksum before applying bounded AST and prerequisite-checked changes. Task 1 and Task 2 source, backend APIs, schema, authorization and persistent configuration are unchanged.

```sh
docker build -f release-source/5.0.14/task3/Dockerfile \
  -t nyxguardmanager:5.0.14-task3-candidate release-source/5.0.14
```

Identity & Access uses the existing AppPage shell and native dashboard frame, the original lazy list modules, independently authorized tabs and original forms and management actions. `/identity` chooses the first accessible child; `/access`, `/certificates` and `/users` remain compatible direct URLs. Hidden tabs never mount list queries. The established sidebar SVG registry supplies the icon. Proxy Hosts remains independent.

`identity.css` scopes the native page/content refinements and provides one navigation style for explicitly marked Identity and Settings tab bars. Settings retains its six native tab owners and existing imperative VPN extension. Both bars share active/hover/focus behavior and the same Arrow/Home/End keyboard handler. Settings header/navigation/intro spacing uses stable metadata, independent of translated labels. No Interface tab is added.

`inventory.mjs` filters authorized, complete inventories without mutations or additional API requests. Proxy search covers application names, domains, upstream hostname/IP, port, scheme and configured location destinations. Structured filters combine scheme, certificate assignment, access policy and enabled state. No remote availability or unsupported proxy type is invented. Policies filter authorization/rules/satisfy/host assignment; certificates filter provider/expiry/assignment; accounts filter role/status. Counts precede rendering. Reset clears controlled state. Static authorization/rule and certificate-provider subtotals follow the visible records; duplicate totals are omitted.

`messages.json` supplies all new messages in English, Spanish, French, German, Italian and Romanian through the existing React Intl catalogs. ICU validation, JavaScript syntax checking, asset-graph-versioned references and a source/asset manifest are mandatory build steps. The accepted Task 2 patch remains independently reproducible.

Native policy rows retain their original submission and ordering behavior with compact grid alignment. Existing certificate, account, permission, password and avatar forms retain validation, capabilities, focus/scroll ownership and portal-based menus. Selector label associations are repaired in the original policy/certificate selectors.

Run source checks with Node 22 and the application's Express dependency available:

```sh
node --test task1/tests/*.test.mjs task2/tests/*.test.mjs task3/tests/*.test.mjs
```

The private Task 3 report and authenticated DEV evidence are outside this source tree. Build success alone is not acceptance. Production, public images/releases, licensing infrastructure and the final pre-publication security audit are outside scope.

The final addendum removes contextual Help controls from the identity inventories and Proxy Hosts. `remove-help.mjs` deletes the JSX controls across modern and legacy variants and prunes unused imports. Exclusive Help-button styles are removed. Shared Help rendering, other consumers, translations and documentation remain intact.

The final forms addendum removes fixed Access Policy and Proxy wizard content/form heights from their original stylesheet rules. `modal-sizing.js` measures the native panes without cloning forms or touching active controls, reserves the largest natural workspace, and clamps it to the actual viewport allowance. A workspace may grow for genuinely long dynamic content; short steps retain the stable frame without inheriting another step’s scrollbar. `modal-layout.css` gives one configuration region scroll ownership, with navigation and footer outside it. Other native dialogs retain their natural content sizing. No form values, progress, validation, data or APIs are changed.

The inherited Premium Nyx button sweep is disabled only in the affected management areas and dialogs. The certificate menu keeps a static inline caret, without the conflicting animated pseudo-element background.

All JavaScript/CSS filenames share a digest of the complete pre-rewrite asset graph. A changed import target therefore invalidates its consumers too, avoiding stale cached modules that refer to a previous candidate. The manifest independently records every final asset checksum.

Native inventory tables keep automatic column sizing. Account identity columns retain readable minimums while email and role badges can wrap. Status labels remain intact. The duplicated legacy certificate width/nowrap guards are removed at their original definitions, allowing date/time cells to wrap at whitespace; prose uses word boundaries and long identity badges can wrap within the available column. The original responsive Proxy table keeps legitimate narrow-screen scrolling and its portal menus.

The inherited certificate Details clone queried and rendered an audit record. The Task 3 patch corrects this action to the existing authorized certificate query and a native read-only label/value view of name, provider, domains and expiry. Metadata and private key material are never rendered. Task 1 source and backend permissions remain unchanged.

The legacy-controls addendum keeps the existing React Select engines for domains, DNS providers, access policies and certificates. A scoped adapter reuses native callbacks/options, stable input labels and theme tokens; its menu portal stays inside the accessible modal and chooses available space between the native header/navigation and footer. Native fields, uploads, switches, hints and warnings share the established control sizing, radius and focus treatment. Certificate helper cards retain their layout without duplicated decorative surfaces. Selection, Formik values, validation and API operations remain native.
