# Threat Activity count and pagination

Threat Activity rows are aggregates identified by `IP + attack type` inside the
selected 1/7/30-day event window. `count` is the number of raw events for that
identity and `lastSeen` is its newest event. The established operator behavior
also unions currently active attack-derived bans whose source events have left
the window; those identities have count 1 and remain marked as ban-derived.

The release API grouped event rows and applied `LIMIT 200` before merging ban
rows. It then sliced the merged list to 200 and returned no independent total.
The frontend filtered and sorted only that truncated array and rendered its
length as both the loaded count and total, producing a false `200 of 200` when
more matching identities existed.

The versioned source layer adds bounded offset pagination and an independently counted
filtered aggregate. Search, type, minimum count, and sorting are server-side so
the total describes the active filter set. Ordering uses `IP + type` as stable
secondary keys. The backward-compatible response is:

```json
{"days":30,"items":[],"total":0,"limit":200,"offset":0}
```

The database has composite indexes beginning with `created_on` and with
`ip, attack_type, created_on`; the bounded page and count queries reuse those
indexes. Attack-event retention is a fixed 30 days in `attack-monitor.js`; the
separate settings retention control applies to nginx log rotation and does not
impose a 200-row database cap.

The versioned Dockerfile includes this layer. To run the temporary-table
integration regression in a disposable test installation:

```sh
docker exec nyxguard-manager \
  node /app/dev-tests/threat-activity-pagination.test.mjs --integration
```

The test uses a connection-local temporary table with 530 aggregate identities;
it does not clear or insert into the real Threat Activity table.
