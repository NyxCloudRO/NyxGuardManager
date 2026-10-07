import subprocess,time,json,sys,os,re
from pathlib import Path
E=Path(os.environ['NYXGUARD_TEST_EVIDENCE'])
SOURCE=Path(os.environ['NYXGUARD_TEST_SOURCE'])
OUTER=os.environ['NYXGUARD_TEST_ENGINE']
version=sys.argv[1]
target=sys.argv[2] if len(sys.argv)>2 else 'nyxguardmanager:5.0.4-main1'
case=sys.argv[3] if len(sys.argv)>3 else version
assert version in ['5.0.1','5.0.2','5.0.3'] and re.fullmatch(r'[A-Za-z0-9_.-]+',case)
prefix=['docker','exec',OUTER]
def run(args,inp=None,check=True):
 p=subprocess.run(['docker','exec']+(['-i'] if inp is not None else [])+[OUTER]+args,input=inp,stdout=subprocess.PIPE,stderr=subprocess.STDOUT)
 if check and p.returncode:raise RuntimeError(p.stdout.decode()[-2000:])
 return p
label=subprocess.check_output(['docker','inspect','-f','{{index .Config.Labels "nyxguard.test.purpose"}}',OUTER]).decode().strip()
assert label=='main1-upgrade'
# Save the completed prior run before resetting this owned disposable engine.
names=run(['docker','ps','-a','--format','{{.Names}}']).stdout.decode().splitlines()
if names:
 run(['docker','run','--rm','--entrypoint','sh','-v','nyxguard_data:/state:ro','-v','/evidence:/e','jc21/mariadb-aria:latest','-c',f'test ! -d /state/.nyx-handover || cp -a /state/.nyx-handover /e/prior-handover-{case}'])
 run(['docker','run','--rm','--entrypoint','sh','-v','nyxguard_update_recovery:/r:ro','-v','/evidence:/e','jc21/mariadb-aria:latest','-c',f'tar -C /r -cf /e/prior-recovery-{case}.tar .'],check=False)
 run(['docker','rm','-f']+names)
volumes=run(['docker','volume','ls','--format','{{.Name}}']).stdout.decode().splitlines()
if volumes:run(['docker','volume','rm']+volumes)
withVpn=os.environ.get('NYXGUARD_TEST_WITH_VPN')=='1'
compose=(E/('upgrade-compose-full.yml' if withVpn else 'upgrade-compose.yml')).read_text().replace('nyxmael/nyxguardmanager:5.0.2',f'nyxmael/nyxguardmanager:{version}')
(E/f'compose-{case}.yml').write_text(compose)
run(['sh','-c',f'cp /evidence/compose-{case}.yml /opt/nyxguardmanager/docker-compose.yml; cp /evidence/upgrade.env /opt/nyxguardmanager/.env; chmod 600 /opt/nyxguardmanager/.env; echo {version} > /opt/nyxguardmanager/.version'])
if withVpn:run(['sh','-c','mkdir -p /dev/net; test -e /dev/net/tun || mknod /dev/net/tun c 10 200'])
composecmd=['docker','compose','--env-file','/opt/nyxguardmanager/.env','-f','/opt/nyxguardmanager/docker-compose.yml']
run(composecmd+['up','-d'])
def healthy():
 deadline=time.monotonic()+180
 while time.monotonic()<deadline:
  p=run(['docker','inspect','-f','{{.State.Health.Status}}','nyxguard-manager'],check=False)
  if p.stdout.strip()==b'healthy':
   if not withVpn or run(['docker','inspect','-f','{{.State.Health.Status}}','nyxguard-vpn-agent'],check=False).stdout.strip()==b'healthy':return
  if p.stdout.strip()==b'unhealthy':raise RuntimeError('Readiness became unhealthy')
  time.sleep(2)
 raise RuntimeError('Baseline failed readiness')
healthy()
code=(SOURCE/'release-source/5.0.4/tests/application-acceptance.mjs').read_bytes()
assert code.strip() and b'console.log(JSON.stringify(result))' in code, 'Empty/unrecognized application script'
def acceptance(seed,phase,expected=None):
 run(['docker','exec','-i','nyxguard-manager','sh','-c','cat > /tmp/application-acceptance.mjs'],inp=code)
 p=run(['docker','exec','-e','NYXGUARD_DISPOSABLE_ACCEPTANCE=1','-e','NYXGUARD_ACCEPTANCE_EVIDENCE=/data/safety-acceptance','-e',f'NYXGUARD_ACCEPTANCE_SEED={1 if seed else 0}','nyxguard-manager','sh','-c','mkdir -p /data/safety-acceptance; chmod 700 /data/safety-acceptance; node /tmp/application-acceptance.mjs'],check=False)
 (E/f'{case}-{phase}.log').write_bytes(p.stdout)
 if p.returncode:raise RuntimeError(f'Application acceptance failed {phase}; see private log')
 lines=p.stdout.decode().splitlines()
 receipts=[json.loads(line) for line in lines if line.startswith('{')]
 if len(receipts)!=1 or not all(receipts[0].get(key) for key in ['login','proxyAPI','settingsAPI','traffic','dataPreserved']):raise RuntimeError('Missing application receipt')
 expectedSchema={'5.0.1':42,'5.0.2':43,'5.0.3':45}[version] if seed or any(x in target for x in ['failure','never-listen','not-ready']) else 45
 if receipts[0]['migrations']!=(expected if expected is not None else expectedSchema):raise RuntimeError('Unexpected accepted schema')
 print(case,phase,'PASS',flush=True)
