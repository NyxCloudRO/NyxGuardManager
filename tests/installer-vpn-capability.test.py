"""Installer policy regression: usable TUN wins over vendor; unavailable VPN is explicit."""
import os, pathlib, subprocess, tempfile, unittest, shlex
ROOT = pathlib.Path(__file__).resolve().parents[1]

class InstallerVPNCapability(unittest.TestCase):
    def install(self, usable=True, preparation=False, virt='none', kernel='generic', required=False):
        with tempfile.TemporaryDirectory() as directory:
            script = (ROOT / 'install.sh').read_text().rsplit('\nmain "$@"', 1)[0]
            script += r'''
for function in install_base_packages install_docker install_node_exporter ensure_install_dir ensure_env ensure_socket_gid ensure_vault_key write_compose_file write_version_file; do
  eval "$function() { :; }"
done
have_cmd() { return 0; }
tun_is_usable() { [[ "$TUN_STATE" == usable ]]; }
modprobe() { if [[ "$PREP_SUCCEEDS" == yes ]]; then TUN_STATE=usable; fi; }
mkdir() { echo 'PREP mkdir'; }
mknod() { echo 'PREP mknod'; if [[ "$PREP_SUCCEEDS" == yes ]]; then TUN_STATE=usable; fi; }
chmod() { echo 'PREP chmod'; }
systemd-detect-virt() { echo VIRT_PROBE >&2; echo "$TEST_VIRT"; }
uname() { echo "$TEST_KERNEL"; }
hostname() { echo 192.0.2.1; }
docker() {
  if [[ "$1 $2" == "image inspect" ]]; then echo 5.0.4;
  else echo "DOCKER $*"; fi
}
start_vpn_stack() { echo VPN_STACK; }
install_systemd_unit() { echo "SYSTEMD_VPN=$1"; }
main
'''
            env = os.environ | {'INSTALL_DIR': directory, 'APP_TAG': '5.0.4',
                  'NYXGUARD_REQUIRE_VPN': '1' if required else '0',
                  'TUN_STATE': 'usable' if usable else 'missing',
                  'PREP_SUCCEEDS': 'yes' if preparation else 'no',
                  'TEST_VIRT': virt, 'TEST_KERNEL': kernel}
            return subprocess.run(['bash'], input=script, text=True, env=env, capture_output=True)

    def test_usable_tun_installs_agent_without_vendor_detection(self):
        for vendor in ['none', 'kvm', 'vmware', 'microsoft', 'lxc', 'unknown']:
            with self.subTest(vendor=vendor):
                result = self.install(virt=vendor, kernel='7.0-pve')
                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertIn('VPN_STACK', result.stdout)
                self.assertIn('SYSTEMD_VPN=1', result.stdout)
                self.assertNotIn('PREP ', result.stdout)
                self.assertNotIn('VIRT_PROBE', result.stderr)
                self.assertNotIn('pending', result.stdout)

    def test_guest_preparation_retests_access_and_installs_agent(self):
        result = self.install(usable=False, preparation=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn('VPN_STACK', result.stdout)
        self.assertNotIn('VIRT_PROBE', result.stderr)

    def test_missing_tun_distinguishes_manager_success_and_supported_repair(self):
        result = self.install(usable=False, virt='lxc', kernel='7.0-pve')
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn('NyxGuard Manager 5.0.4 is up and running.', result.stdout)
        self.assertIn('VPN Agent pending — TUN unavailable', result.stdout)
        self.assertIn('NYXGUARD_REPAIR_VPN=1', result.stdout)
        self.assertIn('pct set <CTID> --dev0 path=/dev/net/tun,mode=0666', result.stdout)
        self.assertIn('SYSTEMD_VPN=0', result.stdout)
        self.assertNotIn('VPN_STACK', result.stdout)

    def test_other_restricted_environment_gets_no_proxmox_commands(self):
        for vendor in ['lxc', 'docker', 'unknown']:
            with self.subTest(vendor=vendor):
                result = self.install(usable=False, virt=vendor)
                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertIn('host must expose usable TUN character device 10:200', result.stdout)
                self.assertNotIn('pct set', result.stdout)

    def test_required_vpn_fails_before_starting_stack(self):
        result = self.install(usable=False, required=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertNotIn('DOCKER ', result.stdout)
        self.assertNotIn('VPN_STACK', result.stdout)
        self.assertNotIn('Install complete.', result.stdout)

if __name__ == '__main__':
    unittest.main()
