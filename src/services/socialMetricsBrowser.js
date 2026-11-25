import fs from 'node:fs/promises';
import path from 'node:path';
import puppeteer from 'puppeteer';
import { createProxyVnRotator } from '../../scripts/proxyvn_rotator.js';
import { extractSocialMetrics, metricsFailure } from './socialMetrics.js';

const fail = code => Object.assign(new Error(code), { code });
import { normalizeBrowserProxy, createMetricsProxyProvider } from './socialProxyConfig.js';
export { normalizeBrowserProxy, createMetricsProxyProvider, existingMetricsProxyKeyFile } from './socialProxyConfig.js';
const PLATFORM_DOMAINS = ['facebook.com', 'facebook.net', 'fbcdn.net', 'instagram.com', 'cdninstagram.com', 'threads.com', 'threads.net',
  'youtube.com', 'youtu.be', 'ytimg.com', 'googlevideo.com', 'ggpht.com', 'gstatic.com', 'googleapis.com', 'google.com', 'googleusercontent.com'];
function allowedRequest(value) {
  try { const u = new URL(value); return u.protocol === 'https:' && !u.username && !u.password &&
    PLATFORM_DOMAINS.some(d => u.hostname === d || u.hostname.endsWith('.' + d)); } catch { return false; }
}
async function chromeExecutable() {
  if (process.env.SOCIAL_METRICS_CHROME) return process.env.SOCIAL_METRICS_CHROME;
  const app = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  try { await fs.access(app); return app; } catch { /* Use Puppeteer's installed browser. */ }
  try { return puppeteer.executablePath(); } catch { throw fail('CHROME_NOT_CONFIGURED'); }
}
export function retryAfterMs(value, fallback = null, now = Date.now()) {
  if (value == null || String(value).trim() === '') return fallback;
  const raw = String(value).trim();
  const ms = /^\d+(?:\.\d+)?$/.test(raw) ? Number(raw)*1000 : Date.parse(raw)-now;
  return Number.isFinite(ms) && ms >= 0 ? Math.max(1, ms) : fallback;
}
const safeReason = error => {
  const code = String(error?.code || '');
  if (/^(?:PROXY_[A-Z_]+|INVALID_PROXY|CHROME_NOT_CONFIGURED|INCOGNITO_REQUIRED|SNAPSHOT_TOO_LARGE)$/.test(code)) return code;
  const message = String(error?.message || '');
  if (/ERR_PROXY|ERR_TUNNEL|ERR_INVALID_AUTH_CREDENTIALS|407|proxy authentication/i.test(message)) return 'PROXY_CONNECTION_FAILED';
  if (/ERR_CERT|ERR_SSL/i.test(message)) return 'TLS_VALIDATION_FAILED';
  if (error?.name === 'TimeoutError' || /timeout|timed out/i.test(message)) return 'BROWSER_TIMEOUT';
  return 'BROWSER_READ_FAILED';
};
async function bounded(work, deadline, lateCleanup) {
  let timer, expired = false;
  const task = Promise.resolve().then(work).then(async value => {
    if (expired && lateCleanup) { try { await lateCleanup(value); } catch { /* Best effort late cleanup. */ } }
    return value;
  });
  try {
    return await Promise.race([task, new Promise((_,reject) => { timer=setTimeout(() => {
      expired=true; reject(Object.assign(new Error('BROWSER_TIMEOUT'),{name:'TimeoutError'}));
    },Math.max(1,deadline-Date.now())); })]);
  } finally { clearTimeout(timer); }
}
let activeBrowsers = 0;
export function createSocialMetricsReader({ readPage, getProxy = createMetricsProxyProvider(), launch = args => puppeteer.launch(args),
  executablePath, headless = process.env.SOCIAL_METRICS_HEADLESS === 'true', timeoutMs = 30000, settleMs = 6500 } = {}) {
  return async target => {
    let browser, context, page, lease, admitted = false, proxyUsed = false, incognito = false;
    const deadline = Date.now() + timeoutMs;
    try {
      if (activeBrowsers >= 2) throw fail('PROXY_BROWSER_BUSY');
      activeBrowsers++; admitted = true;
      const executable = executablePath || await chromeExecutable();
      lease = await bounded(() => getProxy(target), deadline, value => value?.release?.());
      if (!lease) throw fail('PROXY_REQUIRED');
      const proxy = normalizeBrowserProxy(lease);
      if (!proxy?.server) throw fail('PROXY_REQUIRED');
      // Dedicated temporary browser, never connect to the user's Chrome/profile/debugging port.
      browser = await bounded(() => launch({ executablePath: executable, headless: headless ? 'new' : false, timeout: 12000,
        protocolTimeout: 15000, args: [`--proxy-server=${proxy.server}`, '--proxy-bypass-list=<-loopback>',
          '--disable-quic', '--force-webrtc-ip-handling-policy=disable_non_proxied_udp', '--lang=en-US', '--no-first-run'] }), deadline, value => value?.close?.());
      proxyUsed = true;
      context = await browser.createIncognitoBrowserContext();
      if (!context.isIncognito()) throw fail('INCOGNITO_REQUIRED');
      incognito = true;
      page = await context.newPage();
      await page.setViewport({ width: 1365, height: 900 });
      await page.setExtraHTTPHeaders({ 'Accept-Language': 'en-US,en;q=0.9' });
      // Authenticate only Proxy challenges. Never send proxy credentials to a site's 401 challenge.
      const client = await page.target().createCDPSession();
      const challenged = new Set();
      client.on('Fetch.authRequired', event => {
        const provide = event.authChallenge.source === 'Proxy' && !challenged.has(event.requestId);
        challenged.add(event.requestId);
        client.send('Fetch.continueWithAuth', { requestId: event.requestId,
          authChallengeResponse: provide ? { response: 'ProvideCredentials', username: proxy.username || '', password: proxy.password || '' } :
            { response: 'CancelAuth' } }).catch(() => {});
      });
      client.on('Fetch.requestPaused', event => {
        const block = ['Image', 'Font', 'Media'].includes(event.resourceType) || !allowedRequest(event.request.url);
        client.send(block ? 'Fetch.failRequest' : 'Fetch.continueRequest', { requestId: event.requestId,
          ...(block ? { errorReason: 'BlockedByClient' } : {}) }).catch(() => {});
      });
      await client.send('Fetch.enable', { handleAuthRequests: true, patterns: [{ urlPattern: '*' }] });
      const jsonResponses = [], pendingBodies = new Set(); let responseBytes = 0, upstreamIssue = null;
      const responseLimit = readPage ? 100 : 20, bytesLimit = readPage ? 20000000 : 6000000;
      page.on('response', response => {
        const type = response.headers()['content-type'] || '';
        if (/graphql|\/api\/v1\/|youtubei\/v1\//.test(response.url()) && [401,403,429,500,502,503,504].includes(response.status())) {
          const wait = retryAfterMs(response.headers()['retry-after'], response.status()===429 ? 900000 : null);
          // Keep the strongest failure even when later requests fail differently.
          const rank = n => n===429 ? 3 : [401,403].includes(n) ? 2 : 1;
          if (!upstreamIssue || rank(response.status()) > rank(upstreamIssue.status)) upstreamIssue={status:response.status(),retryAfterMs:wait};
          if(response.status()===429)lease?.defer?.(wait);
        }
        if (jsonResponses.length >= responseLimit || responseBytes >= bytesLimit) return;
        if (!/json|javascript/i.test(type) || !/graphql|\/api\/v1\/|youtubei\/v1\//.test(response.url())) return;
        if (Number(response.headers()['content-length']) > 2000000) return;
        const task = response.text().then(text => {
          if (text.length <= 2000000 && responseBytes + text.length <= bytesLimit && jsonResponses.length < responseLimit) {
            responseBytes += text.length; jsonResponses.push(text);
          }
        }).catch(() => {}).finally(() => pendingBodies.delete(task));
        pendingBodies.add(task);
      });
      const response = await page.goto(target.url, { waitUntil: 'domcontentloaded', timeout: Math.max(1, deadline - Date.now()) });
      const httpStatus = response?.status() || null;
      if (httpStatus === 407) throw fail('PROXY_AUTH_REQUIRED');
      if (httpStatus == null || httpStatus >= 400) {
        const result = extractSocialMetrics(target, { finalUrl: page.url(), httpStatus });
        const wait = retryAfterMs(response?.headers()['retry-after'], httpStatus===429 ? 900000 : null);
        if (httpStatus === 429) lease?.defer?.(wait);
        return { ...result, retryAfterMs: wait, transport: { incognito, proxyUsed, mode: 'browser' } };
      }
      const settleDeadline = Math.min(deadline, Date.now() + settleMs);
      while (Date.now() < settleDeadline) await new Promise(resolve => setTimeout(resolve, Math.min(250, settleDeadline - Date.now())));
      await Promise.race([Promise.all([...pendingBodies]), new Promise(resolve => setTimeout(resolve, 500))]);
      if (readPage) {
        const value = await bounded(() => readPage({ target, page, httpStatus, deadline, snapshot: async () => {
          await Promise.race([Promise.all([...pendingBodies]), new Promise(resolve => setTimeout(resolve, 500))]);
          const html = await bounded(() => page.content(), deadline);
          if (html.length > 12000000) throw fail('SNAPSHOT_TOO_LARGE');
          return { html, jsonResponses: [...jsonResponses], finalUrl: page.url(), httpStatus: upstreamIssue?.status || httpStatus, retryAfterMs: upstreamIssue?.retryAfterMs || null };
        } }), deadline);
        if (value.status==='rate_limited') { value.retryAfterMs = Number.isFinite(value.retryAfterMs) && value.retryAfterMs>0 ? value.retryAfterMs : 900000; lease?.defer?.(value.retryAfterMs); }
        return { ...value, transport: { incognito, proxyUsed, mode: 'browser' } };
      }
      const html = await bounded(() => page.content(), deadline);
      if (html.length > 9000000) throw fail('SNAPSHOT_TOO_LARGE');
      const result = extractSocialMetrics(target, { html, jsonResponses, finalUrl: page.url(), httpStatus: upstreamIssue?.status || httpStatus });
      if (upstreamIssue?.retryAfterMs) result.retryAfterMs = upstreamIssue.retryAfterMs;
      if (result.status==='rate_limited') { result.retryAfterMs ||= 900000; lease?.defer?.(result.retryAfterMs); }
      return { ...result, transport: { incognito, proxyUsed, mode: 'browser' } };
    } catch (error) {
      const reason = safeReason(error);
      const status = reason === 'PROXY_BROWSER_BUSY' ? 'busy' : /PROXY|INVALID_PROXY/.test(reason) ? 'proxy_error' : 'error';
      return { ...metricsFailure(target, status, reason), retryAfterMs: Number.isFinite(error?.retryAfterMs) && error.retryAfterMs > 0 ? error.retryAfterMs : reason==='PROXY_BROWSER_BUSY' ? 3000 : null,
        transport: { incognito, proxyUsed, mode: 'browser' } };
    } finally {
      // Cleanup must never replace a response or leak admission capacity.
      try {
        if (browser) {
          let timer;
          const closed = await Promise.race([
            Promise.resolve().then(() => browser.close()).then(() => true, () => false),
            new Promise(resolve => { timer = setTimeout(() => resolve(false), 5000); })
          ]);
          clearTimeout(timer);
          if (!closed) { try { browser.process()?.kill('SIGTERM'); } catch { /* Already exited. */ } }
        }
      } finally {
        try { await lease?.release?.(); } catch { /* A broken lease must not retain browser capacity. */ }
        finally { if (admitted) activeBrowsers--; }
      }
    }
  };
}

