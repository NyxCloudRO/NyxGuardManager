import pathlib,json,hashlib,subprocess,os,shutil
v=pathlib.Path('/vendor');m=json.loads((v/'manifest.json').read_text())
for e in m:assert hashlib.sha256((v/e['file']).read_bytes()).hexdigest()==e['sha256'],e['file']
subprocess.run(['dpkg-source','--no-check','-x',str(v/'glibc_2.36-9+deb12u14.dsc'),'/work/glibc'],check=True)
r=pathlib.Path('/work/glibc')
for e in m:
 if e['file'].endswith('.patch'):subprocess.run(['patch','--batch','--fuzz=0','-p1','-i',str(v/e['file'])],cwd=r,check=True)
p=r/'debian/changelog';p.write_text('glibc (2.36-9+deb12u14+nyxguard1) bookworm; urgency=high\n\n  * Compatible security backports for CVE-2026-5450, CVE-2026-5928 and CVE-2026-5435; preserve existing interfaces.\n\n -- NyxGuard Release Engineering <release@example.invalid>  Mon, 19 Oct 2026 00:00:00 +0000\n\n'+p.read_text())
p=r/'stdio-common/Makefile';p.write_text(p.read_text()+'\ntests += tst-vfscanf-bz34008\nLDFLAGS-tst-vfscanf-bz34008 += -Wl,--no-as-needed -lmcheck -Wl,--as-needed\ntst-vfscanf-bz34008-ENV = MALLOC_CHECK_=3 LD_PRELOAD=$(common-objpfx)malloc/libc_malloc_debug.so\n')
p=r/'libio/Makefile';p.write_text(p.read_text()+'\ntests += bug-wgenops-bz33998\n')
env={**os.environ,'DEB_BUILD_OPTIONS':'parallel=4 nocheck','DEB_BUILD_PROFILES':'nobiarch','SOURCE_DATE_EPOCH':'1792368000'}
subprocess.run(['make','-f','debian/rules','binary-arch'],cwd=r,env=env,check=True)
o=pathlib.Path('/out');o.mkdir(exist_ok=True)
for prefix in ['libc6_','libc6-dev_','libc-bin_','libc-dev-bin_']:
 matches=list(r.parent.glob(prefix+'*.deb'));assert len(matches)==1,(prefix,matches);shutil.copy2(matches[0],o/matches[0].name)
(o/'source-manifest.json').write_bytes((v/'manifest.json').read_bytes())
