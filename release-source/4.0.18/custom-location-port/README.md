# Custom Location forward port patch

This versioned image layer corrects the Proxy Host Custom Location form boundary.
Browser number inputs expose text through `value`, so the existing handler stored
`"443"` even though `ProxyLocation.forwardPort` is a numeric domain field. The
patched handler uses `valueAsNumber`, producing `443` while preserving strict
backend integer and `1..65535` validation.

Integration testing also exposed a pre-existing duplicate `absolute_redirect`
directive between the Proxy Host template and its centrally managed server
snippet. The same fail-closed patch step removes only the template duplicate;
the global directive and all other config-generation behavior remain unchanged.

The base 4.0.16 image is digest-pinned and the patch fails closed unless exactly
one expected Custom Location handler is found in the active frontend bundle.
The image build runs focused frontend serialization and live backend schema
regression tests before and after applying the patch.

`docker/4.0.18/Dockerfile` includes this asserted patch and its tests.
