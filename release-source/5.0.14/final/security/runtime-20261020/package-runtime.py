from pathlib import Path
import shutil,json,hashlib,re,subprocess,os
p=Path('/work');r=p/'release-rootfs';stage=p/'package-stage-v2';stage.mkdir(exist_ok=True);status=(r/'var/lib/dpkg/status').read_text();controls={}
for stanza in status.split('\n\n'):
 a=stanza.splitlines()
 if a and a[0].startswith('Package: '):controls[a[0].split(': ',1)[1]]=stanza
changes={
'libexpat1':{'/lib/x86_64-linux-gnu/libexpat.so.1.8.10':p/'build-expat/lib/.libs/libexpat.so.1.8.10','/usr/lib/x86_64-linux-gnu/libexpatw.so.1.8.10':p/'build-expat-ushort/libexpatw.so.1.8.10'},
'libtasn1-6':{'/usr/lib/x86_64-linux-gnu/libtasn1.so.6.6.3':p/'build-libtasn1/lib/.libs/libtasn1.so.6.6.3'},
'libldap-2.5-0':{'/usr/lib/x86_64-linux-gnu/libldap-2.5.so.0.1.8':p/'build-openldap/libraries/libldap/.libs/libldap-2.5.so.0.1.8'},
'libssl3':{'/usr/lib/x86_64-linux-gnu/libssl.so.3':p/'build-openssl/libssl.so.3'},
'gzip':{'/bin/gzip':p/'build-gzip/gzip'},
'python3.11-minimal':{'/usr/bin/python3.11':p/'build-python-core/python'},
'python3.11':{},'libpython3.11-minimal':{},'libpython3.11-stdlib':{}}
versions={name:re.search(r'^Version: (.*)$',controls[name],re.M)[1] for name in changes};manifest=[]
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
 deb=root/'DEBIAN';deb.mkdir();lines=[];skip=False
 for line in controls[name].splitlines():
  if not line.startswith(' '):skip=line.split(':',1)[0] in ['Status','Conffiles','Config-Version','Triggers-Pending','Triggers-Awaited']
  if skip:continue
  if line.startswith('Version: '):line='Version: '+versions[name]+'+nyxguard1'
  elif line.startswith(('Depends:','Pre-Depends:','Recommends:')) and name.startswith(('python','libpython')):line=line.replace('= 3.11.2-6+deb12u9)', '= 3.11.2-6+deb12u9+nyxguard1)')
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
 package=p/'packages'/(name+'_'+versions[name]+'+nyxguard1_amd64.deb');subprocess.run(['dpkg-deb','--build','--root-owner-group',str(root),str(package)],check=True,stdout=subprocess.DEVNULL)
 manifest.append({'package':name,'version':versions[name]+'+nyxguard1','deb':package.name,'sha256':hashlib.sha256(package.read_bytes()).hexdigest(),'changed_runtime_files':{n:hashlib.sha256((root/n.lstrip('/')).read_bytes()).hexdigest() for n in replace},'unchanged_packages_bumped_for_exact_python_dependencies':not bool(replace)})
(p/'package-manifest.json').write_text(json.dumps(manifest,indent=2)+'\n');print('Prepared',len(manifest),'packages; unchanged package payload retained; ACL not integrated')
