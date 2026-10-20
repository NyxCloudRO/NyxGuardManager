from pathlib import Path
import hashlib,json,os,re
root=Path('/app');revision=os.environ['BUILD_REVISION']
for name in ['package.json','package-lock.json']:
 p=root/name;data=json.loads(p.read_text());data['version']='5.0.15'
 if name=='package-lock.json':data['packages']['']['version']='5.0.15'
 p.write_text(json.dumps(data,indent=2)+'\n')
p=root/'internal/release-policy.json';data=json.loads(p.read_text());data['version']='5.0.15';data['sources']['5.0.14']=49;p.write_text(json.dumps(data,indent=2)+'\n')
f=root/'frontend';assets=f/'assets';mapping={p.name:'asset-515-'+hashlib.sha256(p.name.encode()).hexdigest()[:16]+p.suffix for p in assets.iterdir() if p.suffix in ['.js','.css']}
# Replace all graph edges together so cached older modules cannot mix with this release.
pattern=re.compile('|'.join(re.escape(n) for n in sorted(mapping,key=len,reverse=True)))
for p in list(f.rglob('*')):
 if not p.is_file() or p.suffix not in ['.js','.css','.html']:continue
 text=p.read_text();text=pattern.sub(lambda m:mapping[m[0]],text).replace('5.0.14','5.0.15');p.write_text(text)
for old,new in mapping.items():(assets/old).rename(assets/new)
p=f/'nyxguard-build.json';data=json.loads(p.read_text());data.update(version='5.0.15',sourceRevision=revision,task='stability-hotfix',assets={p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(assets.iterdir()) if p.is_file()});p.write_text(json.dumps(data,indent=2)+'\n')
p=root/'CHANGELOG_PUBLIC.md';p.write_text(Path('/tmp/nyx515-notes.md').read_text()+'\n'+p.read_text())
