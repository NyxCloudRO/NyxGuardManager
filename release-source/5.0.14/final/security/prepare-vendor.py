#!/usr/bin/env python3
"""Recover omitted official vendor archives by pinned hashes; never replace mismatches."""
import pathlib,json,hashlib,urllib.request
root=pathlib.Path(__file__).resolve().parent
entries=[]
for folder in ['vendor','libc-vendor','curl-vendor']:
 p=root/folder/'manifest.json'
 if p.exists():
  for e in json.loads(p.read_text()):
   if 'url' in e and 'sha256' in e:entries.append((root/folder/e['file'],e))
p=root/'vendor/sqlite-manifest.json'
if p.exists():
 e=json.loads(p.read_text());entries.append((root/'vendor/sqlite-autoconf-3540100.tar.gz',e))
for target,e in entries:
 data=target.read_bytes() if target.exists() else urllib.request.urlopen(e['url'],timeout=120).read()
 if hashlib.sha256(data).hexdigest()!=e['sha256']:raise RuntimeError('Vendor hash mismatch: '+target.name)
 if not target.exists():target.write_bytes(data)
print('All official vendor inputs match pinned SHA256 values')
