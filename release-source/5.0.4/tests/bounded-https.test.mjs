import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import https from 'node:https';
import net from 'node:net';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { ProxyAgent } from 'proxy-agent';
import { fetchText } from '../internal/bounded-https.mjs';

const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'nyxguard-https-test-'));
after(() => fs.rmSync(temporary, { recursive: true, force: true }));
execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes',
  '-keyout', path.join(temporary, 'key.pem'), '-out', path.join(temporary, 'cert.pem'),
  '-subj', '/CN=localhost', '-days', '1'], { stdio: 'ignore' });
const tls = { key: fs.readFileSync(path.join(temporary, 'key.pem')), cert: fs.readFileSync(path.join(temporary, 'cert.pem')) };
const policy = { connectMs: 250, totalMs: 350, maxBytes: 128 };

async function withServer(server, callback) {
  const sockets = new Set();
  server.on('connection', socket => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try { await callback(server.address().port); }
  finally {
    for (const socket of sockets) socket.destroy();
    await new Promise(resolve => server.close(resolve));
  }
}

function localFetch(port) {
  return fetchText(`https://127.0.0.1:${port}/`, {
    agent: new https.Agent({ rejectUnauthorized: false }), policy,
  });
}

test('successful HTTPS response is returned', async () => {
  await withServer(https.createServer(tls, (_req, res) => res.end('ranges')), async port => {
    assert.equal(await localFetch(port), 'ranges');
  });
});

test('stalled proxy CONNECT is rejected before a request socket exists', async () => {
  let connected = false, closed = false;
  const proxy = net.createServer(socket => {
    socket.on('data', () => { connected = true; });
    socket.on('close', () => { closed = true; });
  });
  await withServer(proxy, async port => {
    const started = Date.now();
    await assert.rejects(fetchText('https://example.invalid/', {
      agentFactory: signal => new ProxyAgent({ signal, getProxyForUrl: () => `http://127.0.0.1:${port}` }), policy,
    }), /connection deadline/);
    assert.equal(connected, true, 'fault must reach the actual proxy CONNECT');
    assert.ok(Date.now() - started < 1500, 'request must settle within a bounded time');
    // Assert before withServer cleanup; cleanup must not hide a leaked tunnel.
    const closeDeadline = Date.now() + 500;
    while (!closed && Date.now() < closeDeadline) await new Promise(resolve => setTimeout(resolve, 10));
    assert.equal(closed, true, 'deadline must also close unfinished CONNECT socket');
  });
});

test('TLS handshake stall has a connection deadline', async () => {
  await withServer(net.createServer(() => {}), async port => {
    await assert.rejects(localFetch(port), /connection deadline/);
  });
});

test('continuous slow response cannot extend the total deadline', async () => {
  await withServer(https.createServer(tls, (_req, res) => {
    res.writeHead(200);
    res.write('x');
    const timer = setInterval(() => res.write('x'), 50);
    res.on('close', () => clearInterval(timer));
  }), async port => {
    await assert.rejects(localFetch(port), /request deadline/);
  });
});

test('oversized response is rejected', async () => {
  await withServer(https.createServer(tls, (_req, res) => res.end('x'.repeat(129))), async port => {
    await assert.rejects(localFetch(port), /response too large/);
  });
});

test('HTTP errors are rejected rather than parsed as range data', async () => {
  await withServer(https.createServer(tls, (_req, res) => {
    res.writeHead(503); res.end('unavailable');
  }), async port => {
    await assert.rejects(localFetch(port), /HTTP 503/);
  });
});

test('interrupted HTTPS response is rejected', async () => {
  await withServer(https.createServer(tls, (_req, res) => {
    res.write('partial'); setTimeout(() => res.destroy(), 20);
  }), async port => {
    await assert.rejects(localFetch(port), /interrupted|aborted|reset/i);
  });
});


test('production CONNECT deadline closes socket and releases requesting process', async () => {
  let received = false, closed = false;
  await withServer(net.createServer(socket => {
    socket.on('data', () => { received = true; });
    socket.on('close', () => { closed = true; });
  }), async port => {
    const module = new URL('../internal/bounded-https.mjs', import.meta.url).href;
    const program = `import {fetchText} from ${JSON.stringify(module)};
      import {ProxyAgent} from 'proxy-agent';
      try { await fetchText('https://example.invalid/', {
        agentFactory: signal => new ProxyAgent({signal, getProxyForUrl: () => 'http://127.0.0.1:${port}'})
      }); throw new Error('Unbounded CONNECT accepted'); }
      catch(error) { if(!error.message.includes('connection deadline')) throw error; }`;
    const started = Date.now();
    await new Promise((resolve,reject) => execFile(process.execPath, ['--input-type=module','-e',program],
      {cwd:path.dirname(path.dirname(fileURLToPath(import.meta.url))), timeout:4500}, error => error ? reject(error) : resolve()));
    assert.equal(received, true);
    assert.equal(closed, true, 'socket must close without killing the requesting process');
    assert.ok(Date.now()-started < 3500, 'production 3-second deadline must release the process');
  });
});
