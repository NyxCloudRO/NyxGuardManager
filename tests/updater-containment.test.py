"""Permanent no-mutation contract for the temporary unsafe-target guard."""
import importlib.util
from pathlib import Path
import subprocess
import unittest
from unittest.mock import patch

path = Path(__file__).resolve().parents[1] / 'release-source/5.0.1/tests/public-updater-runtime.test.py'
spec = importlib.util.spec_from_file_location('runtime_contract', path)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

class Containment(unittest.TestCase):
    def run_target(self, current, target):
        fixture = module.RuntimeDetection()
        fixture.setUp()
        self.addCleanup(fixture.doCleanups)
        fixture.image['RepoTags'] = [module.REPO + ':' + current]
        fixture.image['Config']['Labels']['org.opencontainers.image.version'] = current
        fixture.image['Config']['Env'] = ['NPM_BUILD_VERSION=' + current]
        fixture.app.update(version=current, runtimeVersion=current)
        real_run = subprocess.run
        def execute(*args, **kwargs):
            kwargs['env'] = {**kwargs['env'], 'FORCE_TAG': target}
            return real_run(*args, **kwargs)
        with patch.object(module.subprocess, 'run', side_effect=execute):
            result = fixture.run_script()
        self.assertEqual((fixture.install / 'docker-compose.yml').read_bytes(), b'')
        self.assertFalse((fixture.install / '.update.lock').exists())
        calls = (fixture.root / 'calls').read_text()
        self.assertNotIn('"pull"', calls)
        self.assertNotIn('"run"', calls)
        return result

    def test_predecessors_block_before_mutation(self):
        for version in ['5.0.0', '5.0.1', '5.0.2']:
            with self.subTest(version=version):
                result = self.run_target(version, '5.0.3')
                self.assertNotEqual(result.returncode, 0)
                self.assertIn('temporarily paused', result.stderr)
                self.assertIn('Installation was not changed', result.stderr)

    def test_current_503_remains_true_noop(self):
        result = self.run_target('5.0.3', '5.0.3')
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn('already up to date', result.stdout)

    def test_existing_502_noop_is_unchanged(self):
        result = self.run_target('5.0.2', '5.0.2')
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn('already up to date', result.stdout)

if __name__ == '__main__':
    unittest.main()
