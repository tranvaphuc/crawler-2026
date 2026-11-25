import fs from 'node:fs/promises';
import path from 'node:path';
import { createProxyVnRotator } from '../../scripts/proxyvn_rotator.js';
import {createProxyManagerClient} from './proxyManagerClient.js';
import { createNamedProxyPoolProvider } from './socialProxyPools.js';
const fail = code => Object.assign(new Error(code), { code });
export function normalizeBrowserProxy(value) {
  try {
    let u;
    if (typeof value === 'string') u = new URL(value);
    else if (value?.server) {
      u = new URL(value.server);
      if (u.username || u.password) throw fail('INVALID_PROXY');
      if (value.username) u.username = value.username;
      if (value.password) u.password = value.password;
    } else if (value && /^[\w.-]+$/.test(value.host || '') && Number.isInteger(Number(value.port))) {
      u = new URL(`${value.protocol || 'http'}://${value.host}:${value.port}`);
      if (value.username) u.username = value.username;
      if (value.password) u.password = value.password;
    } else throw fail('INVALID_PROXY');
    if (!['http:', 'https:'].includes(u.protocol) || !u.hostname || !u.port || Number(u.port)<1 || u.pathname !== '/' || u.search || u.hash) throw fail('INVALID_PROXY');
    return { server: `${u.protocol}//${u.host}`, username: decodeURIComponent(u.username), password: decodeURIComponent(u.password) };
  } catch { throw fail('INVALID_PROXY'); }
}
export function createMetricsProxyProvider({ proxyFile = process.env.SOCIAL_METRICS_PROXY_FILE,
  keyFile = process.env.SOCIAL_METRICS_PROXY_KEY_FILE, staticProxy = process.env.SOCIAL_METRICS_PROXY } = {}) {
  let next = 0, acquire = null, cached = null, expires = 0, pending = null;
  return async function getProxy() {
    if (proxyFile) {
      let values;
      try { values=JSON.parse(await fs.readFile(proxyFile,'utf8')); } catch { throw fail('PROXY_CONFIG_INVALID'); }
      if (!Array.isArray(values) || !values.length) throw fail('PROXY_LIST_EMPTY');
      return normalizeBrowserProxy(values[next++ % values.length]);
    }
    if (staticProxy) return normalizeBrowserProxy(staticProxy);
    if (!keyFile) throw fail('PROXY_REQUIRED');
    if (cached && Date.now() < expires) return cached;
    if (!pending) pending = (async () => {
      if (!acquire) { let key; try { key=(await fs.readFile(keyFile,'utf8')).trim(); } catch { throw fail('PROXY_CONFIG_INVALID'); } if (!key) throw fail('PROXY_KEY_EMPTY'); if (/\s/.test(key)) throw fail('PROXY_CONFIG_INVALID'); acquire = createProxyVnRotator(key); }
      cached = normalizeBrowserProxy(await acquire()); expires = Date.now() + 120000; return cached;
    })().finally(() => { pending = null; });
    return pending;
  };
}
/** Explicit local convenience setting; never falls back to a direct Internet connection. */
export async function existingMetricsProxyKeyFile() {
  const candidate = path.resolve('outputs/facebook-groups-september-2026-10-21/proxyvn-key.txt');
  try { await fs.access(candidate); return candidate; } catch { return undefined; }
}

export function createConfiguredProxyProvider() {
  let loading;
  const configured=async target => {
    const provider=await (loading ||= (async()=>{
      if(process.env.PROXY_MANAGER_URL)return createProxyManagerClient();
      const candidate=path.resolve('outputs/social-proxy-pools-2026-10-23/runtime.credentials.json');
      const explicit=process.env.SOCIAL_METRICS_PROXY_FILE || process.env.SOCIAL_METRICS_PROXY || process.env.SOCIAL_METRICS_PROXY_KEY_FILE;
      const pools=process.env.SOCIAL_METRICS_PROXY_POOLS_FILE || (!explicit && await fs.access(candidate).then(()=>candidate,()=>null));
      return pools ? createNamedProxyPoolProvider(pools) : createMetricsProxyProvider();
    })().catch(error=>{loading=null;throw error;}));
    return provider(target);
  };
  configured.managed=!!process.env.PROXY_MANAGER_URL;
  configured.status=async()=>process.env.PROXY_MANAGER_URL?createProxyManagerClient().status():{status:'legacy_proxy_configuration'};
  return configured;
}
