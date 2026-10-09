#!/usr/bin/env python3
"""Verify current publication contracts and source dependencies without deployment."""
import hashlib,json,pathlib,re,shlex,subprocess,sys
ROOT=pathlib.Path(__file__).resolve().parents[1]
def git(*args):return subprocess.check_output(['git','-C',str(ROOT),*args]).decode()
errors=[];warnings=[]
def require(condition,message):
 if not condition:errors.append(message)
version=(ROOT/'.version').read_text().strip();policy_file=ROOT/f'release-source/{version}/internal/release-policy.json';policy=json.loads(policy_file.read_text());agent=policy['agent']
require(policy['version']==version,'Current release policy differs from .version')
compose=(ROOT/'docker-compose.yml').read_text();readme=(ROOT/'README.md').read_text()
require(f'image: nyxmael/nyxguardmanager:{version}' in compose,'Compose Manager version is stale')
require(f'image: nyxmael/nyxguardmanager-vpn-agent:{agent}' in compose,'Compose Agent version differs from release policy')
manual=readme.split('```yaml',1)[1].split('```',1)[0]
require(f'image: nyxmael/nyxguardmanager:{version}' in manual,'README manual Compose Manager version is stale')
require(f'image: nyxmael/nyxguardmanager-vpn-agent:{agent}' in manual,'README Agent version differs from release policy')
for name in ['README.md','docs/vpn-client.md','docs/proxmox-lxc-vpn.md','docs/advanced-recovery.md']:
 text=(ROOT/name).read_text()
 for pinned in re.findall(r'(?:FORCE_TAG|APP_TAG)=(5\.0\.\d+)',text):
  require(pinned==version,f'{name}: stale current instruction pin {pinned}')
for name in ['upgrade/README.md','release-source/README.md']:
 require(f'Current Manager release: **{version}**' in (ROOT/name).read_text(),f'{name}: current release overview is stale')
for name in ['install.sh','update.sh']:
 require(subprocess.run(['bash','-n',str(ROOT/name)]).returncode==0,f'{name} syntax failed')
 require(f'{version}' in (ROOT/name).read_text(),f'{name} lacks current release selector')
updater=(ROOT/'update.sh').read_text()
for variable,file in [('CLI_BOOTSTRAP','upgrade/cli-bootstrap.mjs'),('MANAGER_ONLY','upgrade/manager-only-handover.mjs'),('SAME_MAJOR','upgrade/same-major-bootstrap.mjs')]:
 value=re.search(variable+r'_SHA256="([a-f0-9]{64})"',updater)
 require(value is not None,f'{variable} checksum missing')
 if value:require(hashlib.sha256((ROOT/file).read_bytes()).hexdigest()==value[1],f'{file} differs from pinned updater checksum')
files=git('ls-files').splitlines()
for name in files:
 if pathlib.PurePosixPath(name).name=='Dockerfile':
  p=ROOT/name
  for line in p.read_text().splitlines():
   if line.startswith('FROM ') and 'nyxguardmanager:' in line and not 'nyxmael/' in line:warnings.append(f'{name}: historical build requires a documented local base image; retain pending reproducibility review')
   if not line.startswith(('COPY ','ADD ')) or '--from=' in line:continue
   args=shlex.split(line)[1:];args=[x for x in args if not x.startswith('--')]
   for source in args[:-1]:
    if '$' in source or source.startswith(('http:','https:')):continue
    candidates=[ROOT/source,p.parent/source]
    require(any(x.exists() or list(x.parent.glob(x.name)) for x in candidates),f'{name}: missing build input {source}')
 if name.endswith('.md') and (ROOT/name).exists():
  text=(ROOT/name).read_text()
  for target in re.findall(r'!?\[[^\]]*\]\(([^)]+)\)',text):
   target=target.split(' "',1)[0].strip('<>');path=target.split('#',1)[0]
   if not path or re.match(r'(?:https?:|mailto:|app:)',path):continue
   require(((ROOT/name).parent/path).exists(),f'{name}: missing relative link target {path}')
print('\n'.join('REVIEW: '+x for x in warnings))
for error in errors:print('FAIL: '+error)
if errors:sys.exit(1)
result=subprocess.run([sys.executable,str(ROOT/'tools/publication-hygiene.py'),*sys.argv[1:]])
print(f'Publication dependency/version checks: {"PASS" if result.returncode==0 else "FAIL"}; current Manager {version}, Agent {agent}')
sys.exit(result.returncode)
