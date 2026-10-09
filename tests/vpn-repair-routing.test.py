"""Current-version VPN repair must never enter an application handover."""
import os
import pathlib
import subprocess
import tempfile
import unittest
ROOT = pathlib.Path(__file__).resolve().parents[1]

class Routing(unittest.TestCase):
    def run_repair(self, target='', repair='1'):
        with tempfile.TemporaryDirectory() as directory:
            script = (ROOT / 'update.sh').read_text().rsplit('\nmain "$@"', 1)[0]
            script += '''
need_root() { :; }
require_commands() { :; }
require_install_files() { :; }
read_current_image_ref() { echo nyxmael/nyxguardmanager:5.0.6; }
repair_vpn_only() { echo "VPN_ONLY_CURRENT=$1"; }
run_same_major_handover() { echo UNEXPECTED_HANDOVER; return 99; }
docker() { echo UNEXPECTED_DOCKER; return 98; }
main
'''
            return subprocess.run(['bash'], input=script, text=True,
                env=os.environ | {'INSTALL_DIR': directory, 'FORCE_TAG': target,
                    'NYXGUARD_REPAIR_VPN': repair}, capture_output=True)

    def test_exact_installer_recommended_506_command_routes_to_vpn_only(self):
        p = self.run_repair('5.0.6')
        self.assertEqual(p.returncode, 0, p.stderr)
        self.assertIn('VPN_ONLY_CURRENT=5.0.6', p.stdout)
        self.assertNotIn('UNEXPECTED', p.stdout)

    def test_unspecified_target_repairs_actual_current_version(self):
        p = self.run_repair()
        self.assertEqual(p.returncode, 0, p.stderr)
        self.assertIn('VPN_ONLY_CURRENT=5.0.6', p.stdout)

    def test_repair_cannot_perform_an_upgrade_or_downgrade(self):
        for target in ['5.0.5', '5.0.7']:
            p = self.run_repair(target)
            self.assertNotEqual(p.returncode, 0)
            self.assertIn('requires the current Manager version', p.stderr)
            self.assertNotIn('VPN_ONLY_CURRENT', p.stdout)
            self.assertNotIn('UNEXPECTED', p.stdout)

    def test_ordinary_same_version_remains_noop(self):
        p = self.run_repair('5.0.6', '0')
        self.assertEqual(p.returncode, 0, p.stderr)
        self.assertIn('already up to date', p.stdout)
        self.assertNotIn('VPN_ONLY_CURRENT', p.stdout)

if __name__ == '__main__':
    unittest.main()
