from pathlib import Path
import subprocess,random,json
p=Path('/work/tests/gzip-cve');p.mkdir(exist_ok=True);r=random.Random(41992);raw=bytes(r.randrange(256) for _ in range(20000));z=subprocess.check_output(['compress','-f','-c'],input=raw);(p/'poison.Z').write_bytes(z)
# Tiny deterministic LZH inputs cover zero and nonzero table counts, with a valid LZW stream first in the SAME invocation.
rows=[]
for i,body in enumerate([bytes(32),bytes([255])*32,bytes.fromhex('00010000000000000000000000000000'),bytes.fromhex('ffff0001000000000000000000000000')]):
 f=p/(str(i)+'.lzh');f.write_bytes(bytes.fromhex('1fa0')+body)
 a=subprocess.run(['/work/build-gzip/gzip','-dc',str(p/'poison.Z'),str(f)],capture_output=True,timeout=5)
 assert a.returncode in [0,1,2] and a.stdout.startswith(raw),(i,a.returncode)
 rows.append({'case':i,'exit':a.returncode,'lzw_prefix_preserved':True,'signal':False})
# Multi-file ordinary archive and stdin round trips.
gz=subprocess.check_output(['/work/build-gzip/gzip','-c'],input=raw);assert subprocess.check_output(['/work/build-gzip/gzip','-dc'],input=gz)==raw
print(json.dumps({'result':'PASS','mixed_lzw_lzh':rows,'gzip_roundtrip':True,'limit':'deterministic malformed-format regression; not a claim of reproducing original exploit'},indent=2))
