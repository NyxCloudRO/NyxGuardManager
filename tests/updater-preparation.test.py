"""Run the actual host readiness loop against bounded, isolated startup traces."""
import contextlib
import io
import json
import os
import pathlib
import unittest
from unittest.mock import patch

ROOT = pathlib.Path(__file__).resolve().parents[1]
source = (ROOT / 'update.sh').read_text().split("<<'NYXGUARD_HOST_UPGRADE_PY'\n", 1)[1].split('\nNYXGUARD_HOST_UPGRADE_PY', 1)[0]
runner = {'__name__': 'startup_fixture', '__file__': str(ROOT / 'update.sh')}
exec(compile(source, 'update.sh', 'exec'), runner)


class Clock:
    now = 0

    def monotonic(self):
        return self.now

    def sleep(self, seconds):
        self.now += seconds


class Preparation(unittest.TestCase):
    def run_health(self, *, progress_at=70, ready_at=90, phase='configuration',
                   lost_at=None, failed=False, exited_at=None, timeout=None):
        self.clock = Clock()
        self.events = []
        self.calls = []
        clock = self.clock

        def cid(service, **kwargs):
            return service

        def inspect(service, **kwargs):
            exited = service == 'nyxguard-manager' and exited_at is not None and clock.now >= exited_at
            healthy = service != 'nyxguard-manager' or clock.now >= ready_at
            return {'Id': service, 'RestartCount': 0, 'State': {
                'Status': 'exited' if exited else 'running', 'Running': not exited,
                'Health': {'Status': 'healthy' if healthy else 'starting'}}}

        def docker(*args, **kwargs):
            self.assertEqual(args[0], 'exec')
            if args[-1] == runner['STARTUP_STATUS']:
                self.calls.append('progress')
                if clock.now < progress_at or (lost_at is not None and clock.now >= lost_at):
                    return 'null'
                return json.dumps({'phase': 'failed' if failed else 'ready' if clock.now >= ready_at else phase,
                                   'total': 0, 'units': 0, 'complete': clock.now >= ready_at,
                                   'failed': failed, 'attempt': 'isolated-startup'})
            category = 'application' if args[-1] == '/app/internal/readiness-probe.mjs' else 'database' if args[2] == 'sh' else 'nginx'
            self.calls.append(category)
            if category == 'application' and clock.now < ready_at:
                raise RuntimeError('Application not ready')
            return ''

        policy = {'startupIdleMs': 60000, 'migrationIdleMs': 45000,
                  'workUnitBudgetMs': 100, 'fixedBudgetMs': 120000, 'maximumBudgetMs': 1800000}
        env = {} if timeout is None else {'NYXGUARD_READINESS_TIMEOUT_SECONDS': str(timeout)}
        with patch.dict(os.environ, env, clear=True), patch.dict(
                runner, time=clock, cid=cid, inspect=inspect, docker=docker,
                diagnostic=lambda event, **fields: self.events.append((event, fields))), \
                contextlib.redirect_stdout(io.StringIO()):
            runner['health']({'services': ['db', 'nyxguard-manager', 'vpn-client-agent']}, policy)

    def test_preparation_longer_than_backend_idle_limit_can_complete(self):
        self.run_health()
        self.assertGreaterEqual(self.clock.now, 90)
        for check in ['application', 'database', 'nginx']:
            self.assertIn(check, self.calls)

    def test_preparation_is_visible_in_safe_diagnostics(self):
        self.run_health()
        snapshots = [fields for event, fields in self.events if event == 'readiness']
        self.assertTrue(any(s.get('startupStage') == 'container-preparation' for s in snapshots))

    def test_absent_backend_progress_still_has_a_hard_deadline(self):
        with self.assertRaisesRegex(RuntimeError, 'initialization budget'):
            self.run_health(progress_at=1000, ready_at=1000)
        self.assertGreaterEqual(self.clock.now, 300)
        self.assertLess(self.clock.now, 303)

    def test_explicit_shorter_deadline_is_not_extended(self):
        with self.assertRaisesRegex(RuntimeError, 'budget'):
            self.run_health(timeout=45)
        self.assertLessEqual(self.clock.now, 46)

    def test_backend_idle_watchdog_starts_with_real_backend_progress(self):
        with self.assertRaisesRegex(RuntimeError, 'stopped completing work during configuration'):
            self.run_health(ready_at=1000)
        self.assertGreaterEqual(self.clock.now, 130)
        self.assertLess(self.clock.now, 140)  # Includes the existing progress-sampling cadence.

    def test_migration_idle_watchdog_is_preserved(self):
        with self.assertRaisesRegex(RuntimeError, 'stopped completing work during migration'):
            self.run_health(ready_at=1000, phase='migration-start')
        self.assertGreaterEqual(self.clock.now, 115)
        self.assertLess(self.clock.now, 124)

    def test_progress_loss_after_backend_start_does_not_get_fresh_preparation_grace(self):
        with self.assertRaisesRegex(RuntimeError, 'progress became unavailable'):
            self.run_health(progress_at=0, lost_at=12, ready_at=1000)
        self.assertLess(self.clock.now, 70)

    def test_failed_backend_progress_is_terminal(self):
        with self.assertRaisesRegex(RuntimeError, 'startup reported failure'):
            self.run_health(failed=True)
        self.assertLess(self.clock.now, 80)

    def test_progress_loss_during_migration_keeps_the_migration_idle_limit(self):
        with self.assertRaisesRegex(RuntimeError, 'progress became unavailable'):
            self.run_health(progress_at=0, lost_at=12, ready_at=1000, phase='migration-start')
        self.assertLess(self.clock.now, 58)

    def test_service_exit_during_preparation_is_terminal(self):
        with self.assertRaisesRegex(RuntimeError, 'Service exited'):
            self.run_health(exited_at=80, progress_at=1000, ready_at=1000)
        self.assertLess(self.clock.now, 85)


if __name__ == '__main__':
    unittest.main()
