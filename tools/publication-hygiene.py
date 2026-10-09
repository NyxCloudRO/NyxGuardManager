#!/usr/bin/env python3
"""Scan Git, release archives and a Git-based Docker context without printing values."""
import argparse, fnmatch, hashlib, io, json, math, os, pathlib, re, subprocess, sys, tarfile, zipfile
ROOT=pathlib.Path(__file__).resolve().parents[1]
RULES={
 'infrastructure-id':re.compile(r'\b(?:CT|VM)[0-9]{2,}\b'),
 'private-home':re.compile(r'/home/[^/\s"\']+/|/Users/[^/\s"\']+/'),
 'private-key':re.compile(r'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----'),
 'provider-token':re.compile(r'\b(?:ghp_[A-Za-z0-9]{36}|github_pat_[A-Za-z0-9_]{30,}|AKIA[A-Z0-9]{16})\b'),
 'embedded-secret':re.compile(r'''(?i)\b(?:password|private_?key|api_?key|access_?token|client_?secret)\s*[:=]\s*["']([^"'\n]{16,})["']'''),
 'embedded-env-secret':re.compile(r'(?i)\b[A-Z0-9_]*(?:PASSWORD|PRIVATE_KEY|API_KEY|ACCESS_TOKEN|CLIENT_SECRET)\s*=\s*([A-Za-z0-9+/_=-]{16,})'),
 'operator-report':re.compile(r'(?i)^#{1,3}.*(?:internal incident|incident findings|DEV cleanup|PROD deployment|owner-operated)'),
 'private-address':re.compile(r'\b(?:10(?:\.\d{1,3}){3}|192\.168(?:\.\d{1,3}){2}|172\.(?:1[6-9]|2\d|3[01])(?:\.\d{1,3}){2})\b'),
}
MAX_FILE=32*1024*1024
MAX_ARCHIVE=512*1024*1024
findings=[]
allow_file=ROOT/'tools/publication-hygiene-allowlist.json'
allow=json.loads(allow_file.read_text()) if allow_file.exists() else []
exceptions={(x['path'],x['rule'],x['lineSHA256']) for x in allow if x.get('reason')}
private_patterns=[]
if os.environ.get('NYXGUARD_PUBLICATION_DENYLIST'):
 private_patterns=[re.compile(x.strip(),re.I) for x in pathlib.Path(os.environ['NYXGUARD_PUBLICATION_DENYLIST']).read_text().splitlines() if x.strip() and not x.startswith('#')]
