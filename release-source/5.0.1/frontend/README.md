# Legacy UI corrections for a future 5.0.1 build

The original React source matching the validated compiled frontend base is
unavailable. This asserted script carries forward two changes found in the
older React checkout: the two access-list removal controls become real buttons,
certificate usage lists sort by numeric ID, and the VPN Client safely renders
before or without site data. The older checkout is not a
build input for the current frontend.

The script expects these asset names. The saved compiled base and the live
5.0.0 frontend were both checked. The main asset differs because the 5.0.0
image applies later support overlays; both versions retain the asserted patch
sites.

| Asset | Saved base SHA-256 | Live 5.0.0 SHA-256 |
| --- | --- | --- |
| `index-CTHAIRmi-409dev-4012certfix4-threatpagination3.js` | `7fe64397c0f6c29b5540c26d62b9db4dc2eb5dc58082f8540bd6fe3cda1092c7` | `9ee940b62a46f859aa9455d31aa2e5493b565bba888f5c1562008504a2d2858f` |
| `index-BfJf9XXp-4012certfix4.js` | `d2c05c64d384c5503ba37f3b8128748b620a5e9500c9cf7330def00ab2d30914` | `d2c05c64d384c5503ba37f3b8128748b620a5e9500c9cf7330def00ab2d30914` |

The VPN patch targets `vpn-client-4014.js` in the same validated base image.
It asserts every replacement before writing any of the three assets. The
regression tests cover initial loading, missing/partial/disconnected sites,
populated sites, and failed API responses.

Verify the base asset hashes, then run
`node release-source/5.0.1/frontend/patch-legacy-ui.mjs FRONTEND_ROOT` and
`node --test release-source/5.0.1/frontend/patch-legacy-ui.test.mjs release-source/5.0.1/frontend/vpn-client.test.mjs`.
The script asserts exact match counts before writing the files. It has been
tested on copies of the saved assets at `/home/ubuntu/nyx-recovery/base-ui`
and the current 5.0.0 DEV container.
The immutable 5.0.0 image and source are unchanged.
