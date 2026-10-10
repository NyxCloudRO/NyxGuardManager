#!/usr/bin/env python3
"""Build without inheriting historical runtime files or credential-bearing layers."""
import argparse,pathlib,shutil,subprocess,tarfile,tempfile,uuid
SOURCE=pathlib.Path(__file__).resolve().parent
BASE='nyxmael/nyxguardmanager@sha256:28bdcb25e59c5b90119a975aa448a7f865872d387549bcc37fe3e930ac0d5985'
# Retain empty mount/runtime directories, never their inherited operational content.
EMPTY={'run','tmp','var/tmp','data','etc/letsencrypt','var/lib/mysql','var/lib/nyxguard-licensing','var/lib/nyxguard-vpn','var/log','root'}
REMOVE={'etc/hostname','etc/hosts','etc/resolv.conf','etc/machine-id','var/lib/dbus/machine-id','app/dev-tests','app/node_modules/node-gyp/test','opt/certbot-site-packages-seed/acme/_internal/tests','opt/certbot-site-packages-seed/certbot/tests','usr/local/lib/luarocks/rocks-5.1/lua-resty-openidc/1.8.0-1/doc/README.md'}
def call(*args):subprocess.run(args,check=True)
def main():
 p=argparse.ArgumentParser();p.add_argument('--tag',default='nyxguardmanager:5.0.10-candidate');p.add_argument('--revision',required=True);a=p.parse_args()
 call('docker','pull',BASE)
 container='nyxguard-release-source-'+uuid.uuid4().hex[:12]
 with tempfile.TemporaryDirectory(prefix='nyxguard-clean-build-') as temp:
  work=pathlib.Path(temp)
  try:
   call('docker','create','--name',container,'--entrypoint','/bin/true',BASE)
   call('docker','export','-o',str(work/'export.tar'),container)
   with tarfile.open(work/'export.tar') as src,tarfile.open(work/'sanitized-rootfs.tar','w') as dst:
    for member in src:
     name=member.name.removeprefix('./').rstrip('/')
     if name in REMOVE or any(name.startswith(x+'/') for x in EMPTY|REMOVE):continue
     # Nonempty runtime/storage symlinks must not import an external identity.
     if name in EMPTY and not member.isdir():continue
     dst.addfile(member,src.extractfile(member) if member.isfile() else None)
  finally:
   subprocess.run(['docker','rm','-fv',container],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
  (work/'export.tar').unlink()
  for name in ['Dockerfile','patch-version.mjs','patch-upgrade.mjs']:shutil.copy2(SOURCE/name,work/name)
  shutil.copytree(SOURCE/'internal',work/'internal')
  call('docker','build','--build-arg','NYXGUARD_SOURCE_REVISION='+a.revision,'-t',a.tag,str(work))
if __name__=='__main__':main()