def report(name,rule,line=0):findings.append({'path':name,'rule':rule,'line':line})
def entropy(value):return -sum((value.count(c)/len(value))*math.log2(value.count(c)/len(value)) for c in set(value))
def check(name,data):
 base=pathlib.PurePosixPath(name).name
 if re.search(r'(?i)(?:incident-report|operator-notes|production-dump|private-runbook|dev-cleanup-report|runtime-inspect)',base):report(name,'operator-artifact')
 if (base=='.env' or base.startswith('.env.') and base!='.env.example') or re.search(r'(?i)(?:database.*\.sql|support-bundle.*\.(?:json|zip)|update\.log|vault\.key|recovery.*\.tar(?:\.gz)?)$',base):report(name,'operational-artifact')
 if name.endswith(('.tar','.tar.gz','.tgz','.zip')):
  if len(data)>MAX_ARCHIVE:report(name,'archive-review-required');return
  try:
   if name.endswith('.zip'):
    with zipfile.ZipFile(io.BytesIO(data)) as z:
     total=0
     for item in z.infolist():
      total+=item.file_size
      if total>MAX_ARCHIVE:raise ValueError('Archive size limit')
      if not item.is_dir():
       if item.file_size>MAX_FILE:report(name+'!'+item.filename,'large-file-review-required')
       else:check(name+'!'+item.filename,z.read(item))
   else:
    with tarfile.open(fileobj=io.BytesIO(data),mode='r:*') as t:
     total=0
     for item in t:
      total+=item.size
      if total>MAX_ARCHIVE:raise ValueError('Archive size limit')
      if item.isfile():
       if item.size>MAX_FILE:report(name+'!'+item.name,'large-file-review-required')
       else:check(name+'!'+item.name,t.extractfile(item).read())
  except (ValueError,tarfile.TarError,zipfile.BadZipFile):report(name,'invalid-or-oversized-archive')
  return
 # Images/fonts are binary; arbitrary compressed bytes are not text evidence.
 if b'\0' in data[:8192]:return
 try:text=data.decode('utf8')
 except UnicodeDecodeError:return
 lines=text.splitlines()
 example_document=name.endswith('.md') and bool(re.search(r'(?i)(?:illustrative|synthetic|example|placeholder) (?:addresses|network|identities|values)|addresses and identities.*illustrative placeholders',text))
 for number,line in enumerate(lines,1):
  for rule,pattern in RULES.items():
   matches=list(pattern.finditer(line))
   if not matches:continue
   if rule=='private-address' and (example_document or re.search(r'(?i)example|placeholder|synthetic',line)):continue
   if rule in ['embedded-secret','embedded-env-secret'] and all('${' in m.group(1) or '<' in m.group(1) or re.search(r'(?i)CHANGE.?ME|EXAMPLE|PLACEHOLDER|DUMMY',m.group(1)) or entropy(m.group(1))<3.0 for m in matches):continue
   key=(name,rule,hashlib.sha256(line.encode()).hexdigest())
   # Archive paths use the same narrowly reviewed source exceptions.
   source_name=name.split('!',1)[-1]
   source_name=re.sub(r'^NyxGuardManager-[^/]+/','',source_name)
   if key in exceptions or (source_name,rule,key[2]) in exceptions:continue
   report(name,rule,number)
  if any(p.search(line) for p in private_patterns):report(name,'private-denylist',number)
def git(*args):return subprocess.check_output(['git','-C',str(ROOT),*args])
def main():
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('--staged',action='store_true');p.add_argument('--assets',type=pathlib.Path);p.add_argument('--package',type=pathlib.Path);p.add_argument('--context',action='store_true',help='Audit the tracked Docker context and untracked files not excluded by .dockerignore');p.add_argument('--json',action='store_true');a=p.parse_args()
 names=git('diff','--cached','--name-only','--diff-filter=ACMR','-z') if a.staged else git('ls-files','-z')
 count=0
 for b in names.split(b'\0'):
  if not b:continue
  name=b.decode();path=ROOT/name
  if not a.staged and (not path.is_file() or path.is_symlink()):continue
  data=git('show',':'+name) if a.staged else path.read_bytes();count+=1
  if len(data)>MAX_FILE:report(name,'large-file-review-required')
  else:check(name,data)
 if a.context:
  patterns=[x.strip() for x in (ROOT/'.dockerignore').read_text().splitlines() if x.strip() and not x.startswith('#')]
  for b in git('ls-files','--others','--exclude-standard','-z').split(b'\0'):
   if not b:continue
   name=b.decode()
   excluded=False
   for pattern in patterns:
    neg=pattern.startswith('!');pattern=pattern.lstrip('!').rstrip('/')
    if any(fnmatch.fnmatch(name,pattern) or fnmatch.fnmatch(part,pattern) or name.startswith(pattern+'/') for part in pathlib.PurePosixPath(name).parts):excluded=not neg
   if not excluded:report(name,'untracked-build-context')
 for path in ([a.package] if a.package else [])+ (sorted(x for x in a.assets.rglob('*') if x.is_file()) if a.assets else []):
  if path.stat().st_size>MAX_ARCHIVE:report(str(path),'large-file-review-required')
  else:check(str(path),path.read_bytes());count+=1
 result={'filesScanned':count,'violations':findings,'result':'FAIL' if findings else 'PASS'}
 if a.json:print(json.dumps(result,indent=2))
 else:
  for f in findings:print(f"{f['path']}:{f['line']}: {f['rule']}")
  print(f"{result['result']}: {count} files; {len(findings)} violations (values withheld)")
 return bool(findings)
if __name__=='__main__':sys.exit(main())
