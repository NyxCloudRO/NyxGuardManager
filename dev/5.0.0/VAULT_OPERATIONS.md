# Licensing vault key operations

The license installation ID, revision floor and encrypted state live in the
MariaDB `nyxcloud_license_state` row. `NYXCLOUD_LICENSE_VAULT_KEY_PATH` names
an absolute file containing exactly 32 random bytes. The application refuses
missing, wrong-sized or group/world-accessible key files. A wrong 32-byte key
cannot decrypt existing state and leaves licensing unavailable; core proxy
functions remain independent.

For a new installation, before the first 5.0.0 application start, create a
root-controlled directory on the persistent host and generate the key without
printing it:

```sh
install -d -m 0700 /opt/nyxguardmanager/licensing
umask 077
head -c 32 /dev/urandom > /opt/nyxguardmanager/licensing/vault.key
chmod 0600 /opt/nyxguardmanager/licensing/vault.key
```

Bind-mount that exact file read-only into the application, for example at
`/run/nyxguard-licensing/vault.key`, and set
`NYXCLOUD_LICENSE_VAULT_KEY_PATH` to the container path. Grant the application
user read access by setting the file owner to the configured application
`PUID:PGID` before startup, without granting group or other access. Do not bake the key
into an image, environment value or container filesystem. If the file already
exists, retain it; never regenerate it as part of an upgrade or restart.

Back up the MariaDB volume and this key as one consistent recovery set, with
separate restricted access to the key. Test a restore in isolation before an
upgrade. Restore the database and the same key before starting the application.
Keep the old key during rollback and another 5.0.0 attempt. Restoring the DB
without the matching key makes encrypted credentials and entitlement unreadable.
Restoring an older DB may also require authority recovery if its revision is
behind the authoritative binding.
