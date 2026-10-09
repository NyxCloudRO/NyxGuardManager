import http from 'node:http';
import crypto from 'node:crypto';
import mysql from 'mysql2';

export function sqlProgress(connection, stage, user) {
  const previous = new Map();
  let completedStatements = 0;
  // Monitoring uses its own connection: a client deadline must never poison
  // the control connection needed to revoke credentials and clean staging.
  const monitorConfig = {host: connection.config.host, port: connection.config.port,
    user: connection.config.user, password: connection.config.password, connectTimeout: 5000};
  let monitor;
  const progress = async () => {
    monitor ||= mysql.createConnection(monitorConfig);
    const query = async (sql,args) => (await monitor.promise().query({ sql, timeout: 5000 },args))[0];
    // Aria table statistics can wait on the importer. Never open its tables
    // during restore; processlist reports statements and index-build progress.
    let sessions;
    try { sessions = await query('SELECT ID,TIME_MS,STATE,STAGE,MAX_STAGE,PROGRESS,INFO FROM information_schema.PROCESSLIST WHERE USER=?',[user]); }
    catch (error) { monitor.destroy(); monitor = null; throw error; }
    for (const session of sessions) {
      const oldTime = previous.get(session.ID);
      // TIME increasing is not progress. Resetting means the client finished a
      // statement, even when its next statement has identical SQL text/state.
      if (oldTime !== undefined && Number(session.TIME_MS) < oldTime) completedStatements++;
      previous.set(session.ID,Number(session.TIME_MS));
    }
    return crypto.createHash('sha256').update(JSON.stringify({ completedStatements,
      sessions:sessions.map(({TIME_MS,...rest})=>rest) })).digest('hex');
  };
  progress.close = () => monitor?.destroy();
  return progress;
}

let version;
export async function dockerApiVersion() {
  if(version===undefined) {
    const server=await docker('GET','/version');
    const minimum=server.MinAPIVersion||'1.24';
    version=Number(minimum.split('.')[1])>41?minimum:'1.41';
  }
  return version;
}
export async function docker(method, endpoint, body) {
  if (version === undefined && endpoint !== '/version') {
    await dockerApiVersion();
  }
  return new Promise((resolve, reject) => {
    // Stop permits Docker the full grace interval, followed by the ordinary
    // ten-second API response budget. All other requests retain their deadline.
    const stop = method === 'POST' && endpoint.match(/^\/containers\/[^/?]+\/stop\?t=(\d+)$/);
    const deadlineMs = 10000 + (stop ? Number(stop[1]) * 1000 : 0);
    const fail = error => {
      // Keep bounded request context, never URLs/names/bodies/environments.
      error.dockerRequest = {method,operation:stop?'container-stop':'docker-api',deadlineMs,
        ...(stop?{graceMs:Number(stop[1])*1000}:{})};
      reject(error);
    };
    const request = http.request({ socketPath: '/var/run/docker.sock',
      path: endpoint === '/version' ? endpoint : `/v${version}${endpoint}`, method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined }, response => {
      let raw = '';
      response.setEncoding('utf8');
      response.on('data', chunk => {
        raw += chunk;
        if (raw.length > 4_000_000) request.destroy(new Error('Docker response limit exceeded'));
      });
      response.on('error', fail);
      response.on('end', () => {
        if (response.statusCode >= 400) return fail(new Error(`Docker ${method} ${endpoint} failed: ${response.statusCode}`));
        try { resolve(raw ? JSON.parse(raw) : {}); } catch { resolve(raw); }
      });
    });
    const timer = setTimeout(() => request.destroy(new Error('Docker API deadline exceeded')), deadlineMs);
    request.on('close', () => clearTimeout(timer));
    request.on('error', fail);
    if (body) request.write(JSON.stringify(body));
    request.end();
  });
}

export async function runSqlHelper({ image, dbId, recoveryId, script, env, binds, progress,
  idleMs = 300000, totalMs = 1800000 }) {
  const created = await docker('POST', `/containers/create?name=nyx-sql-${recoveryId}-${Date.now()}`, {
    Image: image, Entrypoint: ['sh', '-c'], Cmd: [script], Env: env,
    Healthcheck: { Test: ['NONE'] }, Labels: { 'nyxguard.purpose': 'isolated-recovery-sql' },
    HostConfig: { Binds: binds, NetworkMode: `container:${dbId}`, RestartPolicy: { Name: 'no' } },
  });
  const started = Date.now();
  let signature, lastProgress = started, monitorFailure;
  try {
    await docker('POST', `/containers/${created.Id}/start`);
    while (true) {
      const state = await docker('GET', `/containers/${created.Id}/json`);
      if (!state.State.Running) {
        if (state.State.ExitCode !== 0) throw new Error(`SQL helper exited ${state.State.ExitCode}; evidence container ${created.Id}`);
        await docker('DELETE', `/containers/${created.Id}`);
        return;
      }
      if (Date.now() - started > totalMs) throw new Error(`SQL helper total deadline exceeded; evidence container ${created.Id}`);
      let next;
      try { next = await progress(); }
      catch (cause) {
        // A missed observation is not proof the import failed. It must never
        // reset progress or the total deadline; retry on a fresh connection.
        monitorFailure = cause;
        console.error(`SQL progress observation unavailable; evidence container ${created.Id}; code ${/^[A-Z0-9_]+$/.test(cause.code || '') ? cause.code : 'UNKNOWN'}`);
      }
      if (next !== undefined && next !== signature) { signature = next; lastProgress = Date.now(); monitorFailure = undefined; }
      if (Date.now() - lastProgress > idleMs) {
        // This helper has no live-schema privilege when importing. Stopping it
        // cannot truncate a live restore; an unvalidated stage is never promoted.
        await docker('POST', `/containers/${created.Id}/stop?t=5`);
        throw new Error(`SQL helper made no observable progress; evidence container ${created.Id}`, {cause:monitorFailure});
      }
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  } catch (error) {
    // Retain failed helpers instead of losing their exit state. Never force
    // delete an active helper from a finally block.
    // Stop the owned helper before credential/schema cleanup. Preserve its
    // exit state and logs; a failed monitor must not leave an importer running.
    try {
      const state = await docker('GET', `/containers/${created.Id}/json`);
      if (state.State.Running) await docker('POST', `/containers/${created.Id}/stop?t=5`);
    } catch (cleanup) { throw new AggregateError([error, cleanup], 'SQL helper termination uncertain; retained evidence requires review'); }
    throw error;
  } finally { progress.close?.(); }
}
