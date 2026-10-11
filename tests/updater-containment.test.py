"""Host updater no-op and pre-mutation rejection contracts."""
import builtins,contextlib,io,os,pathlib,tempfile,types,unittest
from unittest.mock import patch
ROOT=pathlib.Path(__file__).resolve().parents[1]
source=(ROOT/'update.sh').read_text().split("<<'NYXGUARD_HOST_UPGRADE_PY'\n",1)[1].split('\nNYXGUARD_HOST_UPGRADE_PY',1)[0]
runner={'__name__':'fixture','__file__':str(ROOT/'update.sh')}
exec(compile(source,str(ROOT/'update.sh'),'exec'),runner)

class HostFixture(unittest.TestCase):
 def setUp(self):
  self.directory=tempfile.TemporaryDirectory();self.addCleanup(self.directory.cleanup)
  self.files=[];self.addCleanup(lambda:[file.close() for file in self.files])
  self.root=pathlib.Path(self.directory.name)
  for name,body in (('.env','FIXTURE=1\n'),('docker-compose.yml','{"services":{}}'),('vault.key','fixture-key')):
   (self.root/name).write_text(body)
  self.original={name:(self.root/name).read_bytes() for name in ('.env','docker-compose.yml','vault.key')}
  self.current='5.0.0';self.calls=[]
  for name in ('database','data','certificates'):(self.root/name).mkdir()
  self.services={'db':{'Id':'db','Mounts':[{'Destination':'/var/lib/mysql','Type':'volume','Source':str(self.root/'database'),'Name':'fixture_database'}]},
   'nyxguard-manager':{'Id':'nyxguard-manager','Mounts':[
    {'Destination':'/data','Type':'volume','Source':str(self.root/'data'),'Name':'fixture_data'},
    {'Destination':'/etc/letsencrypt','Type':'volume','Source':str(self.root/'certificates'),'Name':'fixture_certificates'},
    {'Destination':'/run/nyxguard-licensing/vault.key','Type':'bind','Source':str(self.root/'vault.key')} ]}}
 def docker(self,*args,**kw):
  self.calls.append(args)
  if args==('ps','-aq'):return 'db\nnyxguard-manager\n'
  self.fail('Unexpected Docker operation before safe rejection: '+args[0])
 def open_file(self,*args,**kw):
  file=builtins.open(*args,**kw);self.files.append(file);return file
 def run_command(self,target,repair='0',disk_free=0):
  fake_disk=types.SimpleNamespace(disk_usage=lambda location:types.SimpleNamespace(free=disk_free))
  def run(args,**kw):
   self.assertEqual(args[:2],['du','-sb']);return '1024 fixture\n'
  with patch.dict(os.environ,FORCE_TAG=target,NYXGUARD_REPAIR_VPN=repair),patch.dict(runner,
   ROOT=self.root,STATE=self.root/'.upgrade',DIAGNOSTIC=None,
   config=lambda:{'services':self.services},cid=lambda service,**kw:service,
   version=lambda service:self.current,latest=lambda:self.fail('Unexpected network latest lookup'),
   health=lambda *args,**kw:None,inspect=lambda service,**kw:self.services[service],
   docker=self.docker,run=run,shutil=fake_disk,open=self.open_file),contextlib.redirect_stdout(io.StringIO()) as output:
   try:runner['main']()
   finally:
    for file in self.files:file.close()
    self.files.clear()
  return output.getvalue()
 def assert_installation_retained(self):
  for name,body in self.original.items():self.assertEqual((self.root/name).read_bytes(),body)
  self.assertFalse((self.root/'.upgrade/pending.json').exists())
  self.assertFalse(list((self.root/'.upgrade').glob('backup-*')))

class Containment(HostFixture):
 def test_supported_current_versions_are_noop(self):
  for version in ('5.0.0','5.0.3','5.0.10','5.0.11'):
   with self.subTest(version=version):
    self.current=version
    self.assertIn('Already current',self.run_command(version));self.assert_installation_retained()
  self.assertEqual(self.calls,[])
 def test_invalid_target_cannot_mutate_application(self):
  with self.assertRaisesRegex(RuntimeError,'version is invalid'):self.run_command('5.0.bad')
  self.assert_installation_retained();self.assertEqual(self.calls,[])
 def test_backward_or_major_target_cannot_mutate_application(self):
  self.current='5.0.10'
  for target in ('5.0.9','6.0.0'):
   with self.subTest(target=target),self.assertRaisesRegex(RuntimeError,'Only forward upgrades'):
    self.run_command(target)
   self.assert_installation_retained()
  self.assertEqual(self.calls,[])
 def test_insufficient_disk_rejects_before_stopping_or_backup(self):
  with self.assertRaisesRegex(RuntimeError,'Insufficient disk space'):self.run_command('5.0.11')
  self.assert_installation_retained();self.assertEqual(self.calls,[('ps','-aq')])

if __name__=='__main__':unittest.main()
