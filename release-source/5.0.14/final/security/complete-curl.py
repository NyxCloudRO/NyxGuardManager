from pathlib import Path
import subprocess,os,shutil,re,json,hashlib
r=Path('/work/curl');f=r/'lib/http2.c';s=f.read_text();old='      second->req.p.http = http;\n      http2_data_setup(cf, second);';new='''      second->req.p.http = http;
      /* The legacy h2 setup retains the current receive buffer pointer.
         Allocate it before setup; Curl_multi_add_perform initializes it too
         late for a PUSH_PROMISE immediately followed by response headers. */
      if(Curl_preconnect(second)) {
        (void)Curl_close(&second);
        return NULL;
      }
      (void)Curl_pgrsTime(second, TIMER_STARTOP);
      (void)Curl_pgrsTime(second, TIMER_STARTSINGLE);
      http2_data_setup(cf, second);'''
assert s.count(old)==1;before=hashlib.sha256(f.read_bytes()).hexdigest();f.write_text(s.replace(old,new).replace('#include "transfer.h"', '#include "transfer.h"\n#include "progress.h"'));after=hashlib.sha256(f.read_bytes()).hexdigest()
for directory in ['build','build-gnutls']:
 f=r/'debian'/directory/'lib/http2.c';s=f.read_text();assert s.count(old)==1;f.write_text(s.replace(old,new).replace('#include "transfer.h"', '#include "transfer.h"\n#include "progress.h"'))
for directory in ['build','build-gnutls']:
 f=r/'debian'/directory/'lib/Makefile';s=f.read_text();f.write_text(s.replace('deb12u15+nyxguard1','deb12u15+nyxguard2'))
# Recompile version metadata along with changed HTTP/2 source, preserving all configure flags.
os.utime(r/'lib/version.c',None)
for directory in ['build','build-gnutls']:os.utime(r/'debian'/directory/'lib/version.c',None)
for directory in ['build','build-gnutls']:subprocess.run(['make','-C',str(r/'debian'/directory),'-j2'],check=True)
o=Path('/out-complete');o.mkdir();Path('/repackage').mkdir();records=[]
for package,directory,lib in [('libcurl4','build','libcurl'),('libcurl3-gnutls','build-gnutls','libcurl-gnutls'),('curl','build',None)]:
 olddeb=next(Path('/out').glob(package+'_*deb'));d=Path('/repackage')/package;subprocess.run(['dpkg-deb','-R',str(olddeb),str(d)],check=True)
 if lib:
  target=d/'usr/lib/x86_64-linux-gnu'/ (lib+'.so.4.8.0');shutil.copy2(r/'debian'/directory/'lib/.libs'/(lib+'.so.4.8.0'),target);subprocess.run(['strip','--strip-unneeded',str(target)],check=True)
 else:
  target=d/'usr/bin/curl';shutil.copy2(r/'debian'/directory/'src/.libs/curl',target);subprocess.run(['strip','--strip-unneeded',str(target)],check=True)
 f=d/'DEBIAN/control';f.write_text(f.read_text().replace('7.88.1-10+deb12u15+nyxguard1','7.88.1-10+deb12u15+nyxguard2'))
 f=d/'DEBIAN/md5sums';f.write_text(''.join(hashlib.md5((d/line.split(None,1)[1]).read_bytes()).hexdigest()+'  '+line.split(None,1)[1]+'\n' for line in f.read_text().splitlines()))
 out=o/(package+'_7.88.1-10+deb12u15+nyxguard2_amd64.deb');subprocess.run(['dpkg-deb','--build','--root-owner-group',str(d),str(out)],check=True);records.append({'package':package,'sha256':hashlib.sha256(out.read_bytes()).hexdigest()})
(o/'compatibility-fix-provenance.json').write_text(json.dumps({'source':'local compatibility correction for legacy HTTP2 buffer initialization; retain fourteen official advisory backports','file':'lib/http2.c','before':before,'after':after,'reason':'reproduced null buffer in on_frame_recv after accepted pushed stream','packages':records},indent=2))
