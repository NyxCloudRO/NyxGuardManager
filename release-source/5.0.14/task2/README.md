# NyxGuard Manager 5.0.14 — localization candidate

This extends the accepted Task 1 frontend. The existing React Intl instance remains the only message formatter. The six exposed language options and twelve theme identifiers are preserved. Legacy imperative panels and legacy dialog bundles delegate to that same instance.

Build from the repository root:

```sh
docker build -f release-source/5.0.14/task2/Dockerfile \
  -t nyxguardmanager:5.0.14-task2-candidate release-source/5.0.14
```

The build verifies the accepted frontend checksum and capability prerequisites, validates ICU syntax and argument signatures for every effective catalog, runs the localization tests, patches reviewed presentation text, and checks every resulting JavaScript asset. Content hashes update internal references and HTML together. The manifest records the Task 1 base revision and a localization source digest; uncommitted work is explicitly identified as working-tree Task 2.

`presentation.json` adds reviewed six-language phrases. `../locales/base-completion.json` completes existing catalog entries while preserving existing translations, except for explicitly reviewed corrections. `imperative.mjs`, `dynamic.mjs`, `events.mjs`, `notifications.mjs` and `formatting.mjs` address the corresponding presentation paths. Technical values, action codes, URLs, credentials and comparison operands remain unchanged.

Embedded help documents use the same formatter, including Romanian, which previously fell back to English. Existing German, English, Spanish, French and Italian documents are retained. Select announcements, notification region labels and ordinal field labels are localized through `select-accessibility.mjs` and `accessible-labels.mjs`. Presentation styling uses stable attributes rather than translated button text.

`localized-errors.js` presents the existing 32 structured operational/licensing error policies with localized summaries and recommendations while preserving diagnostic references. Unknown provider details retain their original text inside a localized explanation. Network cancellation semantics are preserved. `native-validation.js` localizes browser constraint messages when the browser language differs from the selected app language, without changing form constraints or values.

The language selector preserves the existing reload contract. Dirty native forms and controlled notification drafts are guarded by the existing decision dialog. Cancel preserves the current form; discarding is explicit. Only marked search/filter state is temporarily retained across the reload; credential values and configuration drafts are never written to browser storage. Stable attributes replace behavior based on translated navigation text.

`localization-layout.css` gives sidebar action text sufficient line height and vertical inset for descenders while retaining the original 25 px pill height.

After installing the pinned tools, independent checks are available as:

```sh
node --test task2/tests/*.test.mjs
node task2/audit.mjs /path/to/frontend /path/to/audit.json
node task2/validate.mjs /path/to/effective-catalogs.json /path/to/validation.json
```

Static candidate counts are an inventory for review, not a claim that every candidate is user-facing. Runtime checks must additionally cover dialogs, asynchronous messages, roles, language transitions, themes and layout. Live DEV evidence, test accounts, deployment records and operator details are retained outside this source tree. No release publication or production deployment is performed by these scripts.
