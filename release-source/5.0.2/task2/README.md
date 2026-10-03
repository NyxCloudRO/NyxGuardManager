# Task 2 overlay

This overlay preserves the accepted Task 1 source and migration 43. It uses the existing page shells, controls and table structure.

The desktop sidebar uses 32px navigation rows, 26px below 820px viewport height, and 24px below 740px, with corresponding footer spacing. It keeps every entry and control and does not hide overflow. The existing desktop breakpoint is 768px wide. Acceptance covers all requested sizes and an additional 1280×680 viewport. There is no documented minimum height; a 640px probe remains below the fit range, so this change does not claim support there. Mobile keeps its existing navigation behavior.

Proxy Hosts retains all columns and visible row details, reducing cell padding and avatar dead space. Traffic Rules styles are scoped to its page, including a 12px Save/Cancel gap. Amber PARTIAL styling applies only to WAF badges. The duration formatter reads Manager process uptime; Dashboard system and oldest-container uptime readers remain unchanged.

Recent traffic selection now keeps the exact requested prefix with a bounded heap and a stable timestamp sort. It preserves ties, requested windows, aggregation, and existing log-scan budgets. It removes arbitrary 1,000/5,000 recent-row caps that prevented later pages from loading. Missing files during rotation remain benign; other read failures and corrupt gzip logs reach the existing API error handler. Existing truncation flags receive visible notices.

The rendered IP page displays 100 matching loaded IPs per page; filters, sorting and JSON export still operate on the full API result. Traffic, IPs and Dashboard queries consume cancellation signals through the shared HTTP helper's options argument. The compiled asset patches assert their expected inputs. The rendered IP/Traffic chunks differ from their preloaded `-409dev` counterparts, so the patches target the actual lazy imports.

No schema or index changes are warranted by the DEV query evidence. Its historical bucket query already has a bucket index and takes about 2.5ms over seven Aria rows. Cold host-resource reporting includes Docker CPU sampling; its existing sampled CPU and uptime semantics are preserved.

Tests run inside the candidate image with the source mounted at `/app/release-source`. `tests/browser_acceptance.py` accepts a base URL and a securely stored session file, writes evidence outside source, and checks all major routes over nine desktop viewports plus mobile. Optional asset and CSS arguments support a candidate preview before handover. The separate browser performance gate uses controlled response fixtures, without writing fabricated history to DEV. `benchmark.mjs` compares original event selection against the heap with identical output. Benchmark output, sessions, screenshots, database backups and deployment evidence are private acceptance artifacts and must stay outside Git.
