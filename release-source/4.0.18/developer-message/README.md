# Developer Message source layer

This layer adds the post-login Developer Message while preserving the Custom
Location port and Threat Activity pagination layers. The versioned 4.0.18
Dockerfile starts from the digest-pinned public 4.0.16 Manager image.

## Semantics

- `Continue`, close, backdrop click, and Escape dismiss only for the current
  authenticated browser session. A refresh in that session stays dismissed.
  Entering NyxGuard's unauthenticated state clears the session guard, including
  when logout is immediately followed by a page reload, so every new login shows
  the message again until Support is chosen.
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

## Build source

`docker/4.0.18/Dockerfile` includes this layer and its image assertions.
`NYXGUARD_SOURCE_REVISION` supplies the image label and runtime health
metadata with the source commit.

## Validation

The image build runs source, approved-copy, accessibility, responsive-style,
auth-route, support-action, and version assertions. Run integration and browser
acceptance against disposable installations, with authentication and output
kept outside the public source tree.

Normal dismissal lasts only for the current authenticated login session. The
Developer Message is shown again on every new login until the user explicitly
chooses Support NyxGuard. Support acknowledgement is persisted server-side per
user.

## Known limitations

Session-only dismissal depends on browser `sessionStorage`, which is deliberately
non-authoritative. Browsers that block session storage may show the message again
after refresh; permanent acknowledgement remains unaffected and server-side.
