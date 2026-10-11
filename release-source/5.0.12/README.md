# NyxGuard Manager 5.0.12 release source

Manager **5.0.12**, database schema **46**, compatible VPN Agent **5.0.1**.

This corrective overlay builds on the immutable, sanitized public 5.0.11 Manager digest. Patch scripts assert the expected compiled frontend and runtime source before changing them. Historical sources, migrations and recovery targets remain intact.

Build from this directory:

```bash
docker build --build-arg NYXGUARD_SOURCE_REVISION="$(git rev-parse HEAD)" -t nyxguardmanager:5.0.12-candidate .
```

Tests live under `tests/`; browser acceptance requires an explicitly opted-in disposable installation and privately supplied credentials/artifact paths. Test output is not a public release input.

See [release notes](RELEASE-NOTES.md) and [validation coverage](../../docs/validation-5.0.12.md).