acceptance(True,'baseline')
# Record exact source image identity without exposing installed environment.
(E/f'{case}-source-image.json').write_bytes(run(['docker','inspect','-f','{{.Image}} {{.State.Health.Status}}','nyxguard-manager']).stdout)
expectedSource={'5.0.1':'sha256:a38e1f0aba5c88b36354b6f05852b31e28b830869fa56219b1bbdf5cb402d8d4','5.0.2':'sha256:a364c57b1ec427500f25ec606443eb630476431ad684b4fbd63a70a1bd2f9b36','5.0.3':'sha256:029c14b4f3a54950bd29a4a1e89cc8541165a16bc206bec43a34f02ca88d488f'}
assert run(['docker','inspect','-f','{{.Image}}','nyxguard-manager']).stdout.decode().strip()==expectedSource[version]
if 'held-proxy' in target:
 run(['docker','run','-d','--name','held-proxy','--network','nyxguardmanager_default','--entrypoint','node','nyxguardmanager:5.0.4-main1','-e',"require('net').createServer(s=>s.on('data',()=>console.log('CONNECT held'))).listen(8080,'0.0.0.0')"])
args=['docker','run','--rm','--network','none','--user','0:0','--entrypoint','node','-v','/var/run/docker.sock:/var/run/docker.sock','-v','/source/upgrade/same-major-bootstrap.mjs:/tmp/same-major-bootstrap.mjs:ro','-e',f'CURRENT_VERSION={version}','-e','TARGET_VERSION=5.0.4','-e',f'TARGET_IMAGE_REF={target}','-e','HOST_INSTALL_DIR=/opt/nyxguardmanager',target,'/tmp/same-major-bootstrap.mjs']
if case.startswith('built-in'):
 targetid=run(['docker','image','inspect','-f','{{.Id}}',target]).stdout.decode().strip()
 run(['docker','exec','-i','nyxguard-manager','sh','-c','cat > /tmp/apply-built-in.mjs'],inp=(E/'apply-built-in.mjs').read_bytes())
 p=run(['docker','exec','-e','ACCEPTANCE_TARGET_ID='+targetid,'nyxguard-manager','node','/tmp/apply-built-in.mjs'],check=False)
 (E/f'{case}-apply.log').write_bytes(p.stdout)
 if p.returncode:raise RuntimeError('Built-in activation failed')
 for _ in range(250):
  names=run(['docker','ps','-a','--filter','name=nyxguard-update-handover','--format','{{.Names}}']).stdout.decode().splitlines()
  if names:
   helper=names[0]
   status=run(['docker','inspect','-f','{{.State.Running}} {{.State.ExitCode}}',helper]).stdout.decode().strip()
   if status.startswith('false '):
    p=run(['docker','logs',helper],check=False);p.returncode=int(status.split()[1]);break
  time.sleep(1)
 else:raise RuntimeError('Built-in helper did not complete')
else:
 p=run(args,check=False)
(E/f'{case}-handover.log').write_bytes(p.stdout)
print(case,'handover exit',p.returncode,flush=True)
if any(x in target for x in ['failure','never-listen','not-ready']):
 if p.returncode==0:raise RuntimeError('Forced failure falsely accepted')
 if os.environ.get('NYXGUARD_TEST_REQUIRE_MUTATION')=='1':
  active=json.loads(run(['docker','exec','nyxguard-manager','cat','/data/.nyx-handover/active.json']).stdout)
  transaction=json.loads(run(['docker','exec','nyxguard-manager','cat','/data/.nyx-handover/'+active['id']+'.json']).stdout)['transaction']
  assert transaction['mutationPossible'] and transaction.get('restoreVerified') and transaction['phase']=='ROLLBACK_COMPLETE', 'Target fault and restore not exercised'
 restored=run(['docker','inspect','-f','{{.Image}} {{.State.Health.Status}}','nyxguard-manager']).stdout
 if restored!=(E/f'{case}-source-image.json').read_bytes():raise RuntimeError('Previous runtime not restored')
else:
 if p.returncode:raise RuntimeError(p.stdout.decode()[-2500:])
acceptance(False,'upgraded')
run(['docker','restart','nyxguard-manager'])
healthy()
acceptance(False,'restart')
(E/f'{case}-final-runtime.txt').write_bytes(run(['docker','inspect','-f','{{.Image}} {{.Config.Image}} {{.State.Health.Status}}','nyxguard-manager']).stdout)
print(case,'COMPLETE',flush=True)
