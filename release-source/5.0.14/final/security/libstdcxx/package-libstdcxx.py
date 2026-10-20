from pathlib import Path
import subprocess,json,shutil,hashlib,re
p=Path('/evidence');r=p/'libstdcxx-package-v2';r.mkdir();(r/'DEBIAN').mkdir()
status=subprocess.check_output(['dpkg-query','-s','libstdc++6:amd64'],text=True)
# Retain installed package contents and maintainer scripts, changing only runtime and truthful custom metadata.
files=subprocess.check_output(['dpkg-query','-L','libstdc++6:amd64'],text=True).splitlines()
for n in files:
 s=Path(n)
 if n=='/.' or not s.exists():continue
 d=r/s.relative_to('/')
 if s.is_symlink():
  d.parent.mkdir(parents=True,exist_ok=True);d.symlink_to(s.readlink())
 elif s.is_dir():d.mkdir(parents=True,exist_ok=True)
 else:d.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(s,d)
for suffix in ['postinst','prerm','postrm','triggers','conffiles']:
 s=Path('/var/lib/dpkg/info/libstdc++6:amd64.'+suffix)
 if s.exists():shutil.copy2(s,r/'DEBIAN'/suffix)
lines=[]
for l in status.splitlines():
 if l.startswith(('Status:','Config-Version:')):continue
 if l.startswith('Version:'):l='Version: 12.2.0-14+deb12u1+nyxguard1'
 lines.append(l)
(r/'DEBIAN/control').write_text('\n'.join(lines)+'\n')
s=p/'gcc-source/gcc-12-12.2.0/libstdcxx-posix-build/src/.libs/libstdc++.so.6.0.30';d=r/'usr/lib/x86_64-linux-gnu/libstdc++.so.6.0.30';shutil.copy2(s,d);subprocess.run(['strip','--strip-unneeded',str(d)],check=True)
prov=json.loads((p/'gcc-backport-provenance.json').read_text());prov.update({'package_version':'12.2.0-14+deb12u1+nyxguard1','runtime_sha256':hashlib.sha256(d.read_bytes()).hexdigest(),'exported_symbols':5875,'removed_symbols':0,'added_symbols':0,'soname':'libstdc++.so.6','generated_thread_header':'libgcc/gthr-default.h -> gthr-posix.h','configure_script':'build-gcc-posix.sh'})
x=r/'usr/share/doc/nyxguard-security/libstdcxx-aligned-new.json';x.parent.mkdir(parents=True,exist_ok=True);x.write_text(json.dumps(prov,indent=2)+'\n');(p/'libstdcxx-package-provenance.json').write_text(json.dumps(prov,indent=2)+'\n')
# Regenerate md5 manifest after the replacement; don't retain stale Debian checksums.
checks=[]
for f in sorted(r.rglob('*')):
 if f.is_file() and not f.is_symlink() and 'DEBIAN' not in f.relative_to(r).parts:checks.append(hashlib.md5(f.read_bytes()).hexdigest()+'  '+str(f.relative_to(r)))
(r/'DEBIAN/md5sums').write_text('\n'.join(checks)+'\n');out=p/'packages';out.mkdir(exist_ok=True)
subprocess.run(['dpkg-deb','--build','--root-owner-group',str(r),str(out/'libstdc++6_12.2.0-14+deb12u1+nyxguard1_amd64.deb')],check=True)
