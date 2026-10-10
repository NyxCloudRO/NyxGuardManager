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
for name in ['upgrade/README.md','release-source/README.md']:
 require(f'Current Manager release: **{version}**' in (ROOT/name).read_text(),f'{name}: current release overview is stale')
for name in ['install.sh','update.sh']:
 require(subprocess.run(['bash','-n',str(ROOT/name)]).returncode==0,f'{name} syntax failed')
updater=(ROOT/'update.sh').read_text()
# The current updater is self-contained. Historical bootstrap files remain only
# for historical runbooks; their checksums are not current updater dependencies.
start=updater.index('#!/usr/bin/env python3',updater.index('NYXGUARD_HOST_UPGRADE_PY'))
end=updater.index('\nNYXGUARD_HOST_UPGRADE_PY\n',start)
try:compile(updater[start:end],'host-upgrade','exec')
except SyntaxError:require(False,'Embedded host updater Python syntax failed')
for command in ['install.sh','update.sh']:
 require('https://raw.githubusercontent.com/NyxCloudRO/NyxGuardManager/main/'+command+' | bash' in readme,f'Canonical root {command} instruction missing')
 require('https://raw.githubusercontent.com/NyxCloudRO/NyxGuardManager/main/'+command+' | sudo bash' in readme,f'Canonical sudo {command} instruction missing')
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
    if source=='sanitized-rootfs.tar' and (p.parent/'build-release.py').exists():continue
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
