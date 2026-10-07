import http from 'node:http';
import crypto from 'node:crypto';

export function sqlProgress(connection, stage, user) {
  const previous = new Map();
  let completedStatements = 0;
  return async () => {
    const query = async (sql,args) => (await connection.promise().query({ sql, timeout: 5000 },args))[0];
    const tables = await query('SELECT TABLE_NAME,TABLE_ROWS,DATA_LENGTH FROM information_schema.TABLES WHERE TABLE_SCHEMA=? ORDER BY TABLE_NAME',[stage]);
    const sessions = await query('SELECT ID,TIME,STATE,STAGE,MAX_STAGE,PROGRESS,INFO FROM information_schema.PROCESSLIST WHERE USER=?',[user]);
    for (const session of sessions) {
      const oldTime = previous.get(session.ID);
      // TIME increasing is not progress. Resetting means the client finished a
      // statement, even when its next statement has identical SQL text/state.
      if (oldTime !== undefined && Number(session.TIME) < oldTime) completedStatements++;
      previous.set(session.ID,Number(session.TIME));
    }
    return crypto.createHash('sha256').update(JSON.stringify({ tables, completedStatements,
      sessions:sessions.map(({TIME,...rest})=>rest) })).digest('hex');
  };
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
    const request = http.request({ socketPath: '/var/run/docker.sock',
      path: endpoint === '/version' ? endpoint : `/v${version}${endpoint}`, method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined }, response => {
      let raw = '';
      response.setEncoding('utf8');
      response.on('data', chunk => {
        raw += chunk;
        if (raw.length > 4_000_000) request.destroy(new Error('Docker response limit exceeded'));
      });
      response.on('error', reject);
      response.on('end', () => {
        if (response.statusCode >= 400) return reject(new Error(`Docker ${method} ${endpoint} failed: ${response.statusCode}`));
        try { resolve(raw ? JSON.parse(raw) : {}); } catch { resolve(raw); }
      });
    });
    const timer = setTimeout(() => request.destroy(new Error('Docker API deadline exceeded')), 10000);
    request.on('close', () => clearTimeout(timer));
    request.on('error', reject);
    if (body) request.write(JSON.stringify(body));
    request.end();
  });
}

export async function runSqlHelper({ image, dbId, recoveryId, script, env, binds, progress,
  idleMs = 300000 }) {
  const created = await docker('POST', `/containers/create?name=nyx-sql-${recoveryId}-${Date.now()}`, {
    Image: image, Entrypoint: ['sh', '-c'], Cmd: [script], Env: env,
    Healthcheck: { Test: ['NONE'] }, Labels: { 'nyxguard.purpose': 'isolated-recovery-sql' },
    HostConfig: { Binds: binds, NetworkMode: `container:${dbId}`, RestartPolicy: { Name: 'no' } },
  });
  let signature, lastProgress = Date.now();
  try {
    await docker('POST', `/containers/${created.Id}/start`);
    while (true) {
      const state = await docker('GET', `/containers/${created.Id}/json`);
      if (!state.State.Running) {
        if (state.State.ExitCode !== 0) throw new Error(`SQL helper exited ${state.State.ExitCode}; evidence container ${created.Id}`);
        await docker('DELETE', `/containers/${created.Id}`);
        return;
      }
      const next = await progress();
      if (next !== signature) { signature = next; lastProgress = Date.now(); }
      if (Date.now() - lastProgress > idleMs) {
        // This helper has no live-schema privilege when importing. Stopping it
        // cannot truncate a live restore; an unvalidated stage is never promoted.
        await docker('POST', `/containers/${created.Id}/stop?t=5`);
        throw new Error(`SQL helper made no observable progress; evidence container ${created.Id}`);
      }
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  } catch (error) {
    // Retain failed helpers instead of losing their exit state. Never force
    // delete an active helper from a finally block.
    throw error;
  }
}
