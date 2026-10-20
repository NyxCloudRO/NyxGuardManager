from pathlib import Path
import json,hashlib,subprocess,tarfile,shutil
root=Path('/app');new=json.loads(Path('/inputs/package.json').read_text());old=json.loads((root/'package.json').read_text());assert old['dependencies']==new['dependencies'];assert old['version']==new['version']=='5.0.14'
oldlock=json.loads((root/'package-lock.json').read_text());newlock=json.loads(Path('/inputs/package-lock.json').read_text());changed=[k for k in set(oldlock['packages'])|set(newlock['packages']) if oldlock['packages'].get(k)!=newlock['packages'].get(k)];assert changed==['node_modules/http-cache-semantics'],changed
assert hashlib.sha256(Path('/inputs/cache.tgz').read_bytes()).hexdigest()=='d75e1e6a11587954da5e2f0e2b5c4b397a16d28cc2f7bdf64e9027fc2fe593ee'
with tarfile.open('/inputs/cache.tgz') as t:
 for m in t.getmembers():
  if not m.isfile():continue
  rel=Path(m.name).relative_to('package');assert '..' not in rel.parts
  dest=root/'node_modules/http-cache-semantics'/rel;dest.parent.mkdir(parents=True,exist_ok=True);dest.write_bytes(t.extractfile(m).read())
for name in ['package.json','package-lock.json']:shutil.copy2(Path('/inputs')/name,root/name)
subprocess.run(['dpkg','--force-confold','-i',*[str(f) for path in ['/base-packages','/curl-packages'] for f in sorted(Path(path).glob('*.deb'))]],check=True)
provenance=root/'security-provenance';provenance.mkdir(exist_ok=True);shutil.copy2('/inputs/build-provenance.json',provenance/'release-integration.json');shutil.copy2('/curl-packages/compatibility-fix-provenance.json',provenance/'curl-compatibility.json')
