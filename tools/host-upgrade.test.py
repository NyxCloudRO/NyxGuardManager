#!/usr/bin/env python3
"""Regression checks for large-history verification and fingerprint multiplicity."""
import contextlib,io,json,os,pathlib,shutil,signal,subprocess,tempfile,threading,time,types,unittest
from unittest.mock import patch
path=pathlib.Path(__file__).resolve().parents[1]/'update.sh'
source=path.read_text().split("<<'NYXGUARD_HOST_UPGRADE_PY'\n",1)[1].split('\nNYXGUARD_HOST_UPGRADE_PY',1)[0]
sys_executable='/usr/bin/python3'
runner={'__name__':'host_upgrade_test','__file__':str(path)}
exec(compile(source,str(path),'exec'),runner)
class LargeHistoryVerification(unittest.TestCase):
 def baseline(self,rows):return {'tables':{'audit_log':{'columns':['id','created_on'],'rows':rows}},'migrations':['initial.js']}
 def test_large_baseline_is_not_passed_in_an_argument_or_environment(self):
  before=self.baseline(['a'*64]*600000)
  captured={}
  def docker(*args,**kw):captured.update(args=args,**kw);return json.dumps(before)
  old=runner['docker'];runner['docker']=docker
  try:runner['snapshot']('fixture-manager',before)
  finally:runner['docker']=old
  self.assertLess(max(len(a.encode()) for a in captured['args']),32768)
  self.assertEqual(json.loads(captured['input']),{'tables':{'audit_log':{'columns':['id','created_on']}}})
  self.assertNotIn('-e',captured['args'][:3])
 def test_duplicate_records_cannot_hide_data_loss(self):
  with self.assertRaisesRegex(RuntimeError,'record changed'):runner['preservation'](self.baseline(['a','a','b']),self.baseline(['a','b','c']))
 def test_large_identical_history_and_new_records_are_preserved(self):
  runner['preservation'](self.baseline(['a']*600000),self.baseline(['a']*600000+['b']))
 def test_missing_table_is_rejected(self):
  with self.assertRaisesRegex(RuntimeError,'table missing'):runner['preservation'](self.baseline(['a']),{'tables':{},'migrations':['initial.js']})
 def test_migration_history_cannot_regress(self):
  after=self.baseline(['a']);after['migrations']=[]
  with self.assertRaisesRegex(RuntimeError,'history regressed'):runner['preservation'](self.baseline(['a']),after)
class CommandTransport(unittest.TestCase):
 def test_stdin_and_large_captured_output_remain_intact(self):
  value='fixture-'*200000
  actual=runner['run'](['/usr/bin/python3','-c','import sys;sys.stdout.write(sys.stdin.read())'],input=value,capture=True,timeout=10)
  self.assertEqual(actual,value)
 def test_heartbeat_retries_do_not_duplicate_or_truncate_stdin(self):
  value='fixture-'*200000;old=runner['HEARTBEAT_SECONDS'];runner['HEARTBEAT_SECONDS']=0.03
  output=io.StringIO()
  try:
   with contextlib.redirect_stdout(output):
    actual=runner['run'](['/usr/bin/python3','-c','import sys,time;time.sleep(0.15);sys.stdout.write(sys.stdin.read())'],input=value,capture=True,timeout=10)
  finally:runner['HEARTBEAT_SECONDS']=old
  self.assertEqual(actual,value);self.assertIn('remains active',output.getvalue())
 def test_command_failure_does_not_print_sensitive_arguments(self):
  with self.assertRaises(RuntimeError) as error:
   runner['run'](['/usr/bin/python3','-c','raise SystemExit(7)','SECRET_CANARY'],capture=True)
  self.assertNotIn('SECRET_CANARY',str(error.exception))
  self.assertIn('exit 7',str(error.exception))
