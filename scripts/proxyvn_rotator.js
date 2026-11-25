import https from 'node:https';
import {isIP} from 'node:net';

const fail = (code, message) => Object.assign(new Error(message), {code});
export function parseProxy(value) {
  if (typeof value !== 'string') throw fail('PROXY_API_BAD_RESPONSE', 'Missing proxyhttp');
  const [host, port, username = '', ...password] = value.split(':');
  if (!host || !/^\d+$/.test(port ?? '')) throw fail('PROXY_API_BAD_RESPONSE', 'Invalid proxyhttp');
  return {host, port: Number(port), username, password: password.join(':'), protocol: 'http'};
}

export function callProxyApi(url, values) {
  const body = new URLSearchParams(values).toString();
  return new Promise((resolve, reject) => {
    const req = https.request(url, {method:'POST', headers:{'content-type':'application/x-www-form-urlencoded', 'content-length':Buffer.byteLength(body)}}, res => {
      const chunks = [];
      res.on('data', x => chunks.push(x));
      res.on('error', () => reject(fail('PROXY_API_NETWORK', 'Proxy API response failed')));
      res.on('end', () => {
        if (res.statusCode !== 200) return reject(fail('PROXY_API_HTTP', `Proxy API HTTP ${res.statusCode}`));
        try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
        catch { reject(fail('PROXY_API_BAD_RESPONSE', 'Proxy API returned non-JSON data')); }
      });
    });
    req.setTimeout(30000, () => req.destroy());
    req.on('error', () => reject(fail('PROXY_API_NETWORK', 'Could not connect to proxy API')));
    req.end(body);
  });
}

export function createProxyVnRotator(key, {request = callProxyApi, whitelistIpv4 = process.env.PROXYVN_WHITELIST_IPV4} = {}) {
  if(whitelistIpv4!==undefined&&whitelistIpv4!==''&&(typeof whitelistIpv4!=='string'||isIP(whitelistIpv4)!==4||whitelistIpv4==='0.0.0.0'))throw fail('PROXY_CONFIG_INVALID','Proxy whitelist must be one explicit IPv4 address');
  let rotationKey = key, resolved = false, lastNetwork=null, lastRequestedNetwork=null;
  const networks=['viettel','vnpt','fpt'];
  return async function acquire({rotateNetwork=false,previousNetwork,requestedNetwork}={}) {
    if(requestedNetwork!==undefined&&!networks.includes(requestedNetwork))throw fail('PROXY_CONFIG_INVALID','Unsupported proxy network');
    const known=networks.includes(previousNetwork)?previousNetwork:lastNetwork;
    let index=networks.indexOf(lastRequestedNetwork||known);
    let nextNetwork=networks[(index+1)%networks.length];
    if(nextNetwork===known)nextNetwork=networks[(index+2)%networks.length];
    if(rotateNetwork)lastRequestedNetwork=nextNetwork;
    const networkRequest=requestedNetwork||(rotateNetwork?nextNetwork:null);
    const values=()=>({key:rotationKey,...(whitelistIpv4?{whitelist:whitelistIpv4}:{}),...(networkRequest?{nhamang:networkRequest,tinhthanh:'0'}:{})});
    let result = await request('https://proxyxoay.shop/api/get.php', values());
    const invalidKey = value => /key.{0,40}(?:not exist|invalid|wrong|khong ton tai|không tồn tại|khong dung|không đúng)/i.test(String(value.message ?? value.comen ?? ''));
    if (Number(result.status) === 101 && invalidKey(result) && !resolved) {
      // The supplied key can be an account API key rather than a purchased rotating key.
      resolved = true;
      const keys = await request('https://proxy.vn/proxyxoay/apigetkeyxoay.php', {key});
      const findKeys = value => {
        if (Array.isArray(value)) return value.flatMap(findKeys);
        if (!value || typeof value !== 'object') return [];
        return Object.entries(value).flatMap(([k,v]) => k === 'keyxoay' && typeof v === 'string' ? [v] : findKeys(v));
      };
      const available = findKeys(keys);
      if (!available.length) throw fail('PROXY_API_NO_ACTIVE_KEY', 'No active rotating key returned for this API key');
      rotationKey = available[0];
      result = await request('https://proxyxoay.shop/api/get.php', values());
    }
    if (Number(result.status) !== 100) {
      const status = Number(result.status);
      const message = String(result.message ?? result.comen ?? '');
      if(/key.{0,50}(?:het han|hết hạn|expired)|(?:expired|het han|hết hạn).{0,30}key/i.test(message))throw fail('PROXY_API_KEY_EXPIRED','Proxy provider key has expired');
      const wait = message.match(/(\d+)\s*(?:s\b|giay|giây|seconds?)/i);
      if (wait) {
        const error = fail('PROXY_API_COOLDOWN', 'Proxy provider requires waiting before rotation');
        error.retryAfterMs = (Number(wait[1]) + 1) * 1000;
        throw error;
      }
      throw fail(invalidKey(result) ? 'PROXY_API_INVALID_KEY' : 'PROXY_API_UNAVAILABLE', `Proxy provider status ${Number.isFinite(status) ? status : 'unknown'}`);
    }
    const proxy=parseProxy(result.proxyhttp);
    const network=String(result['Nha Mang']??result.nhamang??'').trim().toLowerCase();
    if(requestedNetwork&&network!==requestedNetwork){
      const error=fail('PROXY_API_NETWORK_MISMATCH','Proxy provider returned a different network');
      error.retryAfterMs=60000;
      throw error;
    }
    if(networks.includes(network)){lastNetwork=network;proxy.providerNetwork=network;}
    const ttl=String(result.message??result.comen??'').match(/(?:die\s+sau|expires?\s+in|live\s+for)\s*(\d+)\s*(?:s\b|seconds?)/i);
    if(ttl&&Number(ttl[1])>0){proxy.expiresAt=Date.now()+Number(ttl[1])*1000;proxy.validForMs=Number(ttl[1])*1000;}
    return proxy;
  };
}
