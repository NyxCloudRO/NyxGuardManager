# Certbot image recovery

The sanitized 5.0.10 build exported an image whose virtual environment's
`site-packages` was a symlink to `/data/certbot-site-packages`, then removed the
volume's contents. The inherited preparation hook skipped every symlink without
checking its target. A fresh volume therefore had neither Certbot nor pip.
The sanitized image also omitted `/opt/certbot/bin` from PATH.
The same dangling symlink and skip hook are present in inspected 5.0.0 and
5.0.9 images; fresh-volume initialization was already defective before 5.0.10.
The exact original introducing build change has not yet been established.

5.0.11 restores a real image-baked package directory from the pinned immutable
seed and ships Cloudflare 5.3.1 to match Certbot/ACME 5.3.1. Additional dependencies
are version and SHA-256 pinned in `cloudflare-requirements.txt`. The Cloudflare
package is distributed as an sdist; its build uses the immutable base's build
toolchain with isolation disabled. The listed PyYAML wheel hash targets the
base image's amd64/Python 3.11 platform.

The replacement hook checks the persisted target, repairs missing/corrupt core
packages, refreshes seed-owned packages when distribution metadata changes,
preserves additional DNS plugins, and validates imports before committing the
replacement. A retained previous tree permits recovery after interruption of
the replacement rename. Certificate files under `/etc/letsencrypt` are untouched.
The runtime dependency check rejects incompatible retained third-party plugins.

The Dockerfile and build script both run the offline interpreter, CLI, pip,
webroot and Cloudflare gate. Run the additional disposable-volume gate with:

```
python3 release-source/5.0.11/tests/certbot-image-gate.py IMAGE
```

This checks fresh volumes, dangling symlink repair, recreation, corrupted-core
repair, interrupted replacement recovery, extra-plugin preservation, certificate
volume preservation, and offline issuance failures. It requires only a Docker
lab and removes only its uniquely named temporary volumes.

These gates do not establish successful live HTTP-01/DNS-01 issuance, renewal,
or Manager API/UI certificate workflows. Those require separate qualification
with approved disposable domains, routing and credential references. Never use
production domains or credentials to fill that gap.
