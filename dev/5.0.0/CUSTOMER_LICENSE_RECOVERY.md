# Professional Support activation and recovery

The License page has separate controls for a new claim and for recovery of an
existing entitlement. Select the product shown on the original entitlement.
NyxGuard Manager Professional Support and NyxCloud Premium Support are distinct
products. A Veleis entitlement does not unlock NyxGuard Diagnostics & Support.

## New activation

Enter the one-time claim code supplied through the approved purchase or operator
process, choose its product, select **Claim**, then **Activate**. The backend
checks the signed entitlement and installation binding before enabling support.

## Reinstall or move

Keep both the MariaDB data and the original licensing vault key when reinstalling
the application, replacing its container or image, or intentionally moving the
same installation to another VM. The installation ID and entitlement then stay
with that installation; no recovery or new purchase is needed. Never run the
old and moved VM as two active copies of the same installation.

If the database or installation ID is lost, use **License recovery and
replacement** on the new installation. Request recovery with the original
purchase email and correct product. The authority deliberately gives the same
initial response whether an eligible entitlement exists or not. Use the code
delivered to the verified email to confirm recovery. A successful replacement
supersedes the old installation; its next authoritative refresh loses access.
The same single-installation entitlement must not authorize both installations.
The same procedure applies after complete VM loss.

If the vault key is lost while the database survives, the encrypted local
credential cannot be read. Restore the matching key from a protected backup.
If no matching key exists, use the authority recovery path on a fresh
installation after ownership verification; do not overwrite the old key to
make an unreadable database appear healthy.

Premium covers only the products explicitly listed by its signed policy.
When a Premium entitlement has two active installations, automatic recovery
stays on hold because the current authority cannot safely infer which binding
to replace. Contact support for a reviewed replacement; the other legitimate
installation remains active. NyxGuard replacement must not grant wildcard
access or remove a separate Veleis installation. If the purchase email is unavailable, recovery is denied,
or the entitlement is expired or revoked, contact support for manual review.
Do not purchase support again solely because the old installation was lost.
