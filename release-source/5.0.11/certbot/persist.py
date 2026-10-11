#!/usr/bin/python3
"""Reconcile the immutable core seed with persisted third-party DNS plugins.

Never assumes that a dangling image symlink means /data is ready. Refresh seed
packages on image changes while retaining unrelated plugins and certificate data.
"""
import hashlib
import os
import pathlib
import shutil
import subprocess
import tempfile

SEED = pathlib.Path('/opt/certbot-site-packages-seed')
TARGET = pathlib.Path('/data/certbot-site-packages')
PYTHON = '/opt/certbot/bin/python3'

def healthy(path=TARGET):
    # -S avoids falling back to healthy image packages when checking a broken
    # persisted tree before the image's site-packages is linked to it.
    code = ('import sys; sys.path[:0]=[sys.argv[1], "/usr/lib/python3/dist-packages"]; '
            'import certbot.main, acme, pip, certbot_dns_cloudflare._internal.dns_cloudflare')
    return subprocess.run([PYTHON, '-S', '-c', code, str(path)],
                          stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode == 0

def dependencies_healthy(path):
    # Validate retained third-party plugin requirements before changing TARGET;
    # an incompatible retained plugin must leave the previous tree available.
    code = ('import sys; sys.path[:0]=[sys.argv[1], "/usr/lib/python3/dist-packages"]; '
            'from pip._internal.cli.main import main; sys.exit(main(["check"]))')
    return subprocess.run([PYTHON, '-S', '-c', code, str(path)],
                          stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode == 0

def main():
    # Python 3.11 glob with a literal final component drops dangling symlinks.
    sites = [directory / 'site-packages'
             for directory in pathlib.Path('/opt/certbot/lib').glob('python*')
             if directory.is_dir() and ((directory / 'site-packages').exists()
                                        or (directory / 'site-packages').is_symlink())]
    if len(sites) != 1 or not SEED.is_dir():
        raise RuntimeError('Certbot image seed or interpreter layout is invalid')
    site = sites[0]
    if site.is_symlink() and site.readlink() != TARGET:
        raise RuntimeError('Certbot package symlink points to an unexpected location')
    if TARGET.is_symlink():
        raise RuntimeError('Certbot persistent package path must be a directory')
    backup = TARGET.with_name('.certbot-site-packages-previous')
    # Recover either side of a process interruption during the two renames.
    if backup.exists():
        if not TARGET.exists():
            backup.rename(TARGET)
        elif healthy():
            shutil.rmtree(backup)
        else:
            raise RuntimeError('Certbot interrupted replacement needs recovery; previous tree retained')
    # Hash the shipped distribution metadata; a new core/plugin seed triggers refresh.
    digest = hashlib.sha256()
    for metadata in sorted(SEED.glob('*.dist-info/METADATA')):
        digest.update(metadata.parent.name.encode())
        digest.update(metadata.read_bytes())
    version = digest.hexdigest()
    marker = TARGET / '.nyxguard-seed-version'
    if not marker.is_file() or marker.read_text().strip() != version or not healthy():
        TARGET.parent.mkdir(parents=True, exist_ok=True)
        staging = pathlib.Path(tempfile.mkdtemp(prefix='.certbot-seed-', dir=TARGET.parent))
        try:
            if TARGET.is_symlink():
                raise RuntimeError('Certbot persistent package path must be a directory')
            if TARGET.exists():
                shutil.copytree(TARGET, staging, dirs_exist_ok=True, symlinks=True)
            # Remove old metadata for packages replaced by this seed, avoiding
            # duplicate dist-info versions influencing pip and importlib.
            names = {p.name.removesuffix('.dist-info').rsplit('-', 1)[0].lower() for p in SEED.glob('*.dist-info')}
            for old in staging.glob('*.dist-info'):
                if old.name.removesuffix('.dist-info').rsplit('-', 1)[0].lower() in names:
                    shutil.rmtree(old)
            shutil.copytree(SEED, staging, dirs_exist_ok=True, symlinks=True)
            if not healthy(staging) or not dependencies_healthy(staging):
                raise RuntimeError('Certbot staged seed failed validation; existing packages retained')
            (staging / marker.name).write_text(version + '\n')
            uid, gid = int(os.environ.get('PUID', '1000')), int(os.environ.get('PGID', '1000'))
            for root, directories, files in os.walk(staging):
                os.chown(root, uid, gid)
                for name in directories + files:
                    os.chown(pathlib.Path(root) / name, uid, gid, follow_symlinks=False)
            # Keep the previous package tree until the replacement is committed.
            if backup.exists():
                raise RuntimeError('Certbot previous package tree needs recovery')
            if TARGET.exists():
                TARGET.rename(backup)
            try:
                staging.rename(TARGET)
            except BaseException:
                if backup.exists():
                    backup.rename(TARGET)
                raise
            if backup.exists():
                shutil.rmtree(backup)
        finally:
            if staging.exists():
                shutil.rmtree(staging)
        print('Certbot persistent packages reconciled with image seed', flush=True)
    if site.is_symlink():
        if site.readlink() != TARGET:
            raise RuntimeError('Certbot package symlink points to an unexpected location')
    else:
        shutil.rmtree(site)
        site.symlink_to(TARGET)
    if not healthy():
        raise RuntimeError('Certbot packages failed validation after persistence setup')
    subprocess.run([PYTHON, '-m', 'pip', 'check'], check=True)

if __name__ == '__main__':
    main()
