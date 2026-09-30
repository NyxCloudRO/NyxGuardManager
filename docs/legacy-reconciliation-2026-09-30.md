# Task 0A legacy source reconciliation

This records the DEV source decision made while moving the accepted Task 1A
commits onto the canonical `upstream` checkout. The published 5.0.0 image,
`v5.0.0` tag, and live containers were not rebuilt.

## Interrupted checkout

The interrupted checkout was `nyxguard-5-regression` at `b9e4a3c`. Its Task 0A
changes were `release-source/README.md`, the two
`release-source/5.0.1/frontend/patch-legacy-ui.*` files,
`docs/service-discovery-proposal.md`, and `docs/vpn-client.md`. The 4.0.14 and
4.0.15 Docker trees and `docs/releases/4.0.14.md` were older untracked release
material, not the recent Task 0A edits. The Task 0A material was reviewed,
tested, and committed as `f03cde7`.

## Feature groups

| Legacy source | Classification | Evidence and disposition |
| --- | --- | --- |
| `myfork` backend/product branding, 4.0.8 version strings, old install/docs/locale edits | SUPERSEDED | Current 5.0.0 source and compiled UI use NyxGuard branding and current version. The older React checkout is not the validated 5.x build input. |
| `myfork` WAF UI placeholders, ClickHouse DEV service, Nginx/custom rule setup, VPN era changes | SUPERSEDED or UNIQUE_BUT_OBSOLETE | These are pre-4.0.18 architecture; current release source and published 5.0.0 image contain later WAF, VPN, and support implementations. The unconnected ClickHouse DEV service is not part of the current compose stack. |
| `myfork` permission aliases | IDENTICAL_CURRENT | The validated compiled UI includes both camelCase and snake_case aliases for proxy hosts, redirection hosts, dead hosts, access lists, and web controls. |
| `myfork` access-list remove controls and certificate usage ordering | UNIQUE_AND_STILL_REQUIRED | The compiled 5.0.0 assets still use two anchor controls and four default object sorts. `release-source/5.0.1/frontend/patch-legacy-ui.mjs` asserts and patches those exact sites; tests and checks on copied saved and live 5.0.0 assets passed. |
| `myfork` schema private-key example redaction | SUPERSEDED | The old schema contains example private-key material; the current tracked release source has no such JSON schema or matching private-key example. It was not copied forward. |
| `myfork` dependency, lint, test, logrotate, and legacy Docker edits | UNIQUE_BUT_OBSOLETE | They target the retired 1.0/4.0.8 source build, not the 5.0.0 compiled overlay and versioned release source. The deleted Cypress fixture is not current source. |
| Dirty old `upstream` 4.0.11–4.0.13 local hotfix build folders | HISTORICAL_ONLY | Later 4.0.18 and 5.0.0 releases supersede these old local build inputs. |
| Dirty old `upstream` DEV compose edit | UNIQUE_AND_STILL_REQUIRED | It documents the running 5.0.0 DEV stack. An exact copy is kept as `../dev-runtime-compose.yml`; the canonical tracked compose follows the 5.0.0 release source. |
| Dirty old `upstream` Service Discovery proposal | UNIQUE_AND_STILL_REQUIRED | Recovered as `docs/service-discovery-proposal.md`, explicitly marked a future proposal. |
| Dirty old `upstream` licensing/support discovery note | SUPERSEDED | Its September 23 implementation plan is represented by later 5.0.0 licensing, diagnostics, migration, and support release source. |
| `nyxguard-5-dev` and `nyxguard-5-cli` | IDENTICAL_CURRENT | Their heads `96900ef` and `3ea50ee` are ancestors of `origin/main` at `6fb59d5`. |
| `nyxguard-5-docs` | SUPERSEDED | The standalone `c9ea047` draft describes a pending updater gate; later 5.0.0 gate documentation and release commits are on `origin/main`. |
| `nyxguard-5-ui-agent` and `nyxguard-5-diagnostics-agent` | SUPERSEDED | Their bounded support prototypes were followed by 5.0.0 Professional Support source and tests in `release-source/5.0.0`. |
| `nyxguard-source-b2d8b76` | IDENTICAL_CURRENT | Its head `b2d8b76` is an ancestor of `origin/main`. |
| `upstream_backup_20260207_1810` | HISTORICAL_ONLY | February `develop` history and untracked runtime data predate the 4.0.18 and 5.0.0 line. Its data path is not mounted by live DEV containers. |
| Untracked 4.0.14/4.0.15 build trees and 4.0.14 release note in regression checkout | HISTORICAL_ONLY | July release snapshots, not 5.x build inputs. The accepted Task 1A and Task 0A work does not depend on them. |
| Other `dev402`, `devfix`, `lockfix`, `Implementation`, and recovery/staging folders | HISTORICAL_ONLY or GENERATED_OR_RUNTIME | Old release experiments, notes, backups, and test output. They are not live container mounts or current versioned release source. |

No legacy React tree was adopted as authoritative 5.x source. The required
changes are a deterministic compiled asset patch for a future 5.0.1 build.
