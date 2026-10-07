import sys,subprocess,time,json,os,re
from pathlib import Path
E=Path(os.environ['NYXGUARD_TEST_EVIDENCE'])
assert os.environ.get('NYXGUARD_TEST_OWNED')=='1', 'Explicit disposable engine authorization required'
phase=sys.argv[1]
version='5.0.2'
target=os.environ['NYXGUARD_TEST_FAULT_IMAGE']
assert re.fullmatch(r'[A-Z_]+',phase)
case='phase-'+phase
sys.argv=[__file__,version,target,case]
s=(Path(__file__).parent/'upgrade-fixture.py').read_text();cut=s.index("if case.startswith('built-in'):");exec(s[:cut])
with open(E/f'{case}-first-bootstrap.log','wb') as log:
 p=subprocess.Popen(prefix+args,stdout=log,stderr=subprocess.STDOUT)
 for _ in range(400):
  names=run(['docker','ps','-a','--filter','name=nyxguard-update-handover','--format','{{.Names}}']).stdout.decode().splitlines()
  if names:
   helper=names[0]
   status=run(['docker','inspect','-f','{{.State.Running}} {{.State.ExitCode}}',helper]).stdout.decode().strip()
   if status=='false 137':break
   if status.startswith('false '):raise RuntimeError('Interruption did not execute: '+status)
  time.sleep(.2)
 else:raise RuntimeError('SIGKILL not observed')
 p.wait(timeout=30)
 hostname=run(['docker','inspect','-f','{{.Config.Hostname}}',helper]).stdout.decode().strip()
 def ledger():
  raw=run(['docker','run','--rm','--entrypoint','cat','-v','nyxguard_data:/data:ro',os.environ['NYXGUARD_TEST_BASE_IMAGE'],f'/data/.nyx-handover/{hostname}.json']).stdout
  return json.loads(raw)['transaction']
 first=ledger();(E/f'{case}-first-transaction.json').write_text(json.dumps(first,indent=2));assert first['phase']==phase,first['phase']
 run(['docker','start',helper]);helperExit=run(['docker','wait',helper]).stdout.strip()
 (E/f'{case}-resume.log').write_bytes(run(['docker','logs',helper],check=False).stdout)
 final=ledger();(E/f'{case}-final-transaction.json').write_text(json.dumps(final,indent=2));committed=phase=='COMMITTED';wanted='COMMITTED' if committed else 'ROLLBACK_COMPLETE'
 assert final['phase']==wanted,final['phase']
 assert helperExit==(b'0' if committed else b'1'),helperExit
 assert final['recoveryId']==first['recoveryId']
 actual=run(['docker','inspect','-f','{{.Image}} {{.State.Health.Status}}','nyxguard-manager']).stdout.decode().strip()
 expectedId=run(['docker','image','inspect','-f','{{.Id}}',target if committed else 'nyxmael/nyxguardmanager:5.0.2']).stdout.decode().strip()
 assert actual==expectedId+' healthy',actual
 acceptance(False,'resumed',45 if committed else 43)
 run(['docker','start',helper]);assert run(['docker','wait',helper]).stdout.strip()==helperExit
 acceptance(False,'repeated-resume',45 if committed else 43)
 if not committed:
  state=json.loads(run(['docker','exec','nyxguard-manager','cat','/data/update-manager/state.json']).stdout)
  assert state['stage']=='failed' and not state.get('manualRecoveryRequired')
  assert state['lastApplyFailure']['recoveryStatus']=='source_pair_verified'

 run(['docker','restart','nyxguard-manager']);healthy();acceptance(False,'restart',45 if committed else 43)
 if withVpn:
  agent=json.loads(run(['docker','inspect','nyxguard-vpn-agent']).stdout)[0]
  manager=json.loads(run(['docker','inspect','nyxguard-manager']).stdout)[0]
  assert agent['Image']=='sha256:1467a4cd22298de7543fed2e4673ab6af0e0259e616c7c9f61b83fd0d32415fe'
  assert agent['State']['Health']['Status']=='healthy' and agent['HostConfig']['NetworkMode']=='container:'+manager['Id']
 receipt={'status':'PASS','phase':phase,'actualSIGKILL':True,'recoveryIdPreserved':True,'terminalPhase':final['phase'],'applicationReceipt':True,'repeatResume':True,'restart':True,'baseImageId':run(['docker','image','inspect','-f','{{.Id}}',os.environ['NYXGUARD_TEST_BASE_IMAGE']]).stdout.decode().strip(),'faultImageId':run(['docker','image','inspect','-f','{{.Id}}',target]).stdout.decode().strip()}
 (E/f'{case}-result.json').write_text(json.dumps(receipt,indent=2))
 print(json.dumps(receipt),flush=True)
