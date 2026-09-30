# Traffic Rules management correction

The validated 5.0.0 image contains the current compiled React page, while its
matching React source is unavailable. `patch-page.mjs` follows the established
5.0.1 asserted asset patch approach. It requires exact source matches, writes a
new `index-DHuZiE1T-task2.js` page, and updates the existing main asset's two
references. It refuses unexpected input. `patch-page.test.mjs` verifies the
contract and checks the generated JavaScript.

The backend route overlay lists disabled and expired manual IP rules in the
management API, preserving the active-only rule list consumed by OpenResty.
Rules sort by enabled state and descending ID; there is no user priority,
protocol, or port in this rule model. The page can edit actions, IP/country
values, and notes while retaining existing expiration, requires confirmation
to delete, and shows API failures for edit, toggle, and delete.

The Dockerfile applies this patch after the existing 5.0.1 frontend patches.
No immutable 5.0.0 source or image is changed.
