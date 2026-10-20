import pathlib,json,hashlib,subprocess,os,shutil
v=pathlib.Path('/vendor');m=json.loads((v/'manifest.json').read_text())
for e in m:assert hashlib.sha256((v/e['file']).read_bytes()).hexdigest()==e['sha256'],e['file']
subprocess.run(['dpkg-source','--no-check','-x',str(v/'curl_7.88.1-10+deb12u15.dsc'),'/work/curl'],check=True)
r=pathlib.Path('/work/curl');subprocess.run(['patch','--batch','--fuzz=0','-p1','-i',str(v/'curl-7.88.1-compatible-security.patch')],cwd=r,check=True)
p=r/'debian/changelog';p.write_text('curl (7.88.1-10+deb12u15+nyxguard1) bookworm; urgency=high\n\n  * Compatible fourteen-advisory backport; preserve protocols and TLS backends.\n\n -- NyxGuard Release Engineering <release@example.invalid>  Mon, 19 Oct 2026 00:00:00 +0000\n\n'+p.read_text())
env={**os.environ,'DEB_BUILD_OPTIONS':'parallel=4 nocheck','DEB_BUILD_PROFILES':'pkg.curl.no-nss nocheck','SOURCE_DATE_EPOCH':'1792368000'}
# The baseline ships OpenSSL and GnuTLS libraries; no NSS library is removed.
subprocess.run(['dpkg-buildpackage','-B','-uc','-us','-d','-j4'],cwd=r,env=env,check=True)
o=pathlib.Path('/out');o.mkdir(exist_ok=True)
for prefix in ['curl_','libcurl4_','libcurl3-gnutls_']:
 matches=list(r.parent.glob(prefix+'*.deb'));assert len(matches)==1,(prefix,matches);shutil.copy2(matches[0],o/matches[0].name)
(o/'source-manifest.json').write_bytes((v/'manifest.json').read_bytes())
