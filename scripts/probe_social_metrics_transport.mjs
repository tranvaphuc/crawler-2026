// Real Chrome, but a local denying proxy: no platform response/data is fetched.
import http from 'node:http';
import { once } from 'node:events';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createSocialMetricsReader } from '../src/services/socialMetricsBrowser.js';
import { normalizeMetricsInput } from '../src/services/socialMetrics.js';

const sockets = new Set(); let targetConnects = 0, proxyAuthenticated = false;
const expected = 'Basic ' + Buffer.from('local-test:local-only').toString('base64');
const server = http.createServer((req, res) => { res.writeHead(502); res.end(); });
server.on('connection', socket => { sockets.add(socket); socket.on('error', () => {}); socket.on('close', () => sockets.delete(socket)); });
server.on('clientError', (error, socket) => socket.destroy());
server.on('connect', (req, socket) => {
  if (req.url === 'www.facebook.com:443') {
    targetConnects++;
    if (req.headers['proxy-authorization'] !== expected) {
      socket.end('HTTP/1.1 407 Proxy Authentication Required\r\nProxy-Authenticate: Basic realm="local-transport-test"\r\nConnection: close\r\nContent-Length: 0\r\n\r\n'); return;
    }
    proxyAuthenticated = true;
  }
  socket.end('HTTP/1.1 502 Bad Gateway\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');
});
server.listen(0, '127.0.0.1'); await once(server, 'listening');
try {
  const read = createSocialMetricsReader({ timeoutMs: 15000, settleMs: 0,
    getProxy: async () => ({ server: `http://127.0.0.1:${server.address().port}`, username: 'local-test', password: 'local-only' }) });
  const result = await read(normalizeMetricsInput({ url: 'https://www.facebook.com/1000419343151470_122138942931244237' }));
  const report = { testedAt: new Date().toISOString(), test: 'real Chrome incognito via local HTTP proxy that denies all tunnels',
    platformDataFetched: false, incognito: result.transport.incognito, proxyUsed: result.transport.proxyUsed,
    targetConnectsObserved: targetConnects, proxyAuthObserved: proxyAuthenticated, status: result.status, reason: result.reason };
  await fs.mkdir('outputs/social-metrics-api-2026-10-23', { recursive: true });
  await fs.writeFile('outputs/social-metrics-api-2026-10-23/browser-transport-test.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
  assert.equal(report.incognito, true); assert.equal(report.proxyUsed, true);
  assert.ok(targetConnects > 0); assert.equal(proxyAuthenticated, true); assert.equal(report.status, 'proxy_error');
} finally { for (const socket of sockets) socket.destroy(); await new Promise(resolve => server.close(resolve)); }
