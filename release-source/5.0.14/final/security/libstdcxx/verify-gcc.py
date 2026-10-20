from pathlib import Path
import subprocess,json,re
p=Path('/evidence');new=p/'gcc-source/gcc-12-12.2.0/libstdcxx-posix-build/src/.libs/libstdc++.so.6.0.30';old=Path('/usr/lib/x86_64-linux-gnu/libstdc++.so.6.0.30')
def output(a):return subprocess.check_output(a,text=True)
def symbols(f):
 out=output(['readelf','--dyn-syms','--wide',str(f)])
 return {x.split()[-1] for x in out.splitlines() if len(x.split())>=8 and x.split()[6]!='UND' and x.split()[4] in ('GLOBAL','WEAK','UNIQUE') and x.split()[5]=='DEFAULT'}
a,b=symbols(old),symbols(new)
(p/'libstdcxx-symbols-old.txt').write_text('\n'.join(sorted(a)));(p/'libstdcxx-symbols-new.txt').write_text('\n'.join(sorted(b)))
d={}
for label,f in [('old',old),('new',new)]:
 s=output(['readelf','--version-info','--wide',str(f)]);(p/f'libstdcxx-{label}-versions.txt').write_text(s)
 # Public version definition names, independent of version-index order.
 d[label]={'soname':re.findall(r'SONAME.*?\[(.*?)\]',output(['readelf','-d',str(f)])),'definitions':sorted(set(re.findall(r'Name: ((?:GLIBCXX|CXXABI)_[^\s]+)',s))),'undefined':output(['nm','-D','--undefined-only',str(f)])}
r={'old_count':len(a),'new_count':len(b),'removed':sorted(a-b),'added':sorted(b-a),'versions':d,'soname_equal':d['old']['soname']==d['new']['soname'],'version_definitions_equal':d['old']['definitions']==d['new']['definitions']}
(p/'libstdcxx-abi.json').write_text(json.dumps(r,indent=2));print({k:v for k,v in r.items() if k!='versions'})
assert not a-b and not b-a and r['soname_equal'] and r['version_definitions_equal']
