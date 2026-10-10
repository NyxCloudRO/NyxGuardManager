# Manager 5.0.10 release source

Build with Docker and Python 3:

```bash
python3 release-source/5.0.10/build-release.py --revision "$(git rev-parse HEAD)" --tag nyxguardmanager:5.0.10-candidate
```

The build pins the published 5.0.9 base by digest, exports its merged application filesystem without running it, removes inherited runtime/storage content, and builds a fresh layer history. Database credential environment defaults are not inherited. Historical tags and digests are not altered. No host database, licensing key, certificate, logs or credentials enter the build context.

The generated `sanitized-rootfs.tar` lives only in an isolated temporary context. The committed Dockerfile, version patch, release policy and host-workflow patch are the reproducible build inputs. Review and qualify the exact resulting image before publication.
