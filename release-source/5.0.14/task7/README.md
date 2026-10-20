# Task 7 DEV layer

Inherits the exact accepted Task 6 image. `prerequisites.json` guards its manifest,
all frontend asset hashes and the two backend files replaced by this layer.
Build locally from the 5.0.14 source root with `docker build -f task7/Dockerfile`.
No migration, licensing change, collector change, history rewrite or publication.

Traffic summary requests now use retained proxy-host access logs for every range.
The former >7-day rollup branch was incompatible with the short-range source:
its collector skips valid upstream `-` records and has independent ingestion and
retention limitations. Existing rollups and cursors remain untouched. They are
not merged with raw logs: overlap cannot be reconstructed reliably from counters.
No claim is made that retained logs include aggregate-only older history.

Windows are elapsed UTC minutes, inclusive start and exclusive end. Optional
`asOf` is an integer epoch millisecond reference within the preceding five minutes;
old callers remain compatible. Responses include actual window endpoints, source,
coverage limitations and HTTP classification/byte accounting. Unknown status is
unclassified. RX is Nginx request_length; TX is Nginx bytes_sent. Missing byte
measurements yield null totals and separately reported known bytes, never a
fabricated measured zero. Arithmetic rejects sums outside JavaScript's exact
integer range. HTTP error classification is distinct from security block events.

Complete continuity cannot be inferred from request-free periods or first/last
observations. Coverage is explicitly unverified, including empty installations.
Dashboard and Live Traffic disclose this limitation; Dashboard shows the actual
response reference time. Main cards share one response; Live Traffic/Decision
Stream retain their separately labeled, independently selected windows. Existing
range-keyed queries and AbortSignals are preserved. IP Intelligence headline totals and its blocked rate use the authoritative summary;
limited IP breakdowns are labeled. Failed summary refreshes
show unavailable main totals. Unknown decisions have a neutral label.

The existing fingerprinted, bounded parsed-log cache is retained, with capacity
600,000 events across 256 files (250,000 per file). This accommodates many rotated
files without the old 32-file churn. Eviction affects speed, never counts. Files
beyond the cache ceiling are streamed; large installations may have slower cold
or uncached refreshes. The source has no newly introduced persistent index.

Event Center keeps the authoritative occurrence timestamp and API contract.
Single occurrences omit redundant Last seen details. Count >1 records show First
seen and actual Last seen, or a translated unavailable indication. No timestamp,
repeat count, category, actor, grouping key, retention or permission is rewritten.

Focused deterministic tests: run `test-traffic.mjs` with a library directory
containing traffic-summary.mjs, historical-log-cache.mjs, traffic-selection.mjs
and log-scan.mjs. Test under both TZ=UTC and TZ=Europe/Bucharest. Private DEV
acceptance evidence and operational data remain outside this source package.
