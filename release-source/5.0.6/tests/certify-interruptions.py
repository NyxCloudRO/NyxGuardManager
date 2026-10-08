import os
assert os.environ.get("NYXGUARD_DISPOSABLE_CERTIFICATION") == "1", "Explicit disposable-fixture authorization required"
import subprocess,pathlib,json,time,sys
H=os.environ['NYXGUARD_TEST_ENGINE'];R=pathlib.Path(__file__).resolve().parents[3];E=pathlib.Path(os.environ['NYXGUARD_TEST_EVIDENCE']);case=sys.argv[1];mode=sys.argv[2];T=sys.argv[3];P='/opt/nyx506-'+case;M='nyx506_'+case+'_manager'
def run(a,inp=None,check=True):
 p=subprocess.run(['docker','exec',*(['-i'] if inp is not None else []),H,*a],input=inp,capture_output=True)
 if check and p.returncode:raise RuntimeError(p.stdout.decode()[-1200:]+p.stderr.decode()[-1200:])
 return p
for name,src in [('update506.sh','update.sh'),('bootstrap506.mjs','upgrade/same-major-bootstrap.mjs')]:run(['sh','-c','cat > '+P+'/'+name],inp=(R/src).read_bytes())
image=run(['docker','image','inspect',T,'--format','{{.Id}}']).stdout.decode().strip();base=['INSTALL_DIR='+P,'FORCE_TAG=5.0.6','NYXGUARD_AUTO_YES=1','NYXGUARD_ACCEPTED_IMAGE_ID='+image,'NYXGUARD_TARGET_IMAGE_REF='+T,'NYXGUARD_SAME_MAJOR_BOOTSTRAP_FILE='+P+'/bootstrap506.mjs']
def invoke(extra,log):
 p=run(['env',*base,*extra,'bash',P+'/update506.sh'],check=False);(E/(case+'-'+log+'.log')).write_bytes(p.stdout+p.stderr);return p
plan=invoke(['NYXGUARD_BASELINE_PLAN=1'],'plan');assert plan.returncode==0
plan=next(json.loads(x) for x in plan.stdout.decode().splitlines() if x.startswith('{'))
auth=['NYXGUARD_ACCEPT_BASELINE='+plan['challenge'],'NYXGUARD_BASELINE_REASON=Authorized disposable certification fault injection; current baseline only; historical rollback remains unverified']
log=(E/(case+'-injection-updater.log')).open('wb');proc=subprocess.Popen(['docker','exec',H,'env',*base,*auth,'bash',P+'/update506.sh'],stdout=log,stderr=subprocess.STDOUT)
helper=None;ledger=None;injected=False;deadline=time.time()+420;observations=[]
while time.time()<deadline and proc.poll() is None:
 if not helper:
  ids=run(['docker','ps','-aq','--filter','label=nyxguard.install-dir='+P,'--filter','label=nyxguard.target-version=5.0.6']).stdout.decode().splitlines()
  if ids:helper=ids[-1]
 if helper:
  raw=run(['docker','exec',helper,'cat','/handover-data/.nyx-handover/'+helper[:12]+'.json'],check=False)
  if raw.returncode:
   raw=run(['docker','run','--rm','--network','none','--entrypoint','cat','-v','nyx506_'+case+'_data:/data:ro',T,'/data/.nyx-handover/'+helper[:12]+'.json'],check=False)
  if raw.returncode==0:
   ledger=json.loads(raw.stdout)['transaction'];phase=ledger['phase']
   if not observations or observations[-1]!=phase:observations.append(phase);print(case,phase,flush=True)
   if not injected and mode=='backup' and phase=='BACKUP_STARTING':
    workers=run(['docker','ps','-q','--filter','name=nyxguard-same-major-backup-'+ledger['recoveryId']]).stdout.decode().splitlines()
    if workers:run(['docker','kill','--signal','KILL',helper]);injected=True;print('Killed helper during actual backup',flush=True)
   if not injected and mode=='reconcile' and phase=='BACKUP_STARTING':
    name='nyxguard-same-major-baseline-'+ledger['recoveryId'];w=run(['docker','ps','-q','--filter','name='+name]).stdout.decode().strip()
    if w:
     receipt='/source/data/.nyx-baselines/'+plan['challenge']+'/'+ledger['recoveryId']+'/acceptance.json'
     if run(['docker','exec',w,'test','-e',receipt],check=False).returncode==0:
      run(['docker','kill','--signal','KILL',w]);injected=True;print('Killed baseline worker after durable acceptance receipt',flush=True)
   if not injected and mode in ['migration','stall','startup','health'] and phase=='REPLACEMENT_STARTING':
    target=ledger['target']['id'];rawp=run(['docker','exec',target,'cat','/tmp/nyxguard-startup.json'],check=False)
    progress=json.loads(rawp.stdout) if rawp.returncode==0 else None
    if mode=='startup' and progress:
     run(['docker','kill','--signal','KILL',target]);injected=True;print('Killed replacement before readiness',flush=True)
    if mode in ['migration','stall'] and progress and progress['units']>0 and not progress['complete']:
     if mode=='migration':run(['docker','kill','--signal','KILL',helper])
     else:run(['docker','exec',target,'sh','-c','kill -STOP '+str(progress['pid'])])
     injected=True;print('Interrupted actual progressing migration '+str(progress['units']),flush=True)
    if mode=='health' and progress and progress['complete']:
     run(['docker','exec',target,'/command/s6-svc','-d','/run/service/nginx']);injected=True;print('Stopped nginx before health acceptance',flush=True)
 if injected and mode in ['backup','migration']:break
 time.sleep(.15)
