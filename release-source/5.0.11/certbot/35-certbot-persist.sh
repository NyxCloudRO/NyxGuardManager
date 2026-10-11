#!/command/with-contenv bash
set -eu
# A symlink alone never proves its target was initialized (fresh-volume bug).
/usr/bin/python3 /app/internal/certbot-persist.py
