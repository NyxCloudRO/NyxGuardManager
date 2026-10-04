"""Runtime reconciliation contract; run with python3 -m unittest discover -s this directory -p '*test.py'."""
import copy
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

SCRIPT = Path(__file__).resolve().parents[3] / 'update.sh'
REPO = 'nyxmael/nyxguardmanager'
IMAGE = 'sha256:' + 'a' * 64


class RuntimeDetection(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.install = self.root / 'install'
        self.install.mkdir()
        (self.install / '.env').touch()
        (self.install / 'docker-compose.yml').touch()
        self.container = {'Id': 'b' * 64, 'Image': IMAGE,
            'Config': {'Image': IMAGE, 'Labels': {
                'com.docker.compose.project': 'fixture',
                'com.docker.compose.project.config_files': str(self.install / 'docker-compose.yml')}},
            'State': {'Running': True, 'Health': {'Status': 'healthy'}}}
        self.image = {'Id': IMAGE, 'RepoTags': [REPO + ':5.0.2'], 'RepoDigests': [REPO + '@' + IMAGE],
            'Config': {'Labels': {'org.opencontainers.image.version': '5.0.2'},
                       'Env': ['NPM_BUILD_VERSION=5.0.2']}}
        self.app = {'version': '5.0.2', 'runtimeVersion': '5.0.2', 'blocked': False}
        self.configured = REPO + ':5.0.1'
        self.containers = [self.container]
        mock = self.root / 'docker'
        mock.write_text('''#!/usr/bin/env python3
import json,os,sys
from pathlib import Path
p=Path(os.environ['FIXTURE']);s=json.loads((p/'state.json').read_text());a=sys.argv[1:]
with (p/'calls').open('a') as f:f.write(json.dumps(a)+'\\n')
if a[:2]==['compose','version']: print('fixture')
elif a[0]=='compose' and a[-3:]==['config','--format','json']: print(json.dumps(s['config']))
elif a[0]=='ps': print('\\n'.join(c['Id'] for c in s['containers']))
elif a[0]=='inspect': print(json.dumps(s['containers']))
elif a[:2]==['image','inspect']: print(json.dumps([s['image']]))
elif a[0]=='exec': print(json.dumps(s['app']))
else: sys.exit('Unexpected mutating Docker invocation')
''')
        mock.chmod(0o755)
        # No-op must never reach TUN setup even on a host that lacks TUN.
        modprobe = self.root / 'modprobe'
        modprobe.write_text('#!/bin/sh\necho invoked > "$FIXTURE/tun-mutated"\nexit 1\n')
        modprobe.chmod(0o755)

    def run_script(self):
        state = {'containers': self.containers, 'image': self.image, 'app': self.app,
                 'config': {'name': 'fixture', 'services': {'nyxguard-manager': {'image': self.configured}}}}
        (self.root / 'state.json').write_text(json.dumps(state))
        env = {**os.environ, 'PATH': str(self.root) + ':' + os.environ['PATH'],
               'FIXTURE': str(self.root), 'INSTALL_DIR': str(self.install), 'FORCE_TAG': '5.0.2',
               'NYXGUARD_AUTO_YES': '1', 'NYXGUARD_REPAIR_VPN': '0'}
        result = subprocess.run(['bash', str(SCRIPT)], env=env, capture_output=True, text=True)
        self.assertFalse((self.root / 'tun-mutated').exists())
        return result

    def test_stale_compose_verified_runtime_is_noop(self):
        result = self.run_script()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn('Current Manager: 5.0.2', result.stdout)
        self.assertIn('already up to date', result.stdout)
        self.assertEqual((self.install / 'docker-compose.yml').read_text(), '')

    def test_matching_compose_tag_is_noop(self):
        self.configured = REPO + ':5.0.2'
        self.container['Config']['Image'] = self.configured
        self.test_stale_compose_verified_runtime_is_noop()

    def test_digest_reference_is_noop(self):
        self.container['Config']['Image'] = REPO + '@' + IMAGE
        self.test_stale_compose_verified_runtime_is_noop()

    def test_ambiguous_stopped_rollback_fails(self):
        other = copy.deepcopy(self.container)
        other['Id'] = 'c' * 64
        other['State']['Running'] = False
        self.containers.append(other)
        self.assertNotEqual(self.run_script().returncode, 0)

    def test_no_container_fails(self):
        self.containers = []
        self.assertNotEqual(self.run_script().returncode, 0)

    def test_conflicting_sources_fail_closed(self):
        for source in ['label', 'image_env', 'app', 'runtime_env', 'tag', 'identity', 'project', 'health', 'recovery']:
            with self.subTest(source=source):
                saved = copy.deepcopy((self.image, self.container, self.app))
                if source == 'label': self.image['Config']['Labels']['org.opencontainers.image.version'] = '5.0.1'
                if source == 'image_env': self.image['Config']['Env'] = ['NPM_BUILD_VERSION=5.0.1']
                if source == 'app': self.app['version'] = '5.0.1'
                if source == 'runtime_env': self.app['runtimeVersion'] = '5.0.1'
                if source == 'tag': self.container['Config']['Image'] = REPO + ':5.0.1'
                if source == 'identity': self.image['Id'] = 'sha256:' + 'c' * 64
                if source == 'project': self.container['Config']['Labels']['com.docker.compose.project'] = 'other'
                if source == 'health': self.container['State']['Health']['Status'] = 'unhealthy'
                if source == 'recovery': self.app['blocked'] = True
                self.assertNotEqual(self.run_script().returncode, 0)
                self.image, self.container, self.app = saved
                self.containers = [self.container]


if __name__ == '__main__':
    unittest.main()
