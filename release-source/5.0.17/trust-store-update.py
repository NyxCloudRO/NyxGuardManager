"""Install pinned upstream trust-store fixes without changing native binaries."""
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import urllib.request

inputs = json.loads(Path(__file__).with_name('trust-store-inputs.json').read_text())
with tempfile.TemporaryDirectory(prefix='nyxguard-trust-') as directory:
    directory = Path(directory)
    for item in inputs['downloads']:
        target = directory / item['filename']
        with urllib.request.urlopen(item['url'], timeout=60) as response:
            content = response.read(2 * 1024 * 1024)
        assert hashlib.sha256(content).hexdigest() == item['sha256'], 'Trust-store input hash mismatch'
        target.write_bytes(content)
    deb = directory / inputs['downloads'][0]['filename']
    assert subprocess.check_output(['dpkg-deb', '-f', str(deb), 'Version'], text=True).strip() == inputs['debianVersion']
    subprocess.run(['dpkg', '-i', str(deb)], check=True, env={**os.environ, 'DEBIAN_FRONTEND': 'noninteractive'})
    wheel = directory / inputs['downloads'][1]['filename']
    subprocess.run(['/opt/certbot/bin/python', '-m', 'pip', 'install', '--no-deps', '--no-index', '--no-cache-dir', '--force-reinstall', str(wheel)], check=True)
    subprocess.run(['/opt/certbot/bin/python', '-m', 'pip', 'check'], check=True)
    installed = Path('/opt/certbot/lib/python3.11/site-packages')
    seed = Path('/opt/certbot-site-packages-seed')
    for old in [seed / 'certifi', *seed.glob('certifi-*.dist-info')]:
        if old.exists():
            shutil.rmtree(old)
    for source in [installed / 'certifi', *installed.glob('certifi-*.dist-info')]:
        shutil.copytree(source, seed / source.name, symlinks=True)
