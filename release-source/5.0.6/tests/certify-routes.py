import os
assert os.environ.get("NYXGUARD_DISPOSABLE_CERTIFICATION") == "1", "Explicit disposable-fixture authorization required"
import subprocess,sys,time,json,pathlib,secrets,yaml
H=os.environ['NYXGUARD_TEST_ENGINE'];R=pathlib.Path(__file__).resolve().parents[3];E=pathlib.Path(os.environ['NYXGUARD_TEST_EVIDENCE']);TARGET=sys.argv[1]
def run(args,inp=None,check=True):
 p=subprocess.run(['docker','exec',*(['-i'] if inp is not None else []),H,*args],input=inp,capture_output=True)
 if check and p.returncode:raise RuntimeError(p.stdout.decode()[-1000:]+p.stderr.decode()[-1000:])
 return p
def put(file,data):run(['sh','-c','cat > '+file],inp=data.encode() if isinstance(data,str) else data)
def wait(name,seconds=180):
 end=time.time()+seconds
 while time.time()<end:
  p=run(['docker','inspect','--format','{{.State.Health.Status}}',name],check=False)
  if p.stdout.strip()==b'healthy':return
  if p.stdout.strip()==b'unhealthy':raise RuntimeError('Source readiness failed: '+name)
  time.sleep(2)
 raise RuntimeError('Source readiness deadline: '+name)
def prepare(version,case):
 path='/opt/nyx506-'+case;prefix='nyx506_'+case;manager=prefix+'_manager';db=prefix+'_db';agent=prefix+'_agent'
 assert run(['test','-e',path],check=False).returncode!=0,'Existing fixture must not be overwritten'
 run(['mkdir','-p',path]);env=f'TZ=UTC\nPUID=1000\nPGID=1000\nDOCKER_SOCK_GID=0\nDB_MYSQL_USER=nyxguard\nDB_MYSQL_NAME=nyxguard\nDB_MYSQL_PASSWORD={secrets.token_hex(20)}\nMYSQL_ROOT_PASSWORD={secrets.token_hex(20)}\n'
 put(path+'/.env',env);run(['chmod','600',path+'/.env']);put(path+'/.version',version+'\n')
 compose=yaml.safe_load((R/'docker-compose.yml').read_text());services=compose['services'];services['nyxguard-manager']['image']='nyxmael/nyxguardmanager:'+version
 services['nyxguard-manager']['container_name']=manager;services['nyxguard-manager'].pop('ports',None)
 services['db']['container_name']=db;services['vpn-client-agent']['container_name']=agent
 services['vpn-client-agent']['image']='nyxmael/nyxguardmanager-vpn-agent:'+('5.0.0' if version=='5.0.0' else '5.0.1')
 for key,v in compose['volumes'].items():v['name']=prefix+'_'+key.removeprefix('nyxguard_')
 compose['networks']={'default':{'internal':True}}
 put(path+'/docker-compose.yml',yaml.safe_dump(compose,sort_keys=False))
 cmd=['docker','compose','--env-file',path+'/.env','-f',path+'/docker-compose.yml'];run(cmd+['up','-d']);wait(manager);wait(agent)
 code=(R/'release-source/5.0.4/tests/application-acceptance.mjs').read_bytes();run(['docker','exec','-i',manager,'sh','-c','cat > /tmp/application-acceptance.mjs'],inp=code)
 def acceptance(seed,phase):
  p=run(['docker','exec','-e','NYXGUARD_DISPOSABLE_ACCEPTANCE=1','-e','NYXGUARD_ACCEPTANCE_EVIDENCE=/data/safety-acceptance','-e','NYXGUARD_ACCEPTANCE_SEED='+('1' if seed else '0'),manager,'sh','-c','mkdir -p /data/safety-acceptance;chmod 700 /data/safety-acceptance;node /tmp/application-acceptance.mjs'],check=False)
  (E/(case+'-'+phase+'.log')).write_bytes(p.stdout+p.stderr)
  if p.returncode:raise RuntimeError('Application acceptance failed: '+case+' '+phase)
  receipt=next(json.loads(x) for x in p.stdout.decode().splitlines() if x.startswith('{'))
  assert receipt['migrations']==({'5.0.0':42,'5.0.1':42,'5.0.2':43,'5.0.3':45,'5.0.4':45,'5.0.5':45,'5.0.6':45}[version] if seed else 45)
  return receipt
 before=acceptance(True,'source')
 source=json.loads(run(['docker','inspect',manager]).stdout)[0]
 sourceImage=json.loads(run(['docker','image','inspect',source['Image']]).stdout)[0]
 assert sourceImage['Config']['Labels']['org.opencontainers.image.version']==version
 # A stopped Compose orphan must be ignored and retained.
 run(['docker','create','--name',prefix+'_orphan','--label','com.docker.compose.service=nyxguard-manager','--label','com.docker.compose.project='+source['Config']['Labels']['com.docker.compose.project'],'--label','com.docker.compose.project.config_files='+path+'/docker-compose.yml','--entrypoint','true',source['Image']])
 put(path+'/update506.sh',(R/'update.sh').read_bytes());put(path+'/bootstrap506.mjs',(R/'upgrade/same-major-bootstrap.mjs').read_bytes())
 return path,manager,agent,db,cmd,acceptance,source['Image'],before
