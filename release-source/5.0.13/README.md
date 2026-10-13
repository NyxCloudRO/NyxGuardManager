# Manager 5.0.13 build inputs

The Manager layers strict, prerequisite-checked patches on the pinned public 5.0.12 image. VPN Agent 5.0.2 layers reviewed full-tunnel routing on the pinned 5.0.1 Agent. Both retain existing persistent storage; Manager keeps schema 46.

Build from a committed checkout and provide its complete source revision:

```sh
REVISION=$(git rev-parse HEAD)
docker build --build-arg NYXGUARD_SOURCE_REVISION="$REVISION" -t nyxguardmanager:5.0.13-candidate release-source/5.0.13
docker build --build-arg NYXGUARD_SOURCE_REVISION="$REVISION" -t nyxguardmanager-vpn-agent:5.0.2-candidate release-source/5.0.13/agent
```

The frontend patcher checks inherited prerequisites and JavaScript syntax, uses content-derived asset names, and emits a served SHA-256 asset manifest with the full source revision. Current artifacts target Linux amd64. Do not infer other architectures from the upstream Node image.

Run the scoped Node tests with the existing Manager/Agent Node runtime, and run the stdlib native-dialog guard on served frontend assets. Private operational evidence, browser storage, keys and credentials do not belong in the source or build context.

See [release notes](RELEASE-NOTES.md) and [validation coverage](../../docs/validation-5.0.13.md).
