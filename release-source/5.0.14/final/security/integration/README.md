# Frozen integration recipe

This directory records the exact integration recipe for the unpublished candidate identified in INTEGRATION-MANIFEST.json. It does not clear security findings or authorize publication.

The Dockerfile expects a build context containing its install-runtime.py and build-provenance.json, the reviewed final/security/package.json and package-lock.json as root files, the pinned cache archive as cache.tgz, and a packages directory containing the glibc and leaf Debian packages. It obtains curl packages from the pinned completed curl builder. The runtime starts from the pinned security-only OpenResty engine image, preserving accepted application files.

Use the existing final/security/Dockerfile.glibc and Dockerfile.leaf export targets to produce their packages; retain hashes and upstream source manifests. Dockerfile.curl builds the original Debian-compatible fourteen-advisory source, then Dockerfile.curl-complete adds the explicitly local pushed-stream initialization correction. Official vendor archives omitted from this source-only distribution must be recovered by pinned URL/hash using prepare-vendor.py; the cache package URL/integrity are in cache-vendor/manifest.json. Some declared base images are local development artifacts and are not public registry dependencies. Their upstream layer recipes and exact identities must remain available; this source archive is not a standalone rebuild kit.

Assemble a fresh private context by copying the declared files and packages without altering source. Verify every package and cache hash against the build manifests before building. Do not use unqualified experimental source or retag a different binary as this candidate. Registry publication requires complete exact-image security and functional acceptance.
