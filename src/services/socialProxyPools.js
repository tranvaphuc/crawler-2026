import fs from 'node:fs/promises';
import { createProxyVnRotator } from '../../scripts/proxyvn_rotator.js';
const fail = code => Object.assign(new Error(code), { code });
/** Pool leases keep a key reserved until its browser has closed. Never returns keys in results. */
export function createNamedProxyPoolProvider(configFile, { makeRotator = createProxyVnRotator, now = Date.now } = {}) {
  let loading;
  async function load() {
    let config;
    try { config=JSON.parse(await fs.readFile(configFile,'utf8')); } catch { throw fail('PROXY_POOL_CONFIG_INVALID'); }
    if(!config || typeof config.pools!=='object' || !config.pools || Array.isArray(config.pools)) throw fail('PROXY_POOL_CONFIG_INVALID');
    const pools={}, seen=new Set();
    for (const [name, spec] of Object.entries(config.pools || {})) {
      if(!spec || typeof spec.keyFile!=='string' || !Number.isInteger(spec.count) || spec.count<1) throw fail('PROXY_POOL_CONFIG_INVALID');
      let keys;
      try { keys=(await fs.readFile(spec.keyFile,'utf8')).split(/\s+/).filter(Boolean); } catch { throw fail('PROXY_POOL_CONFIG_INVALID'); }
      if (!keys.length || keys.length !== spec.count) throw fail('PROXY_POOL_CONFIG_INVALID');
      pools[name] = { next: 0, slots: keys.map(key => {
        if (seen.has(key)) throw fail('PROXY_POOL_KEY_DUPLICATE');
        seen.add(key); return { acquire: makeRotator(key), busy: false, until: 0, proxy: null, expires: 0 };
      }) };
    }
    return { pools, routing: config.routing || {} };
  }
  return async function getProxy(target = {}) {
    const { pools, routing } = await (loading ||= load().catch(error => { loading = null; throw error; }));
    const name = target.pool || routing[target.platform], pool = pools[name];
    if (!pool) throw fail('PROXY_POOL_NOT_CONFIGURED');
    let slot;
    for (let i = 0; i < pool.slots.length; i++) {
      const candidate = pool.slots[pool.next++ % pool.slots.length];
      if (!candidate.busy && candidate.until <= now()) { slot = candidate; break; }
    }
    if (!slot) {
      const waits = pool.slots.filter(x => !x.busy).map(x => Math.max(1, x.until - now()));
      throw Object.assign(fail('PROXY_POOL_BUSY'), { retryAfterMs: waits.length ? Math.min(...waits) : 3000 });
    }
    slot.busy = true;
    try {
      if (!slot.proxy || now() >= slot.expires) {
        slot.proxy = await slot.acquire(); slot.expires = now() + 120000;
      }
      let released = false;
      return { ...slot.proxy, pool: name, defer(ms) { slot.until = Math.max(slot.until, now() + (Number.isFinite(ms) && ms > 0 ? ms : 900000)); }, release() { if (!released) { released = true; slot.busy = false; } } };
    } catch (error) {
      slot.busy = false; slot.until = now() + (Number.isFinite(error?.retryAfterMs) && error.retryAfterMs > 0 ? error.retryAfterMs : 10000);
      throw error;
    }
  };
}
