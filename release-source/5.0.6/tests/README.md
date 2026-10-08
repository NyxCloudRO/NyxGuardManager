# Live certification

These drivers execute the real installer/updater architecture against explicitly owned disposable fixtures. They never discover or access production. All data, recovery sets and failed ledgers are retained. Supply a separate Docker-in-Docker engine name in `NYXGUARD_TEST_ENGINE`, an evidence directory in `NYXGUARD_TEST_EVIDENCE`, and set `NYXGUARD_DISPOSABLE_CERTIFICATION=1` explicitly. Do not use a customer Docker engine.

`certify-routes.py IMAGE SOURCE...` creates genuine immutable source-version installations, seeds through the application API, upgrades through the normal entry point, verifies protected data/application APIs, performs Compose recreation and runs the updater again. Each case refuses to overwrite an existing fixture.

`restore-faithful-fixture.py CASE` requires an already mounted, read-only full backup path in `NYXGUARD_FAITHFUL_BACKUP` and retained source Compose metadata directory in `NYXGUARD_FAITHFUL_METADATA`. It restores all five original persistent volumes into unique new volumes and preserves historical recovery state.

`certify-interruptions.py CASE MODE IMAGE` operates only on a previously created `nyx506_CASE` fixture. MODE is backup, reconcile, migration, startup, health or stall. It observes durable phases and actual migration progress, injects the failure, runs supported resume where required, verifies healthy original recovery and unchanged historical evidence, and retries through the same entry point. The test-specific historical checksum must match the fixture's retained original before use; this driver records the certification fixture's immutable original, not a product policy.

Fresh-install certification runs the real installer with unique instance, ports and vault paths on owned Ubuntu test hosts and checks retained installation identities before and after. Public certification uses downloaded release assets and the published registry digest without a private-image override.