class CommandLifecycle(unittest.TestCase):
 def setUp(self):
  self.heartbeat=runner['HEARTBEAT_SECONDS'];runner['HEARTBEAT_SECONDS']=0.03
 def tearDown(self):runner['HEARTBEAT_SECONDS']=self.heartbeat
 def run_quiet(self,*args,**kw):
  with contextlib.redirect_stdout(io.StringIO()):return runner['run'](*args,**kw)
 def test_silent_command_reports_activity_and_finishes(self):
  output=io.StringIO()
  with contextlib.redirect_stdout(output):
   result=runner['run']([sys_executable,'-c','import time;time.sleep(0.12)'],capture=True,timeout=2)
  self.assertEqual(result,'');self.assertIn('remains active',output.getvalue())
 def test_both_output_pipes_drain_without_deadlock(self):
  code='import sys;sys.stderr.write("E"*2000000);sys.stdout.write("O"*2000000)'
  self.assertEqual(self.run_quiet([sys_executable,'-c',code],capture=True,timeout=5),'O'*2000000)
 def test_closed_child_input_does_not_deadlock(self):
  code='import os,time;os.close(0);time.sleep(0.12);print("closed")'
  self.assertEqual(self.run_quiet([sys_executable,'-c',code],input='x'*2000000,capture=True,timeout=2),'closed\n')
 def test_single_argument_failure_is_reported_without_index_error(self):
  with self.assertRaisesRegex(RuntimeError,'exit 1'):self.run_quiet(['/usr/bin/false'],capture=True)
 def test_second_argument_is_not_disclosed(self):
  with self.assertRaises(RuntimeError) as error:self.run_quiet(['/usr/bin/false','SECRET_CANARY'],capture=True)
  self.assertNotIn('SECRET_CANARY',str(error.exception))
 def test_child_signal_is_failure(self):
  with self.assertRaisesRegex(RuntimeError,'exit -15'):
   self.run_quiet([sys_executable,'-c','import os,signal;os.kill(os.getpid(),signal.SIGTERM)'],capture=True)
 def test_broken_heartbeat_output_cancels_command(self):
  with tempfile.TemporaryDirectory() as directory:
   pidfile=pathlib.Path(directory)/'command.pid'
   code='import os,pathlib,sys,time;pathlib.Path(sys.argv[1]).write_text(str(os.getpid()));time.sleep(60)'
   def broken_output(message):
    for _ in range(100):
     if pidfile.exists():break
     time.sleep(0.01)
    raise BrokenPipeError()
   with patch.dict(runner,log=broken_output):
    with self.assertRaises(BrokenPipeError):
     self.run_quiet([sys_executable,'-c',code,str(pidfile)],capture=True,timeout=3)
   self.assert_stopped(int(pidfile.read_text()))
 def test_nonzero_after_heartbeats_never_reports_success(self):
  with self.assertRaisesRegex(RuntimeError,'exit 7'):
   self.run_quiet([sys_executable,'-c','import time;time.sleep(0.12);raise SystemExit(7)'],capture=True,timeout=2)
 def assert_stopped(self,pid):
  status=pathlib.Path('/proc')/str(pid)/'status'
  for _ in range(100):
   if not status.exists() or 'State:\tZ' in status.read_text():return
   time.sleep(0.01)
  self.fail('Command descendant remains running after cleanup')
 def test_timeout_stops_descendant_after_direct_child_exits(self):
  with tempfile.TemporaryDirectory() as directory:
   pidfile=pathlib.Path(directory)/'child.pid'
   code='import pathlib,subprocess,sys;p=subprocess.Popen([sys.executable,"-c","import time;time.sleep(60)"]);pathlib.Path(sys.argv[1]).write_text(str(p.pid))'
   started=time.monotonic()
   with self.assertRaises(subprocess.TimeoutExpired):
    self.run_quiet([sys_executable,'-c',code,str(pidfile)],capture=True,timeout=0.2)
   self.assertLess(time.monotonic()-started,2)
   self.assert_stopped(int(pidfile.read_text()))
 def test_interrupt_and_termination_cancel_and_reap_command(self):
  for sig in (signal.SIGINT,signal.SIGTERM,signal.SIGHUP):
   with self.subTest(signal=sig),tempfile.TemporaryDirectory() as directory:
    pidfile=pathlib.Path(directory)/'command.pid'
    code='import os,pathlib,sys,time;pathlib.Path(sys.argv[1]).write_text(str(os.getpid()));time.sleep(60)'
    previous=signal.getsignal(sig)
    def interrupted(number,frame):raise RuntimeError('Upgrade interrupted')
    signal.signal(sig,interrupted)
    timer=threading.Timer(0.2,os.kill,args=(os.getpid(),sig));timer.start()
    try:
     with self.assertRaisesRegex(RuntimeError,'Upgrade interrupted'):
      self.run_quiet([sys_executable,'-c',code,str(pidfile)],capture=True,timeout=3)
    finally:
     timer.cancel();timer.join();signal.signal(sig,previous)
    self.assert_stopped(int(pidfile.read_text()))
 def test_plain_output_is_forwarded_with_exit_status(self):
  code='import time;print("first",flush=True);time.sleep(0.12);print("last")'
  harness='namespace={"__name__":"fixture","__file__":'+repr(str(path))+'};exec('+repr(source)+',namespace);namespace["run"]('+repr([sys_executable,'-c',code])+',timeout=2)'
  completed=subprocess.run([sys_executable,'-c',harness],capture_output=True,text=True,timeout=5)
  self.assertEqual(completed.returncode,0,completed.stderr)
  self.assertIn('first',completed.stdout);self.assertIn('last',completed.stdout)

