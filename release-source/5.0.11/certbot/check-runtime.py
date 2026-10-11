#!/usr/bin/env python3
"""Offline gate: validate the exact interpreter, CLI and required plugins."""
import importlib.metadata as metadata
import pathlib
import subprocess
import sys

assert pathlib.Path(sys.prefix) == pathlib.Path('/opt/certbot'), 'Wrong Certbot interpreter'
for name in ('certbot', 'acme', 'pip', 'certbot-dns-cloudflare'):
    assert metadata.version(name), f'Missing {name}'
assert metadata.version('certbot') == metadata.version('acme') == metadata.version('certbot-dns-cloudflare') == '5.3.1'
subprocess.run([sys.executable, '-m', 'pip', 'check'], check=True)
for executable in ('/usr/bin/certbot', '/opt/certbot/bin/certbot', 'certbot'):
    subprocess.run([executable, '--version'], check=True)
plugins = subprocess.check_output(['certbot', 'plugins'], text=True)
for plugin in ('webroot', 'dns-cloudflare'):
    assert f'* {plugin}\n' in plugins, f'Plugin did not load: {plugin}'
print('Certbot interpreter, pip, CLI, webroot and Cloudflare gate passed')
