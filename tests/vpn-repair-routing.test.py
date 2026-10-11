"""Legacy VPN repair requests cannot silently enter application upgrades."""
import importlib.util,pathlib,unittest
path=pathlib.Path(__file__).with_name('updater-containment.test.py')
spec=importlib.util.spec_from_file_location('host_containment',path)
fixture=importlib.util.module_from_spec(spec);spec.loader.exec_module(fixture)

class Routing(fixture.HostFixture):
 def test_obsolete_repair_flag_rejects_all_targets_before_docker(self):
  for target in ('','5.0.0','5.0.11'):
   with self.subTest(target=target),self.assertRaisesRegex(RuntimeError,'separate VPN Agent activation'):
    self.run_command(target,repair='1')
   self.assertEqual(self.calls,[])
   for name,body in self.original.items():self.assertEqual((self.root/name).read_bytes(),body)
   self.assertFalse((self.root/'.upgrade').exists())
 def test_ordinary_current_version_remains_noop(self):
  self.assertIn('Already current',self.run_command('5.0.0',repair='0'))
  self.assert_installation_retained();self.assertEqual(self.calls,[])

if __name__=='__main__':unittest.main()