class ReadinessBudget(unittest.TestCase):
 policy={'startupIdleMs':60000,'migrationIdleMs':45000,'workUnitBudgetMs':100,'fixedBudgetMs':120000,'maximumBudgetMs':1800000}
 def test_small_inventory_keeps_bounded_health_grace(self):
  self.assertEqual(runner['readiness_budget'](self.policy,0),300000)
 def test_large_inventory_is_capped_and_cannot_extend_forever(self):
  self.assertEqual(runner['readiness_budget'](self.policy,600000),1860000)
 def test_policy_cannot_remove_global_bound(self):
  with self.assertRaises(RuntimeError):runner['readiness_budget']({**self.policy,'maximumBudgetMs':99999999},100)
 def test_invalid_inventory_is_rejected(self):
  with self.assertRaises(RuntimeError):runner['readiness_budget'](self.policy,-1)
class ReadinessLifecycle(unittest.TestCase):
 policy=ReadinessBudget.policy
 def exercise(self,progress,probe_fails=False):
  clock={'now':1000.0};commands=[]
  def advance(seconds):clock['now']+=seconds
  def service_id(service,timeout=900):
   commands.append(timeout);return service
  def inspect(service,timeout=900):
   commands.append(timeout)
   return {'Id':service,'State':{'Status':'running','Running':True,'Health':{'Status':'healthy'}}}
  def docker(*args,**kw):
   commands.append(kw.get('timeout',900))
   if args[-1]==runner['STARTUP_STATUS']:return json.dumps(progress(clock['now']-1000))
   if probe_fails and args[-1]=='/app/internal/readiness-probe.mjs':raise RuntimeError('not ready')
   return ''
  fake_time=types.SimpleNamespace(monotonic=lambda:clock['now'],sleep=advance)
  with patch.dict(runner,time=fake_time,cid=service_id,inspect=inspect,docker=docker,stage=lambda name:None,log=lambda message:None,diagnostic=lambda *args,**kw:None):
   try:runner['health']({'services':['db','nyxguard-manager']},self.policy)
   finally:self.assertTrue(commands);self.assertLessEqual(max(commands),10)
  return clock['now']-1000
 def progress(self,**changes):
  return {'attempt':'fixture','phase':'migration-audit','units':0,'total':600000,'complete':False,'failed':False,**changes}
 def test_activity_cannot_extend_global_budget(self):
  with self.assertRaisesRegex(RuntimeError,'bounded startup budget'):
   self.exercise(lambda elapsed:self.progress(units=int(elapsed)),probe_fails=True)
 def test_unchanged_progress_reaches_idle_deadline(self):
  with self.assertRaisesRegex(RuntimeError,'stopped completing work'):
   self.exercise(lambda elapsed:self.progress(),probe_fails=True)
 def test_missing_progress_cannot_wait_forever(self):
  with self.assertRaisesRegex(RuntimeError,'valid startup progress'):
   self.exercise(lambda elapsed:None,probe_fails=True)
 def test_restarting_progress_attempts_are_rejected(self):
  with self.assertRaisesRegex(RuntimeError,'repeatedly restarted'):
   self.exercise(lambda elapsed:self.progress(attempt=str(int(elapsed)//6)),probe_fails=True)
 def test_completed_startup_cannot_hide_failed_acceptance(self):
  with self.assertRaisesRegex(RuntimeError,'acceptance still fails'):
   self.exercise(lambda elapsed:self.progress(complete=True),probe_fails=True)
 def test_healthy_services_and_probe_complete_acceptance(self):
  self.assertLess(self.exercise(lambda elapsed:self.progress(complete=True)),1)

class BaselinePreparationRecovery(unittest.TestCase):
 def exercise(self,missing=None,stop_failure=False):
  with tempfile.TemporaryDirectory() as directory:
   root=pathlib.Path(directory);state=root/'.upgrade';data=root/'data';data.mkdir()
   for name in ('.env','docker-compose.yml','vault.key'):(root/name).write_text('fixture')
   environment={'DB_MYSQL_HOST':'db','DB_MYSQL_USER':'fixture','DB_MYSQL_PASSWORD':'SECRET_CANARY','DB_MYSQL_NAME':'fixture'}
   if missing:environment.pop(missing)
   running={'db':True,'nyxguard-manager':True};commands=[];events=[];health_calls=[];opened=[]
   def compose(*args,**kw):
    commands.append(args)
    if args[0]=='stop':
     for service in args[3:]:running[service]=False
     if stop_failure and args[2]=='60':raise RuntimeError('Partial stop fixture failure')
    if args[0]=='start':running[args[1]]=True
    return ''
   def inspect(service):
    mounts=[{'Type':'volume','Name':'fixture_'+service,'Source':str(data),'Destination':'/data'}]
    if service=='nyxguard-manager':mounts.append({'Type':'bind','Source':str(root/'vault.key'),'Destination':'/run/nyxguard-licensing/vault.key'})
    return {'Id':service,'Image':'fixture-image','Config':{'Env':[key+'='+value for key,value in environment.items()]},
     'Mounts':mounts,'NetworkSettings':{'Networks':{'fixture-network':{}}},'State':{'Running':running[service],'ExitCode':0}}
   def docker(*args,**kw):
    if args[0]=='ps':return '' if '--filter' in args else 'db nyxguard-manager'
    self.assertEqual(args[0],'run');self.assertNotIn('DB_MYSQL_PORT=', ' '.join(args))
    self.assertFalse(running['nyxguard-manager']);self.assertTrue(running['db'])
    return json.dumps({'tables':{},'migrations':['fixture.js']})
   def run(args,**kw):
    if args[0]=='du':return '1 fixture'
    if args[0]=='tar':raise RuntimeError('Archive fixture failure')
    self.fail('Unexpected external command in private workflow fixture')
   def health(manifest):
    health_calls.append(dict(running));self.assertTrue(all(running.values()))
    if len(health_calls)>1:self.assertTrue((state/'pending.json').exists())
   def tracked_open(*args,**kw):
    file=open(*args,**kw);opened.append(file);return file
   output=io.StringIO()
   try:
    with patch.dict(runner,ROOT=root,STATE=state,DIAGNOSTIC=None,config=lambda:{'services':{'db':{},'nyxguard-manager':{}}},
     cid=lambda service:service,version=lambda manager:'5.0.10',compose=compose,inspect=inspect,docker=docker,run=run,
     health=health,open=tracked_open,public_failure=lambda manifest,stage,status:events.append(status)),\
     patch.dict(os.environ,FORCE_TAG='5.0.11',NYXGUARD_AUTO_YES='1'),patch.object(runner['os'],'geteuid',return_value=0),\
     patch.object(runner['shutil'],'disk_usage',return_value=types.SimpleNamespace(free=10*1024**3)),\
     patch.object(runner['sys'],'argv',['update.sh']),contextlib.redirect_stdout(output):
     with self.assertRaises(RuntimeError) as error:runner['main']()
   finally:
    for file in opened:file.close()
   self.assertTrue(all(running.values()));self.assertEqual(len(health_calls),2)
   self.assertFalse((state/'pending.json').exists());self.assertEqual(events,['services_restarted'])
   self.assertFalse(list(state.glob('backup-*/result.json')))
   self.assertNotIn('SECRET_CANARY',output.getvalue())
   self.assertNotIn('SECRET_CANARY',''.join(file.read_text() for file in state.glob('diagnostic-*.jsonl')))
   return str(error.exception)
 def test_official_source_without_optional_database_port_reaches_baseline_and_recovers_archive_failure(self):
  self.assertEqual(self.exercise(),'Archive fixture failure')
 def test_missing_required_connection_setting_restarts_verified_services_without_disclosing_values(self):
  self.assertIn('Required database connection setting',self.exercise(missing='DB_MYSQL_PASSWORD'))
 def test_partial_application_stop_failure_restarts_verified_services(self):
  self.assertEqual(self.exercise(stop_failure=True),'Partial stop fixture failure')

class RecoveryState(unittest.TestCase):
 def test_restart_failure_keeps_pending_recovery(self):
  with tempfile.TemporaryDirectory() as directory:
   state=pathlib.Path(directory);pending=state/'pending.json';pending.write_text('{}')
   m={'backup':str(state/'backup'),'phase':'stopping','services':['db','nyxguard-manager']}
   def failed_health(manifest):raise RuntimeError('services failed acceptance')
   with patch.dict(runner,STATE=state,compose=lambda *args,**kw:'',health=failed_health),contextlib.redirect_stdout(io.StringIO()):
    with self.assertRaisesRegex(RuntimeError,'failed acceptance'):runner['restore'](m)
   self.assertTrue(pending.exists())
 def test_restart_health_is_verified_before_pending_is_removed(self):
  with tempfile.TemporaryDirectory() as directory:
   state=pathlib.Path(directory);pending=state/'pending.json';pending.write_text('{}');calls=[]
   m={'backup':str(state/'backup'),'phase':'stopping','services':['db','nyxguard-manager','vpn-client-agent']}
   def verified_health(manifest):self.assertTrue(pending.exists());calls.append('verified')
   with patch.dict(runner,STATE=state,compose=lambda *args,**kw:calls.append(args),health=verified_health),contextlib.redirect_stdout(io.StringIO()):
    runner['restore'](m)
   self.assertEqual(calls,[('start','db'),('start','nyxguard-manager'),('start','vpn-client-agent'),'verified'])
   self.assertFalse(pending.exists())

class ApplyingRecovery(unittest.TestCase):
 def setUp(self):
  self.directory=tempfile.TemporaryDirectory();self.addCleanup(self.directory.cleanup)
  self.root=pathlib.Path(self.directory.name);self.state=self.root/'.upgrade';self.state.mkdir()
  self.backup=self.state/'backup';self.backup.mkdir();(self.backup/'files').mkdir()
  self.data=self.root/'data';self.data.mkdir();(self.data/'protected.txt').write_text('original fixture')
  subprocess.run(['tar','--numeric-owner','-cpf',str(self.backup/'0.tar'),'-C',str(self.data),'.'],check=True)
  (self.data/'protected.txt').write_text('post-upgrade fixture')
  files=[]
  for name,body in (('docker-compose.yml','{}'),('.env','FIXTURE=1'),('vault.key','original vault')):
   file=self.root/name;file.write_text(body);files.append(str(file))
   (self.backup/'files'/str(len(files)-1)).write_bytes(file.read_bytes())
  (self.backup/'rollback-compose.json').write_text('{}')
  self.baseline={'tables':{'fixture':{'columns':['id'],'rows':['a']}},'migrations':['original.js']}
  self.m={'backup':str(self.backup),'phase':'applying','services':['db','nyxguard-manager'],
   'storage':[str(self.data)],'files':files,'current':'5.0.0','database_id':'db',
   'baseline':self.baseline,'volume_names':['fixture_database','fixture_data'],
   'hashes':{str(file.relative_to(self.backup)):runner['sha'](file) for file in self.backup.rglob('*') if file.is_file()}}
  (self.state/'pending.json').write_text(json.dumps(self.m))
  self.containers={'db':{'Mounts':[{'Type':'volume','Name':'fixture_database','Destination':'/var/lib/mysql'}]},
   'nyxguard-manager':{'Mounts':[{'Type':'volume','Name':'fixture_data','Destination':'/data'},
    {'Type':'bind','Source':str(self.root/'vault.key'),'Destination':'/run/nyxguard-licensing/vault.key'}]}}
  self.health=lambda manifest:None
 def restore(self,run=None):
  with patch.dict(runner,ROOT=self.root,STATE=self.state,DIAGNOSTIC=None,
   compose=lambda *args,**kw:'',health=self.health,cid=lambda service:service,
   inspect=lambda service:self.containers[service],version=lambda service:'5.0.0',
   snapshot=lambda *args:self.baseline,run=run or runner['run']),contextlib.redirect_stdout(io.StringIO()):
   runner['restore'](self.m)
 def assert_pending(self):
  self.assertTrue((self.state/'pending.json').exists());self.assertFalse((self.backup/'result.json').exists())
 def test_real_archive_restore_and_all_acceptance_checks_complete(self):
  self.restore()
  self.assertEqual((self.data/'protected.txt').read_text(),'original fixture')
  self.assertEqual((self.root/'vault.key').read_text(),'original vault')
  self.assertFalse((self.state/'pending.json').exists())
  self.assertEqual(json.loads((self.backup/'result.json').read_text())['result'],'rolled_back')
 def test_extraction_corruption_cannot_report_verified_rollback(self):
  real_run=runner['run']
  def corrupt(args,**kw):
   result=real_run(args,**kw)
   if '-xpf' in args:(self.data/'protected.txt').write_text('corrupt extraction')
   return result
  with self.assertRaisesRegex(RuntimeError,'Command failed'):self.restore(run=corrupt)
  self.assert_pending()
 def test_changed_attached_volume_keeps_recovery_pending(self):
  self.containers['nyxguard-manager']['Mounts'][0]['Name']='unexpected_volume'
  with self.assertRaisesRegex(RuntimeError,'volume identities changed'):self.restore()
  self.assert_pending()
 def test_vault_changed_during_startup_keeps_recovery_pending(self):
  self.health=lambda manifest:(self.root/'vault.key').write_text('unexpected vault')
  with self.assertRaisesRegex(RuntimeError,'vault key differs'):self.restore()
  self.assert_pending()
 def test_inexact_saved_file_copy_keeps_recovery_pending(self):
  real_copy=runner['shutil'].copy2
  def corrupt(saved,destination):
   result=real_copy(saved,destination)
   if str(destination).endswith('vault.key'):pathlib.Path(destination).write_text('corrupt copy')
   return result
  with patch.object(runner['shutil'],'copy2',corrupt),self.assertRaisesRegex(RuntimeError,'installation file differs'):
   self.restore()
  self.assert_pending()
 def test_corrupt_backup_rejected_before_restore_changes_storage(self):
  (self.backup/'0.tar').write_bytes(b'corrupt backup')
  with self.assertRaisesRegex(RuntimeError,'checksum failed'):self.restore()
  self.assertEqual((self.data/'protected.txt').read_text(),'post-upgrade fixture')
  self.assert_pending()
 def test_changed_database_container_keeps_recovery_pending(self):
  self.m['database_id']='original-db'
  with self.assertRaisesRegex(RuntimeError,'Database container identity changed'):self.restore()
  self.assert_pending()
 def test_missing_database_records_keep_recovery_pending(self):
  original=self.baseline
  self.baseline={'tables':{'fixture':{'columns':['id'],'rows':[]}},'migrations':['original.js']}
  self.m['baseline']=original
  with self.assertRaisesRegex(RuntimeError,'record changed'):self.restore()
  self.assert_pending()
 def test_changed_migration_history_keeps_recovery_pending(self):
  original=self.baseline
  self.baseline={**original,'migrations':['original.js','unexpected.js']}
  self.m['baseline']=original
  with self.assertRaisesRegex(RuntimeError,'migration history differs'):self.restore()
  self.assert_pending()
 def test_recover_only_resumes_persisted_applying_state_before_preflight(self):
  opened=[]
  def tracked_open(*args,**kw):
   file=open(*args,**kw);opened.append(file);return file
  try:
   with patch.dict(runner,ROOT=self.root,STATE=self.state,DIAGNOSTIC=None,
    compose=lambda *args,**kw:'',health=self.health,cid=lambda service:service,
    inspect=lambda service:self.containers[service],version=lambda service:'5.0.0',
    snapshot=lambda *args:self.baseline,open=tracked_open,
    config=lambda:self.fail('Recover-only must finish without ordinary upgrade preflight')),\
    patch.object(runner['sys'],'argv',['update.sh','--recover-only']),contextlib.redirect_stdout(io.StringIO()):
    runner['main']()
  finally:
   for file in opened:file.close()
  self.assertEqual((self.data/'protected.txt').read_text(),'original fixture')
  self.assertFalse((self.state/'pending.json').exists())
  self.assertEqual(json.loads((self.backup/'result.json').read_text())['result'],'rolled_back')

class PrivateDiagnostics(unittest.TestCase):
 def test_diagnostic_permissions_and_failure_redaction(self):
  with tempfile.TemporaryDirectory() as directory:
   diagnostic=pathlib.Path(directory)/'diagnostic.jsonl';runner['atom'](diagnostic,'')
   with patch.dict(runner,DIAGNOSTIC=diagnostic,HEARTBEAT_SECONDS=0.01),contextlib.redirect_stdout(io.StringIO()):
    with self.assertRaises(RuntimeError) as error:
     runner['run']([sys_executable,'-c','import time;time.sleep(0.06);raise SystemExit(7)','SECRET_CANARY'],capture=True,timeout=2)
    runner['diagnostic']('failed',reason=runner['failure_reason'](error.exception))
   records=[json.loads(line) for line in diagnostic.read_text().splitlines()]
   self.assertEqual(diagnostic.stat().st_mode & 0o777,0o600)
   self.assertNotIn('SECRET_CANARY',diagnostic.read_text())
   self.assertTrue(any('remains active' in record.get('message','') for record in records))
   self.assertIn('exit 7',records[-1]['reason'])

@unittest.skipUnless(shutil.which('node'),'Node is required for actual operational summary helper tests')
class PublicFailureSummary(unittest.TestCase):
 node=shutil.which('node')
 def setUp(self):
  self.directory=tempfile.TemporaryDirectory();self.addCleanup(self.directory.cleanup)
  self.root=pathlib.Path(self.directory.name);self.artifact=self.root/'.nyxguard-operational-updater.json'
  self.pending=self.root/'pending.json';self.pending.write_text('{}')
  self.private=self.root/'private.jsonl';runner['atom'](self.private,'private fixture\n')
  self.events=[];self.commands=[]
  self.manifest={'current':'5.0.0','target':'5.0.11','diagnostic_volume':'fixture_data','diagnostic_image':'sha256:'+'a'*64,'password':'SECRET_CANARY'}
 def docker(self,*args,**kw):
  self.commands.append(args);self.assertEqual(kw['timeout'],10)
  if args[0]=='ps':return ''
  self.assertEqual(args[0],'run');self.assertIn('--rm',args)
  self.assertEqual(args[args.index('--network')+1],'none');self.assertEqual(args[args.index('--user')+1],'0:0')
  self.assertEqual(args[args.index('--mount')+1],'type=volume,source=fixture_data,target=/data')
  self.assertEqual(json.loads(kw['input'])['version'],'5.0.0')
  # Run the actual image-independent helper script against an isolated directory.
  script=args[-1].replace('/data',str(self.root))
  completed=subprocess.run([self.node,'-e',script],input=kw['input'],capture_output=True,text=True,timeout=10)
  if completed.returncode:raise RuntimeError('Operational fixture helper failed')
  return completed.stdout
 def publish(self,stage='Backup: SECRET_CANARY',state='services_restarted',docker=None):
  with patch.dict(runner,docker=docker or self.docker,diagnostic=lambda event,**fields:self.events.append({'event':event,**fields})):
   runner['public_failure'](self.manifest,stage,state)
 def test_actual_helper_writes_safe_atomic_readable_summary_without_private_logs(self):
  self.publish();data=json.loads(self.artifact.read_text());event=data['events'][0]
  self.assertEqual(data['format'],'nyxguard-host-operational-v1');self.assertEqual(event['code'],'HOST_BACKUP_FAILED')
  self.assertEqual(event['application_state'],'services_restarted');self.assertEqual(event['outcome'],'recovered')
  self.assertNotIn('SECRET_CANARY',self.artifact.read_text());self.assertNotIn(str(self.root),self.artifact.read_text())
  self.assertEqual(self.artifact.stat().st_mode&0o777,0o644)
  self.assertEqual(self.private.read_text(),'private fixture\n');self.assertEqual(self.private.stat().st_mode&0o777,0o600)
  self.assertTrue(self.pending.exists());self.assertFalse(list(self.root.glob('*.tmp')))
 def test_incomplete_recovery_never_claims_verified_rollback(self):
  self.publish('Readiness: private fixture','recovery_incomplete');event=json.loads(self.artifact.read_text())['events'][0]
  self.assertEqual(event['code'],'HOST_RECOVERY_INCOMPLETE');self.assertEqual(event['outcome'],'partially_completed')
  self.assertEqual(event['details'],{'stage':'rollback','recovery_state':'recovery_incomplete'});self.assertTrue(self.pending.exists())
 def test_summary_retention_is_bounded_and_prior_raw_properties_removed(self):
  self.publish();event=json.loads(self.artifact.read_text())['events'][0]
  records=[{**event,'event_id':str(runner['uuid'].UUID(int=i+1)),'unexpected':'SECRET_CANARY'} for i in range(100)]
  self.artifact.write_text(json.dumps({'format':'nyxguard-host-operational-v1','events':records}))
  self.publish();self.assertEqual(len(json.loads(self.artifact.read_text())['events']),64)
  self.assertLess(self.artifact.stat().st_size,131072);self.assertNotIn('SECRET_CANARY',self.artifact.read_text())
 def test_writer_failure_does_not_clear_pending_or_change_private_diagnostics(self):
  def failed(*args,**kw):raise RuntimeError('SECRET_CANARY')
  self.publish(docker=failed);self.assertTrue(self.pending.exists());self.assertFalse(self.artifact.exists())
  self.assertNotIn('SECRET_CANARY',json.dumps(self.events));self.assertEqual(self.private.read_text(),'private fixture\n')
  self.assertEqual(self.events[0]['delivery'],'failed')
 def test_symlink_artifact_is_rejected_without_modifying_its_target(self):
  self.artifact.symlink_to(self.private);self.publish()
  self.assertEqual(self.private.read_text(),'private fixture\n');self.assertTrue(self.pending.exists())
  self.assertEqual(self.events[0]['delivery'],'failed')

class BaselineContainerCleanup(unittest.TestCase):
 name='nyxguard-baseline-backup-20261010T000000Z-1'
 def test_named_daemon_container_is_removed_with_bounded_checks(self):
  present={'value':True};calls=[]
  def docker(*args,**kw):
   calls.append((args,kw));self.assertEqual(kw['timeout'],10)
   if args[0]=='ps':return 'fixture-id' if present['value'] else ''
   self.assertEqual(args,('rm','-f',self.name));present['value']=False;return ''
  with patch.dict(runner,docker=docker):runner['cleanup_baseline']({'baseline_helper':self.name})
  self.assertFalse(present['value']);self.assertEqual(len(calls),3)
 def test_completed_absent_helper_requires_no_removal(self):
  calls=[]
  def docker(*args,**kw):calls.append(args);return ''
  with patch.dict(runner,docker=docker):runner['cleanup_baseline']({'baseline_helper':self.name})
  self.assertTrue(all(args[0]=='ps' for args in calls))
 def test_cleanup_failure_preserves_pending_before_service_recovery(self):
  with tempfile.TemporaryDirectory() as directory:
   state=pathlib.Path(directory);pending=state/'pending.json';pending.write_text('{}')
   m={'baseline_helper':self.name,'backup':str(state/'backup'),'phase':'stopping','services':['db','nyxguard-manager']}
   def unavailable(*args,**kw):raise RuntimeError('daemon unavailable')
   with patch.dict(runner,STATE=state,docker=unavailable,compose=lambda *args,**kw:self.fail('Cleanup must precede service recovery')):
    with self.assertRaisesRegex(RuntimeError,'daemon unavailable'):runner['restore'](m)
   self.assertTrue(pending.exists())

if __name__=='__main__':unittest.main()
