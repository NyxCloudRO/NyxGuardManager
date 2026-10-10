# NyxGuard Manager 5.0.11 candidate source

Unreleased investigation candidate. The published 5.0.10 artifacts remain unchanged.

The pinned public 5.0.10 filesystem is sanitized before building. Migration names, configuration and SQL behavior remain unchanged; the candidate adds explicit migration identification and safe stage diagnostics. The host updater carries large-history verification and bounded progress monitoring independently of image replacement.

Build locally with `python3 build-release.py --revision <reviewed-source-commit>`. Do not publish until the legacy and current-version upgrade acceptance matrix is complete. Qualification remains in progress.
