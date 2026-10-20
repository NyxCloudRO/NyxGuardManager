from pathlib import Path
import shutil,json,hashlib,re,subprocess,os
p=Path('/work');r=Path('/previous/release-rootfs');stage=p/'package-stage';stage.mkdir(exist_ok=True)
controls={}
for stanza in (r/'var/lib/dpkg/status').read_text().split('\n\n'):
 a=stanza.splitlines()
 if a and a[0].startswith('Package: '):controls[a[0].split(': ',1)[1]]=stanza
changes={'coreutils':{'/bin/cp':p/'build-coreutils/src/cp','/bin/mv':p/'build-coreutils/src/mv'},'tar':{'/bin/tar':p/'build-tar/src/tar'},'libacl1':{'/usr/lib/x86_64-linux-gnu/libacl.so.1.1.2301':p/'qualified-lib/libacl.so.1'}}
manifest=[]
for name,replace in changes.items():
 root=stage/name;root.mkdir();info=r/'var/lib/dpkg/info';lst=info/(name+'.list')
 if not lst.exists():lst=info/(name+':amd64.list')
 prefix=lst.name[:-5]
 for line in lst.read_text().splitlines():
  n=line.lstrip('/');src=r/n;dest=root/n
  if n in ['', '.']:continue
  if not src.exists() and not src.is_symlink():continue
  if src.is_symlink() and n in ['lib','lib64','bin','sbin']:dest.mkdir(parents=True,exist_ok=True)
  elif src.is_symlink():dest.parent.mkdir(parents=True,exist_ok=True);dest.symlink_to(os.readlink(src))
  elif src.is_dir():dest.mkdir(parents=True,exist_ok=True);os.chmod(dest,src.stat().st_mode & 0o7777)
  else:dest.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(src,dest)
 for n,src in replace.items():
  dest=root/n.lstrip('/');assert dest.exists(),(name,n);mode=dest.stat().st_mode & 0o7777;shutil.copy2(src,dest);subprocess.run(['strip','--strip-unneeded',str(dest)],check=True);os.chmod(dest,mode)
 oldversion=re.search(r'^Version: (.*)$',controls[name],re.M)[1]
 version='2.4.0-0nyxguard1' if name=='libacl1' else oldversion+'+nyxguard1'
 deb=root/'DEBIAN';deb.mkdir();lines=[];skip=False
 for line in controls[name].splitlines():
  if not line.startswith(' '):skip=line.split(':',1)[0] in ['Status','Conffiles','Config-Version','Triggers-Pending','Triggers-Awaited']
  if skip:continue
  if line.startswith('Version: '):line='Version: '+version
  elif line.startswith('Maintainer:'):line='Maintainer: NyxGuard release engineering <support@nyxcloud.ro>'
  lines.append(line)
 (deb/'control').write_text('\n'.join(lines)+'\n')
 for ext in ['preinst','postinst','prerm','postrm','conffiles','triggers']:
  src=info/(prefix+'.'+ext)
  if src.exists():shutil.copy2(src,deb/ext)
 md5=[]
 for f in sorted(root.rglob('*')):
  if f.is_file() and not f.is_symlink() and deb not in f.parents:md5.append(hashlib.md5(f.read_bytes()).hexdigest()+'  '+str(f.relative_to(root)))
 (deb/'md5sums').write_text('\n'.join(md5)+'\n')
 package=p/'packages'/(name+'_'+version+'_amd64.deb');subprocess.run(['dpkg-deb','--build','--root-owner-group',str(root),str(package)],check=True)
 manifest.append({'package':name,'version':version,'deb':package.name,'sha256':hashlib.sha256(package.read_bytes()).hexdigest(),'changed_runtime_files':{n:hashlib.sha256((root/n.lstrip('/')).read_bytes()).hexdigest() for n in replace},'note':'ACL 2.4 implementation retains existing SONAME, legacy installed filename and all old exports; caller packages retain other payloads.'})
(p/'package-manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