matrix={}
for version in sys.argv[2:]:
 case=os.environ.get('NYXGUARD_TEST_CASE_PREFIX','route')+version.replace('.','')
 print('Preparing genuine',version,'fixture',flush=True)
 try:
  path,manager,agent,db,cmd,acceptance,source,before=prepare(version,case)
  image=run(['docker','image','inspect','--format','{{.Id}}',TARGET]).stdout.decode().strip()
  env=['INSTALL_DIR='+path,'FORCE_TAG=5.0.6','NYXGUARD_AUTO_YES=1','NYXGUARD_ACCEPTED_IMAGE_ID='+image,'NYXGUARD_TARGET_IMAGE_REF='+TARGET,'NYXGUARD_SAME_MAJOR_BOOTSTRAP_FILE='+path+'/bootstrap506.mjs']
  p=run(['env',*env,'bash',path+'/update506.sh'],check=False);(E/(case+'-updater.log')).write_bytes(p.stdout+p.stderr)
  if p.returncode:raise RuntimeError('Updater failed: see '+case+'-updater.log')
  run(['docker','exec','-i',manager,'sh','-c','cat > /tmp/application-acceptance.mjs'],inp=(R/'release-source/5.0.4/tests/application-acceptance.mjs').read_bytes())
  after=acceptance(False,'target');wait(manager);wait(agent)
  state=json.loads(run(['docker','exec',manager,'cat','/data/update-manager/state.json']).stdout);pointer=json.loads(run(['docker','exec',manager,'cat','/data/.nyx-handover/active.json']).stdout);ledger=json.loads(run(['docker','exec',manager,'cat','/data/.nyx-handover/'+pointer['id']+'.json']).stdout)['transaction']
  assert ledger['phase']=='COMMITTED' and not state.get('manualRecoveryRequired') and state['currentVersion']=='5.0.6'
  assert run(['docker','inspect',manager.replace('_manager','_orphan'),'--format','{{.State.Status}}']).stdout.strip()==b'created'
  run(cmd+['config','-q']);run(cmd+['up','-d']);wait(manager);wait(agent)
  run(['docker','exec','-i',manager,'sh','-c','cat > /tmp/application-acceptance.mjs'],inp=(R/'release-source/5.0.4/tests/application-acceptance.mjs').read_bytes())
  acceptance(False,'compose-restart')
  p=run(['env',*env,'bash',path+'/update506.sh'],check=False);(E/(case+'-subsequent-updater.log')).write_bytes(p.stdout+p.stderr)
  assert p.returncode==0 and b'already up to date' in p.stdout
  matrix[version]={'result':'PASS','sourceImage':source,'targetImage':image,'sourceSchema':before['migrations'],'targetSchema':after['migrations'],'transaction':ledger['id'],'phase':ledger['phase'],'manager':True,'agent':True,'applicationAPIs':True,'configurationPreserved':True,'composeRestart':True,'subsequentUpdater':True}
  # Keep every completed fixture and recovery set, stopped to bound resources.
  run(cmd+['stop'])
 except Exception as error:
  matrix[version]={'result':'FAIL','reason':str(error)};print(version,str(error),flush=True)
 (E/(os.environ.get('NYXGUARD_TEST_CASE_PREFIX','route')+'-matrix.json')).write_text(json.dumps(matrix,indent=2));print(version,matrix[version]['result'],flush=True)
