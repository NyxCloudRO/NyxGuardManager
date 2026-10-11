#!/usr/bin/env python3
"""Offline disposable-image qualification; never uses production volumes or ACME.

Run on the approved Docker lab: python3 certbot-image-gate.py IMAGE
Uses only unique temporary named volumes and containers with network disabled.
"""
import argparse
import subprocess
import uuid

def call(*args):
    subprocess.run(args, check=True, timeout=180)

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('image')
    parser.add_argument('--persist-script', help='Debug only: mount a corrected hook before rebuilding; never release qualification')
    args = parser.parse_args()
    prefix = 'nyx511-certbot-gate-' + uuid.uuid4().hex[:12]
    volumes = [prefix + '-data', prefix + '-ssl']
    containers = []
    def run(script, mounted=True):
        name = prefix + '-run-' + str(len(containers))
        containers.append(name)
        command = ['docker', 'run', '--rm', '--name', name, '--network', 'none', '--entrypoint', '/bin/sh']
        if args.persist_script:
            command += ['-v', args.persist_script + ':/app/internal/certbot-persist.py:ro']
        if mounted:
            command += ['-v', volumes[0] + ':/data', '-v', volumes[1] + ':/etc/letsencrypt']
        call(*command, args.image, '-eu', '-c', script)
    gate = '/opt/certbot/bin/python3 /app/internal/check-certbot-runtime.py'
    initialize = '/usr/bin/python3 /app/internal/certbot-persist.py'
    try:
        for volume in volumes:
            call('docker', 'volume', 'create', volume)
        run(gate, False)
        # Reproduce the exported dangling symlink with empty /data exactly.
        run('rm -rf /opt/certbot/lib/python3.11/site-packages; '
            'ln -s /data/certbot-site-packages /opt/certbot/lib/python3.11/site-packages; '
            + initialize + '; ' + gate + '; '
            'echo preserved > /data/certbot-site-packages/nyx_test_custom_plugin.py; '
            'mkdir -p /etc/letsencrypt/live/disposable.invalid; '
            'echo persistence-fixture > /etc/letsencrypt/live/disposable.invalid/sentinel')
        # New container, same volumes: packages and certificate-volume data survive.
        run(initialize + '; ' + gate + '; '
            'test "$(cat /data/certbot-site-packages/nyx_test_custom_plugin.py)" = preserved; '
            'test "$(cat /etc/letsencrypt/live/disposable.invalid/sentinel)" = persistence-fixture; '
            # Marker-present broken core must be repaired, retaining extra plugins.
            'rm /data/certbot-site-packages/certbot/main.py; ' + initialize + '; ' + gate + '; '
            'test "$(cat /data/certbot-site-packages/nyx_test_custom_plugin.py)" = preserved')
        # Corruption persisted between recreations must inspect TARGET, not the
        # healthy baked image directory. Also recover interruption before commit.
        run('rm /data/certbot-site-packages/certbot/main.py')
        run(initialize + '; ' + gate)
        run('rm /data/certbot-site-packages/certbot_dns_cloudflare/_internal/dns_cloudflare.py')
        run(initialize + '; ' + gate)
        run('mv /data/certbot-site-packages /data/.certbot-site-packages-previous')
        run(initialize + '; ' + gate + '; test ! -e /data/.certbot-site-packages-previous')
        # Retained incompatible plugin dependency must fail before replacement,
        # keeping the old persistent tree and its custom package unchanged.
        run('mkdir -p /data/certbot-site-packages/nyx_conflict_fixture-1.0.dist-info; '
            'printf "Metadata-Version: 2.1\\nName: nyx-conflict-fixture\\nVersion: 1.0\\nRequires-Dist: certbot>=9999\\n" '
            '> /data/certbot-site-packages/nyx_conflict_fixture-1.0.dist-info/METADATA; '
            'rm /data/certbot-site-packages/.nyxguard-seed-version; '
            'if ' + initialize + ' >/tmp/seed-conflict.log 2>&1; then exit 1; fi; '
            'test -d /data/certbot-site-packages/nyx_conflict_fixture-1.0.dist-info; '
            'test "$(cat /data/certbot-site-packages/nyx_test_custom_plugin.py)" = preserved; '
            'test ! -e /data/.certbot-site-packages-previous; '
            'rm -rf /data/certbot-site-packages/nyx_conflict_fixture-1.0.dist-info; '
            + initialize + '; ' + gate)
        run(initialize + '; mkdir -p /data/challenge; '
            'if certbot certonly --non-interactive --agree-tos --register-unsafely-without-email '
            '--webroot -w /data/challenge -d disposable.invalid '
            '--server http://127.0.0.1:9/directory >/tmp/issuance.log 2>&1; then exit 1; fi; '
            'test ! -d /etc/letsencrypt/live/disposable.invalid-0001; '
            'if certbot certonly --non-interactive --agree-tos --register-unsafely-without-email '
            '--dns-cloudflare --dns-cloudflare-credentials /tmp/absent-credentials.ini '
            '-d negative.invalid --server http://127.0.0.1:9/directory '
            '>/tmp/dns-issuance.log 2>&1; then exit 1; fi; '
            'test ! -d /etc/letsencrypt/live/negative.invalid; '
            'test -z "$(find /etc/letsencrypt/live -name fullchain.pem -o -name privkey.pem)"; '
            'echo Offline HTTP and DNS issuance failures left no usable certificate')
        print('PASS: offline core/plugins, fresh volume, dangling symlink repair, recreation, '
              'corrupt core repair, incompatible-plugin safe failure, custom plugin and certificate-volume persistence, negative ACME')
        print('NOT TESTED: live HTTP-01, DNS-01, renewal, Manager UI/API certificate workflows')
    finally:
        for name in containers:
            subprocess.run(['docker', 'rm', '-f', name], check=False,
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        for volume in volumes:
            subprocess.run(['docker', 'volume', 'rm', volume], check=False)

if __name__ == '__main__':
    main()
