# Developer Message — DEV-only 4.0.18 candidate

This layer adds the post-login Developer Message while preserving the accepted
Custom Location port and Threat Activity pagination layers. It starts from the
digest-pinned public 4.0.16 Manager image and produces only the local DEV image
`nyxguardmanager:4.0.18-dev-developer-message`.

## Semantics

- `Continue`, close, backdrop click, and Escape dismiss only for the current
  authenticated browser session. A refresh in that session stays dismissed.
  Full logout clears the session guard, so the next login shows the message.
- `Support NyxGuard` uses the existing sidebar support link, opens it with the
  established new-tab/no-opener behavior, and then persists a timestamp.
- The timestamp is per user. It means only that the support destination was
  intentionally opened; it never claims or attempts to verify a donation.
- Acknowledgement is available only through `/api/developer-message`, whose GET
  and POST operations derive the user ID exclusively from the validated JWT.

## Persistence and migration

Migration `20260830120000_developer_message_acknowledgement.js` adds the nullable
`user.developer_message_acknowledged_on` column. Existing and new users default
to unacknowledged. No existing user data is rewritten.

## Build and DEV deployment

```sh
NYXGUARD_SOURCE_REVISION="$(git rev-parse HEAD)" docker compose --env-file .env \
  -f docker-compose.yml \
  -f docker-compose.dev-developer-message.yml \
  up -d --build --remove-orphans
```

This overlay is not referenced by the production Compose file or public update
metadata. The root `.version` remains at the last public version until the
separate release workflow.

The DEV health endpoint reports version `4.0.18`. `NYXGUARD_SOURCE_REVISION`
is passed into both the image label and runtime health metadata so the commit
field is the exact source revision, never the misleading `release-4.0.18`.
Leaving the variable unset deliberately reports `uncommitted`, rather than
inventing a public-release identity.

## Validation

The image build runs source, approved-copy, accessibility, responsive-style,
auth-route, support-action, and version assertions. After deployment:

```sh
docker exec nyxguard-manager node /app/dev-tests/developer-message.test.mjs --integration
docker exec nyxguard-manager node /app/dev-tests/threat-activity-pagination.test.mjs --integration
python3 dev/developer-message/browser-acceptance.py
```

The acceptance fixture creates uniquely named temporary DEV users for browser
acceptance and deletes only those exact fixture users afterward.

## Acceptance record

The final acceptance record belongs in `ACCEPTANCE.md`. It covers the migration,
authorization, browser behavior, responsive and accessibility checks, the two
accepted regression workstreams, DEV health, and exact candidate identity.

The polished release-note wording is retained in
`RELEASE-NOTES-4.0.18-UNPUBLISHED.md`; that file is a draft only and is not wired
to any public release or update channel.

## Known limitations

Session-only dismissal depends on browser `sessionStorage`, which is deliberately
non-authoritative. Browsers that block session storage may show the message again
after refresh; permanent acknowledgement remains unaffected and server-side.
