# Public source and release review

Every push and release requires both an automated gate and human review. Public documentation describes supported product behavior, examples and recovery requirements. Installation identities, infrastructure inventories, customer statistics, raw logs, dumps, keys and operator incident reports stay in private evidence storage.

Enable the maintained local push gate with `git config core.hooksPath .githooks` after reviewing any existing custom hooks. It scans the exact commit trees being pushed and refuses unreviewed ref deletion. CI checks the checked-out push/PR tree. Repository administrators should require the CI check before merging; direct pushes can otherwise bypass a local hook.

Run from the repository root before committing:

```bash
python3 tools/publication-check.py --context
python3 tools/publication-hygiene.py --staged
```

For a release, scan the exact assembled asset directory and source archive before upload:

```bash
python3 tools/publication-hygiene.py --assets /path/to/assembled-assets
python3 tools/publication-hygiene.py --package /path/to/public-source.tar.gz
```

Use a build context assembled from tracked, reviewed files. `.dockerignore` must exclude private evidence, credentials, runtime data and generated caches. Review image config/environment/build history and packaged first-party files from an image export, including inherited layers; a source scan alone does not certify an image. Do not export a running application's filesystem as a public artifact.

The CI workflow checks source, packaged Git archive, publication scanner regression checks, embedded host-updater syntax, Docker COPY inputs, relative documentation links and the current Manager/independent Agent versions. Historical overlays retain their version contracts; local base-image requirements are reported for review, not silently replaced.

The scanner reports locations and categories without values. Narrow exceptions bind a reviewed synthetic fixture to its exact line hash and a written reason. New or changed content needs review. RFC1918 examples must be explicitly illustrative; standard product paths, service names and immutable public digests are legitimate. Binary visual assets and image metadata require manual inspection. Automated secret patterns are useful but cannot prove the absence of every secret or identify every private hostname.

Keep installation-specific denylist patterns outside public source in `NYXGUARD_PUBLICATION_DENYLIST`. Administrators can configure `PUBLICATION_PRIVATE_PATTERNS` as a repository Actions secret containing one regex per line; never copy private identifiers into public rule files or commit messages. Without that private configuration, human infrastructure review remains mandatory.

The reviewer must verify all of the following before approving publication:

- Diff and assembled assets contain only required product source, packaging and generic documentation.
- No operational credentials, license/vault/VPN material, customer data, private names/addresses/paths or incident narratives are included.
- Installer, updater, recovery, Docker inputs and compatibility source matrices remain intact; required regression suites pass.
- Current README/manual Compose, release policy, image identities, manifests, checksums and release notes agree. Historical compatibility references remain accurate.
- Release descriptions and links use reviewed generic guides. All uploaded assets, including receipts, have been scanned and manually reviewed.
- Image metadata and packaged files have been reviewed, and public artifact checks use the final immutable digest.
- Website installation/version references are inventoried for synchronization through a separately authorized website change.
- Existing tags, assets, checksums and image digests are preserved unless separately approved remediation requires otherwise.

A failed safety gate or unsupported upgrade must remain visible in documentation. Do not use repository cleanup to imply that a production upgrade has passed.
