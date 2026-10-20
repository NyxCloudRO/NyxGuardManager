"""Exercise transient command delays and confirmed failures with a virtual clock."""
import contextlib,io,json,os,pathlib,subprocess,unittest
from unittest.mock import patch
ROOT=pathlib.Path(__file__).resolve().parents[1]
source=(ROOT/'update.sh').read_text().split("<<'NYXGUARD_HOST_UPGRADE_PY'\n",1)[1].split('\nNYXGUARD_HOST_UPGRADE_PY',1)[0]
r={'__name__':'fixture','__file__':str(ROOT/'update.sh')};exec(compile(source,'update.sh','exec'),r)
class Clock:
 def __init__(self):self.now=0
 def monotonic(self):return self.now
 def sleep(self,n):self.now+=n
class Readiness(unittest.TestCase):
 def exercise(self,fail=None,state='running',health='healthy',restarts=0,always=False,env=None):
  clock=Clock();calls=[];events=[];failed=False
  def attempt(category,value):
   nonlocal failed
   calls.append(category)
   if category==fail and (always or not failed):failed=True;clock.sleep(10);raise subprocess.TimeoutExpired(['docker','private-not-for-diagnostics'],10)
   return value
  def cid(service,**kw):return attempt('resolve:'+service,service)
  def inspect(cid,**kw):return attempt('inspect:'+cid,{'Id':cid,'RestartCount':restarts,'State':{'Status':state,'Running':state=='running','Health':{'Status':health}}})
  def docker(*a,**kw):
   if a[0]!='exec':raise AssertionError(a)
   category='database' if a[2]=='sh' else 'nginx' if a[2]=='nginx' else 'application' if a[-1]=='/app/internal/readiness-probe.mjs' else 'progress'
   return attempt(category,json.dumps({'phase':'ready','total':0,'units':0,'complete':True,'failed':False,'attempt':'one'}))
  policy={'startupIdleMs':120000,'migrationIdleMs':120000,'workUnitBudgetMs':100,'fixedBudgetMs':300000,'maximumBudgetMs':600000}
  with patch.dict(os.environ,env or {},clear=True),patch.dict(r,time=clock,cid=cid,inspect=inspect,docker=docker,diagnostic=lambda event,**kw:events.append((event,kw))),contextlib.redirect_stdout(io.StringIO()):
   r['health']({'services':['db','nyxguard-manager','vpn-client-agent']},policy)
  return calls,events,clock.now
 def test_transient_commands_retry_without_weakening_acceptance(self):
  for category in ['resolve:db','inspect:nyxguard-manager','inspect:vpn-client-agent','database','nginx','application']:
   with self.subTest(category=category):
    calls,events,elapsed=self.exercise(category);self.assertGreaterEqual(calls.count(category),2);self.assertIn('database',calls);self.assertIn('nginx',calls);self.assertIn('application',calls)
    self.assertNotIn('private-not-for-diagnostics',str(events))
 def test_exited_service_is_terminal(self):
  with self.assertRaisesRegex(RuntimeError,'Service exited'):self.exercise(state='exited')
 def test_repeated_restart_is_terminal(self):
  with self.assertRaisesRegex(RuntimeError,'repeatedly exited'):self.exercise(state='restarting',restarts=3)
 def test_unhealthy_never_passes(self):
  with self.assertRaises(RuntimeError):self.exercise(health='unhealthy')
 def test_persistent_command_delay_exhausts_deadline(self):
  with self.assertRaisesRegex(RuntimeError,'budget|deadline'):self.exercise('resolve:db',always=True)
 def test_invalid_deadline_rejects(self):
  for value in ['abc','0','1801','-1']:
   with self.subTest(value=value),self.assertRaisesRegex(RuntimeError,'NYXGUARD_READINESS_TIMEOUT_SECONDS'):self.exercise(env={'NYXGUARD_READINESS_TIMEOUT_SECONDS':value})
if __name__=='__main__':unittest.main()
