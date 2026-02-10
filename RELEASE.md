# Release Checklist (NyxGuard Manager)

This repo is designed to support **in-place upgrades** (Docker volumes preserve data). To keep releases consistent and easy for users to install, follow this checklist for every new version.

## Before Tagging

1. Bump version
- Update `.version` (first line must be the version, e.g. `3.0.0`).
- Ensure backend/frontend package versions match the release where applicable.

2. Update installation docs (must be done every release)
- Update `README.md`:
  - Recommended curl install command should be pinned: `APP_VERSION=X.Y.Z`
  - Any text that references a pinned version should be updated.
- Update `docker-compose.yml`:
  - `image:` tag should point to the release: `nyxmael/nyxguardmanager:X.Y.Z`

3. Update changelog
- Update `CHANGELOG.md`:
  - Add the new release section at the top.
  - Include a clear summary of new features, DB/SQL changes (migrations/tables/columns), fixes, and behavior changes.

4. Verify upgrade safety (quick sanity)
- Confirm DB migrations run on startup and are backwards compatible for upgrades.
- Smoke test the app:
  - `curl -fsS http://127.0.0.1:81/api/ | jq`
  - Check UI loads and core flows work.

## Publish

1. GitHub
- Commit all changes to `main`.
- Create and push a tag: `vX.Y.Z`.

2. Docker
- Build and push the image:
  - `nyxmael/nyxguardmanager:X.Y.Z`

## Notes
- New installs should always be possible from:
  - `install.sh` (curl-based install)
  - `docker-compose.yml` (manual compose install)
- If the recommended curl install command changes, update the README in the same release.

