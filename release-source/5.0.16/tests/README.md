# Focused regression inputs

`exporter.test.mjs` tests freshness and the exact observation block with controlled SQL/time dependencies. `correctness.mjs` compares exact summaries across all six windows, mutation and concurrency cases. The historical baseline, scanner, parser and ordering inputs are retained in the 5.0.15 and 5.0.14 source directories. Existing accepted timezone/cache suites remain applicable; final qualification supplements them with the built image's authenticated API and mTLS/Prometheus tests.

Run these sources using Node 22 with `--max-old-space-size=250`. Test fixture data uses reserved documentation addresses. No production logs or credentials are included.