assert injected,'Failed to reach real injection boundary'
if mode in ['backup','migration']:
 proc.wait(timeout=120);log.close()
 resume=invoke(['NYXGUARD_RESUME=1'],'resume');assert resume.returncode==0,resume.stdout.decode()[-1000:]+resume.stderr.decode()[-1000:]
else:proc.wait(timeout=420);log.close();assert proc.returncode!=0
raw=run(['docker','exec',M,'cat','/data/.nyx-handover/'+helper[:12]+'.json']);ledger=json.loads(raw.stdout)['transaction'];assert ledger['phase']=='ROLLBACK_COMPLETE'
state=json.loads(run(['docker','exec',M,'cat','/data/update-manager/state.json']).stdout)
assert run(['docker','inspect',M,'--format','{{.State.Health.Status}}']).stdout.strip()==b'healthy'
assert run(['docker','exec',M,'node','-p',"require('/app/package.json').version"]).stdout.strip()==b'5.0.1'
history=run(['docker','exec',M,'sha256sum','/data/.nyx-handover/1ea96072477e.json']).stdout.decode().split()[0];assert history=='7d9d43d9a712e27db661162e7e08ca84221ab94a31339665ddde7bc339ea9988'
if mode in ['backup','reconcile']:assert state.get('manualRecoveryRequired') is True,'Historical guard lost before acceptance'
receipt={'case':case,'mode':mode,'faultInjected':True,'transaction':helper[:12],'phase':ledger['phase'],'backupVerified':ledger['backupVerified'],'mutationPossible':ledger['mutationPossible'],'restoreVerified':ledger.get('restoreVerified',False),'sourceHealthy':True,'sourceVersion':'5.0.1','historicalLedgerSHA256':history,'historicalGuardRetained':state.get('manualRecoveryRequired',False),'failure':ledger.get('failure'),'observedPhases':observations}
(E/(case+'-fault-receipt.json')).write_text(json.dumps(receipt,indent=2));print(json.dumps(receipt),flush=True)
# Retry through normal product entry point, with a newly read plan when guard remains.
extra=[]
if state.get('manualRecoveryRequired'):
 p=invoke(['NYXGUARD_BASELINE_PLAN=1'],'retry-plan');assert p.returncode==0
 q=next(json.loads(x) for x in p.stdout.decode().splitlines() if x.startswith('{'))
 extra=['NYXGUARD_ACCEPT_BASELINE='+q['challenge'],'NYXGUARD_BASELINE_REASON=Authorized retry after verified fault recovery; retain historical evidence']
p=invoke(extra,'retry');assert p.returncode==0,p.stdout.decode()[-1200:]+p.stderr.decode()[-1200:]
state=json.loads(run(['docker','exec',M,'cat','/data/update-manager/state.json']).stdout);assert state['stage']=='success' and not state.get('manualRecoveryRequired',False)
receipt['retry']='PASS';(E/(case+'-fault-receipt.json')).write_text(json.dumps(receipt,indent=2));print(case,'retry PASS',flush=True)
