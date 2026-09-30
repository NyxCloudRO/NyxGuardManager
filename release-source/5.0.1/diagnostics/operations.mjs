import http from 'node:http';

const MAX_BYTES = 128 * 1024;
const TIMEOUT_MS = 750;

// Inspect only service identity and health. Docker's full inspect response may
// contain protected environment data; never return or log the raw response.
export function inspectContainer(name, { socketPath = '/var/run/docker.sock' } = {}) {
  return new Promise((resolve) => {
    let settled = false;
    const done = (value) => { if (!settled) { settled = true; resolve(value); } };
    const req = http.get({ socketPath, path: `/containers/${name}/json`, timeout: TIMEOUT_MS }, (res) => {
      if (res.statusCode === 404) { res.resume(); done({ missing: true }); return; }
      if (res.statusCode !== 200 || Number(res.headers['content-length']) > MAX_BYTES) {
        res.destroy(); done(null); return;
      }
      const parts = [];
      let size = 0;
      res.on('data', (part) => {
        size += part.length;
        if (size > MAX_BYTES) { res.destroy(); done(null); }
        else parts.push(part);
      });
      res.on('end', () => {
        try {
          const value = JSON.parse(Buffer.concat(parts).toString('utf8'));
          done({ id: typeof value.Id === 'string' ? value.Id : null,
            running: value.State?.Running === true,
            health: ['healthy', 'unhealthy', 'starting'].includes(value.State?.Health?.Status)
              ? value.State.Health.Status : 'unknown',
            networkMode: typeof value.HostConfig?.NetworkMode === 'string'
              ? value.HostConfig.NetworkMode : null });
        } catch { done(null); }
      });
      res.on('error', () => done(null));
    });
    req.on('timeout', () => { req.destroy(); done(null); });
    req.on('error', () => done(null));
  });
}

export async function operationalSnapshot({ version, revision, uptimeSeconds, databaseReachable,
  migrationsCurrent, appliedMigrations, expectedMigrations, updateStatus, manager, vpn, vpnReachable }) {
  const managerId = manager?.id;
  const vpnInstalled = vpn?.missing === true ? false : vpn ? true : null;
  const vpnHealth = vpnInstalled === false ? 'not_installed' : vpnReachable === false ? 'unavailable' : !vpn ? 'unknown'
    : !vpn.running ? 'stopped' : vpn.health;
  const topology = vpnInstalled === false ? 'not_installed' : vpnReachable === false ? 'agent_unreachable'
    : !managerId || !vpn?.networkMode ? 'unknown'
      : vpn.networkMode === `container:${managerId}` ? 'manager_namespace' : 'unexpected';
  return {
    manager: { version, revision: revision || null, uptimeSeconds, uptimeScope: 'manager_process',
      health: manager?.running && manager.health === 'healthy' ? 'healthy'
        : !manager ? 'unknown' : manager.health },
    database: { reachable: databaseReachable === true,
      migrationsCurrent: migrationsCurrent === true,
      appliedMigrations: Number.isSafeInteger(appliedMigrations) ? appliedMigrations : null,
      expectedMigrations: Number.isSafeInteger(expectedMigrations) ? expectedMigrations : null },
    update: updateStatus ? {
      currentVersion: updateStatus.current,
      stage: updateStatus.stage,
      downloadedVersion: updateStatus.downloadedVersion || null,
      pendingVersion: updateStatus.pendingVersion || null,
      restartPending: updateStatus.restartPending === true,
      interventionRequired: updateStatus.recoveryRequired === true,
      cleanupPending: updateStatus.recoveryCleanupPending ? true : false,
    } : { currentVersion: version, stage: 'unavailable' },
    vpn: { installed: vpnInstalled, health: vpnHealth, topology },
  };
}
