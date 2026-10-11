#!/usr/bin/env python3
"""Exercise shipped prepare scripts in ephemeral offline containers."""
import argparse
import subprocess

p = argparse.ArgumentParser()
p.add_argument('image')
args = p.parse_args()
for value in (None, 'false', 'true'):
    command = ['docker', 'run', '--rm', '--network', 'none', '--entrypoint', 'bash']
    if value is not None:
        command += ['-e', 'DISABLE_IPV6=' + value]
    script = r'''
set -euo pipefail
. /usr/bin/common.sh
export -f log_info is_true
mkdir -p /data/nginx
printf '    listen [::]:80;\n' > /data/nginx/ipv6-fixture.conf
bash /etc/s6-overlay/s6-rc.d/prepare/40-dynamic.sh
bash /etc/s6-overlay/s6-rc.d/prepare/50-ipv6.sh
expected=$(is_true "$DISABLE_IPV6")
test "$(cat /data/nginx/.ipv6_stamp)" = "$expected"
if [ "$expected" = 1 ]; then
    grep -q '#listen \[::\]:80' /data/nginx/ipv6-fixture.conf
    grep -q 'ipv6=off' /etc/nginx/conf.d/include/resolvers.conf
else
    grep -q '^    listen \[::\]:80' /data/nginx/ipv6-fixture.conf
    ! grep -q 'ipv6=off' /etc/nginx/conf.d/include/resolvers.conf
fi
bash /etc/s6-overlay/s6-rc.d/prepare/50-ipv6.sh
'''
    subprocess.run(command + [args.image, '-c', script], check=True, timeout=45)
    print('PASS: IPv6 shipped preparation ' + ('image default' if value is None else value))
