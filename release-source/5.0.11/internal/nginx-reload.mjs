import {readFile, readdir, readlink, stat} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';
const execute = promisify(execFile);

// nginx -s reload acknowledges signal delivery, not activation. Observe the
// replacement worker generation and retirement of the previous workers.
// Read socket ownership as the worker's actual UID: container root can lack
// ptrace capability even when that UID can inspect its own /proc descriptors.
// A retiring worker may still serve the admin API requesting this reload.
// Require its listeners and all proxy client sockets to close, allowing only
// the admin listener's active response to drain without a circular wait.
async function localSnapshot() {
  const raw = (await readFile('/run/nginx/nginx.pid', 'utf8')).trim();
  if (!/^[1-9]\d*$/.test(raw)) throw new Error('Nginx master identity unavailable');
  const master = Number(raw);
  const workers = [];
  for (const pid of (await readdir('/proc')).filter(x => /^\d+$/.test(x))) {
    try {
      const stat = await readFile('/proc/' + pid + '/stat', 'utf8');
      const fields = stat.slice(stat.lastIndexOf(')') + 2).split(' ');
      if (Number(fields[1]) !== master) continue;
      const command = (await readFile('/proc/' + pid + '/cmdline', 'utf8')).replaceAll('\0', ' ').trim();
      if (!command.startsWith('nginx: worker process')) continue;
      workers.push({identity: pid + ':' + fields[19], shuttingDown: command.includes('shutting down')});
    } catch (error) { if (error.code !== 'ENOENT' && error.code !== 'ESRCH') throw error; }
  }
  for (const worker of workers) {
    const pid = worker.identity.split(':')[0];
    worker.inodes = [];
    try {
      for (const fd of await readdir('/proc/' + pid + '/fd')) {
        try {
          const link = await readlink('/proc/' + pid + '/fd/' + fd);
          const inode = /^socket:\[(\d+)\]$/.exec(link)?.[1];
          if (inode) worker.inodes.push(inode);
        } catch (error) { if (error.code === 'EACCES') worker.inodes.push('unreadable');
          else if (error.code !== 'ENOENT' && error.code !== 'ESRCH') throw error; }
      }
    } catch (error) { if (error.code === 'EACCES') worker.inodes.push('unreadable');
      else if (error.code !== 'ENOENT' && error.code !== 'ESRCH') throw error; }
  }
  const connections = new Map();
  for (const protocol of ['tcp', 'tcp6', 'udp', 'udp6']) {
    const lines = (await readFile('/proc/net/' + protocol, 'utf8')).trim().split('\n').slice(1);
    for (const line of lines) {
      const fields = line.trim().split(/\s+/);
      connections.set(fields[9], {port: parseInt(fields[1].split(':')[1], 16),
        listening: protocol.startsWith('udp') || fields[3] === '0A'});
    }
  }
  const unix = (await readFile('/proc/net/unix', 'utf8')).trim().split('\n').slice(1);
  for (const line of unix) {
    const fields = line.trim().split(/\s+/);
    // Internal worker channel socketpairs have no path and are not listeners.
    connections.set(fields[6], {port: fields[7] ? 'unix:' + fields[7] : 'worker-channel', listening: fields[3] === '00010000'});
  }
  for (const worker of workers) {
    worker.sockets = worker.inodes.map(inode => connections.get(inode) || {port:'unknown',listening:true});
    delete worker.inodes;
  }
  return {master, workers};
}

async function snapshot() {
  // Discover the effective worker identity without relying on fixed PUID/PGID.
  const master = Number((await readFile('/run/nginx/nginx.pid', 'utf8')).trim());
  for (const pid of (await readdir('/proc')).filter(x => /^\d+$/.test(x))) {
    try {
      const fields = (await readFile('/proc/' + pid + '/stat', 'utf8')).split(') ').at(-1).split(' ');
      if (Number(fields[1]) !== master) continue;
      const command = await readFile('/proc/' + pid + '/cmdline', 'utf8');
      if (!command.startsWith('nginx: worker process')) continue;
      const owner = await stat('/proc/' + pid);
      if (process.getuid() === owner.uid) return localSnapshot();
      const {stdout} = await execute(process.execPath, [fileURLToPath(import.meta.url), '--worker-snapshot'],
        {uid: owner.uid, gid: owner.gid, timeout: 3000, maxBuffer: 1024 * 1024});
      return JSON.parse(stdout);
    } catch (error) { if (error.code !== 'ENOENT' && error.code !== 'ESRCH') throw error; }
  }
  throw new Error('Nginx worker identity unavailable');
}

export function activated(before, after) {
  if (before.master !== after.master || !before.workers.length
    || before.workers.some(worker => worker.sockets?.some(socket => socket.port === 'unknown'))) return false;
  const identities = new Set(before.workers.map(worker => worker.identity));
  const retired = after.workers.filter(worker => identities.has(worker.identity));
  const proxyPorts = new Set(before.workers.flatMap(worker => (worker.sockets || [])
    .filter(socket => socket.listening && socket.port !== 8443).map(socket => socket.port)));
  const drained = retired.every(worker => worker.shuttingDown && Array.isArray(worker.sockets)
    && worker.sockets.every(socket => !socket.listening && !proxyPorts.has(socket.port)));
  return (retired.length === 0 || drained)
    && after.workers.some(worker => !identities.has(worker.identity) && !worker.shuttingDown
      && worker.sockets?.some(socket => socket.listening && socket.port !== 'unknown'));
}

export function createAcknowledgedReload({observe = snapshot, pause = delay, timeoutMs = 15000, clock = () => performance.now()} = {}) {
  let queue = Promise.resolve();
  return signal => {
    const operation = queue.then(async () => {
      const deadline = clock() + timeoutMs;
      let before = await observe();
      while (before.workers.some(worker => worker.sockets?.some(socket => socket.port === 'unknown')) && clock() < deadline) {
        await pause(25);
        before = await observe();
      }
      if (before.workers.some(worker => worker.sockets?.some(socket => socket.port === 'unknown'))) {
        const error = new Error('Nginx worker socket state could not be inspected before reload.');
        error.code = 'NGINX_RELOAD_ACTIVATION_TIMEOUT';
        error.outcome = 'failed';
        throw error;
      }
      await signal();
      do {
        if (activated(before, await observe())) return;
        await pause(25);
      } while (clock() < deadline);
      const error = new Error('Nginx reload activation could not be confirmed. Configuration may be partially applied; check Diagnostics & Support before retrying.');
      error.code = 'NGINX_RELOAD_ACTIVATION_TIMEOUT';
      error.outcome = 'partially_completed';
      throw error;
    });
    queue = operation.catch(() => {});
    return operation;
  };
}
export const acknowledgedReload = createAcknowledgedReload();

if (process.argv[1] === fileURLToPath(import.meta.url) && process.argv[2] === '--worker-snapshot') {
  console.log(JSON.stringify(await localSnapshot()));
}
