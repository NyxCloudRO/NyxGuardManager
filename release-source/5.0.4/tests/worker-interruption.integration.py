import subprocess,time,json,os
from pathlib import Path
E=Path(os.environ['NYXGUARD_TEST_EVIDENCE']);outer=os.environ['NYXGUARD_TEST_ENGINE'];image=os.environ['NYXGUARD_TEST_BASE_IMAGE']
assert os.environ.get('NYXGUARD_TEST_OWNED')=='1'
sourceVersion=os.environ['NYXGUARD_TEST_SOURCE_VERSION'];sourceSchema={'5.0.1':42,'5.0.2':43,'5.0.3':45}[sourceVersion]
faultImages=json.loads(os.environ['NYXGUARD_TEST_WORKER_IMAGES'])
def run(args,inp=None,check=True):
 p=subprocess.run(['docker','exec']+(['-i'] if inp is not None else [])+[outer]+args,input=inp,capture_output=True)
 if check and p.returncode:raise RuntimeError('Worker interruption step failed; private output retained: '+p.stderr.decode()[-400:])
 return p
assert subprocess.check_output(['docker','inspect','-f','{{index .Config.Labels "nyxguard.test.purpose"}}',outer]).strip()==b'main1-upgrade'
binds=['-v','/var/run/docker.sock:/var/run/docker.sock','-v','nyxguard_update_recovery:/recovery:rw','-v','nyxguard_db:/source/db:ro','-v','nyxguard_data:/source/data:rw','-v','nyxguard_letsencrypt:/source/letsencrypt:rw','-v','/var/lib/nyxguard-licensing:/host-vault:rw','-v','/opt/nyxguardmanager:/host-install:rw']
volumes=json.dumps([{'key':'data','name':'nyxguard_data'},{'key':'letsencrypt','name':'nyxguard_letsencrypt'}],separators=(',',':'))
def worker(mode,id):
 p=run(['docker','run','--rm','--network','container:nyxguard-db','--entrypoint','node']+binds+['-e','RECOVERY_SOURCE_VERSION='+sourceVersion,'-e','RECOVERY_MODE='+mode,'-e','RECOVERY_ID='+id,'-e','RECOVERY_VOLUMES='+volumes,image,'/app/internal/same-major-recovery.js'],check=False)
 (E/f'worker5v2-{id}-{mode}.log').write_bytes(p.stdout+p.stderr)
 if p.returncode:raise RuntimeError('Whole recovery worker failed '+mode+'; see private log')
def healthy():
 for _ in range(90):
  status=run(['docker','inspect','-f','{{.State.Health.Status}}','nyxguard-manager']).stdout.strip()
  if status==b'healthy':return
  if status==b'unhealthy':raise RuntimeError('Application unhealthy after resumed recovery')
  time.sleep(2)
 raise RuntimeError('Application readiness deadline')
results=[]
for phase in ['files-preparing','files-moving','after-ddl']:
 id='nyx-r9-'+phase+'-'+str(int(time.time()*1000))
 run(['docker','stop','nyxguard-manager']);worker('backup',id)
 mutate=b"import db from '/app/db.js';await db()('setting').where({id:'default-site'}).update({value:'candidate-mutated'});await db().destroy();"
 run(['docker','run','--rm','--network','none','--entrypoint','sh','-v','nyxguard_data:/data:rw',image,'-c',"printf candidate > /data/candidate-marker"])
 mutation="import mysql from 'mysql2';const c=mysql.createConnection({host:'127.0.0.1',user:'root',password:process.env.MYSQL_ROOT_PASSWORD,database:process.env.DB_MYSQL_NAME});await c.promise().query(\"UPDATE setting SET value='candidate-mutated' WHERE id='default-site'\");await c.promise().end();"
 run(['docker','run','--rm','--network','container:nyxguard-db','--entrypoint','node','--env-file','/opt/nyxguardmanager/.env',image,'--input-type=module','-e',mutation])
 name='nyx-durable5-worker-v2-'+phase
 created=run(['docker','create','--name',name,'--network','container:nyxguard-db','--entrypoint','node']+binds+['-e','FIXTURE_WORKER_NAME='+name,'-e','RECOVERY_SOURCE_VERSION='+sourceVersion,'-e','RECOVERY_MODE=restore','-e','RECOVERY_ID='+id,'-e','RECOVERY_VOLUMES='+volumes,faultImages[phase],'/app/internal/same-major-recovery.js']).stdout.decode().strip()
 run(['docker','start',name]);exitcode=run(['docker','wait',name]).stdout.strip()
 (E/f'worker5v2-{phase}-interrupted.log').write_bytes(run(['docker','logs',name],check=False).stdout)
 if exitcode!=b'137':raise RuntimeError('Expected actual SIGKILL at '+phase)
 worker('restore',id)
 run(['docker','start','nyxguard-manager']);healthy()
 p=run(['docker','exec','-e','NYXGUARD_DISPOSABLE_ACCEPTANCE=1','-e','NYXGUARD_ACCEPTANCE_EVIDENCE=/data/safety-acceptance','nyxguard-manager','node','/tmp/application-acceptance.mjs'],check=False)
 (E/f'worker5v2-{phase}-application.log').write_bytes(p.stdout+p.stderr)
 receipts=[json.loads(x) for x in p.stdout.decode().splitlines() if x.startswith('{')];
 if p.returncode or len(receipts)!=1 or receipts[0].get('migrations')!=sourceSchema or not all(receipts[0].get(k) for k in ['login','proxyAPI','settingsAPI','traffic','dataPreserved']):raise RuntimeError('Resumed application acceptance failed')
 run(['docker','exec','nyxguard-manager','test','!','-e','/data/candidate-marker'])
 worker('finalize',id)
 results.append({'phase':phase,'actualSIGKILL':True,'resume':'PASS','application':'PASS','candidateMarkerAbsent':True})
 print('R9',phase,'SIGKILL / resume / application PASS',flush=True)
(E/'worker5v2-whole-worker.json').write_text(json.dumps(results,indent=2))
