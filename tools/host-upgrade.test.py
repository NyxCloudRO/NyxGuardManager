#!/usr/bin/env python3
"""Regression checks for large-history verification and fingerprint multiplicity."""
import json,pathlib,unittest
path=pathlib.Path(__file__).resolve().parents[1]/'update.sh'
source=path.read_text().split("<<'NYXGUARD_HOST_UPGRADE_PY'\n",1)[1].split('\nNYXGUARD_HOST_UPGRADE_PY',1)[0]
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
 def test_command_failure_does_not_print_sensitive_arguments(self):
  with self.assertRaises(RuntimeError) as error:
   runner['run'](['/usr/bin/python3','-c','raise SystemExit(7)','SECRET_CANARY'],capture=True)
  self.assertNotIn('SECRET_CANARY',str(error.exception))
  self.assertIn('exit 7',str(error.exception))
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
if __name__=='__main__':unittest.main()
