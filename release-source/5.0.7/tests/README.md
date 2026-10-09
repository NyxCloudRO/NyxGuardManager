# Focused SQL integration

Run `sql-recovery.integration.mjs` inside the candidate Manager image, on a uniquely owned disposable MariaDB network namespace. It refuses a DB without `nyxguard.task=507`. Mount Docker socket and a private `/proof` directory containing the retained `prod-failed-database.sql`. Supply `NYXGUARD_TEST_DB`, `NYXGUARD_TEST_DATABASE`, `NYXGUARD_TEST_PASSWORD`, and `NYXGUARD_TEST_EVIDENCE` (host path). Never run against protected operational databases. Credentials, dumps and raw records are not release artifacts.

The driver fingerprints all original and restored data, checks SQL rejection/idle/total/monitor failures, checks failed-stage/user cleanup, and proves live preservation. Its JSON receipt contains scenario names, elapsed times and PASS results only.
