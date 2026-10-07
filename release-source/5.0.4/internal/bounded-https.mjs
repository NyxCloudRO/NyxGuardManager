import https from 'node:https';

// These deadlines also cover DNS and proxy CONNECT, where socket timeouts alone
// do not suffice. Optional refreshes never retry inside the startup path.
export const IP_RANGE_REQUEST_POLICY = Object.freeze({
  connectMs: 3000, totalMs: 5000, maxBytes: 4 * 1024 * 1024,
});

export function fetchText(url, { agent, agentFactory, policy = IP_RANGE_REQUEST_POLICY } = {}) {
  return new Promise((resolve, reject) => {
    const controller = new AbortController();
    let request, response, settled = false;
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(connectTimer);
      clearTimeout(totalTimer);
      // Proxy CONNECT may own a socket before ClientRequest receives it.
      // The factory passes this signal to that socket at construction time.
      controller.abort();
      if (error) {
        response?.destroy();
        request?.destroy();
      }
      // The caller supplies a dedicated agent for this one refresh request.
      agent?.destroy();
      error ? reject(error) : resolve(value);
    };
    const connectTimer = setTimeout(() => finish(new Error('IP range connection deadline exceeded')), policy.connectMs);
    const totalTimer = setTimeout(() => finish(new Error('IP range request deadline exceeded')), policy.totalMs);
    try {
      if (agentFactory) agent = agentFactory(controller.signal);
      request = https.get(url, { agent, signal: controller.signal }, (res) => {
        response = res;
        clearTimeout(connectTimer);
        if (res.statusCode !== 200) {
          finish(new Error(`IP range request failed: HTTP ${res.statusCode}`));
          return;
        }
        const chunks = [];
        let bytes = 0;
        res.on('data', chunk => {
          bytes += chunk.length;
          if (bytes > policy.maxBytes) finish(new Error('IP range response too large'));
          else chunks.push(chunk);
        });
        res.on('error', error => finish(error));
        res.on('aborted', () => finish(new Error('IP range response interrupted')));
        res.on('end', () => finish(null, Buffer.concat(chunks).toString('utf8')));
      });
      request.on('socket', socket => {
        if (!socket.connecting && socket.encrypted && !socket.secureConnecting) clearTimeout(connectTimer);
        else socket.once('secureConnect', () => clearTimeout(connectTimer));
      });
      request.on('error', error => finish(error));
    } catch (error) {
      finish(error);
    }
  });
}
