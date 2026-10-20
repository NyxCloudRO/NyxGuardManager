# ABI-preserving aligned allocation correction

This GCC12 source backport implements overflow checks from GCC commit `59d235ffa5a69231eb42e5290d52dc8c90d28b7a`, preserving the GCC12 aligned_alloc-first branch and new-handler behavior. It does not update the compiler stack.

The inputs are the matching Debian gcc-12 12.2.0-14+deb12u1 source archives listed with SHA256 in gcc-downloads.json. Verify them against the Debian DSC, unpack the outer orig and Debian tarballs in a fresh `/evidence/gcc-source/gcc-12-12.2.0`, then run `debian/rules patch` using the established Debian12 builder dependencies (make, GCC12/G++12, quilt, autoconf2.69, automake, gettext and patch). This applies the full distribution patch set before the local correction. Never reuse a source tree whose earlier modifications are unknown.

Copy these helpers into the isolated builder's `/evidence` directory. Run prepare-gcc.py once. As in a normal GCC build, generate `src/libgcc/gthr-default.h` as a symlink to `gthr-posix.h` before configuring: omitting this generated header silently loses thread support. Run build-gcc-posix.sh to build only libstdc++, not GCC. The normal shared runtime is built; optional separate debug/PCH outputs are omitted.

Run verify-gcc.py inside the matching original runtime environment, with the same evidence directory mounted, before packaging. It rejects removed or added versioned exports, changed public version definitions, and SONAME changes. Both supplied C++ probes must pass against the new shared library. The qualified build retained all 5,981 exported names/versions and SONAME libstdc++.so.6.

package-libstdcxx.py copies the original installed libstdc++6 package files and maintainer scripts, replaces only the stripped runtime, regenerates checksums, and sets the truthful version 12.2.0-14+deb12u1+nyxguard1. Its output is under `/evidence/packages`. The inherited image policy excludes documentation during dpkg installation, including the added documentation JSON; external package/source manifests provide the authoritative provenance. Verify the installed runtime bytes against the packaged runtime, not the excluded documentation path.

Build these packages in the existing recovered Debian12 builder environment; local historical application/base images remain reproduction prerequisites. Integrate into the frozen preceding candidate with a read-only BuildKit package mount and dpkg --force-confold. This source-level correction alone does not clear the release's independent library findings.
