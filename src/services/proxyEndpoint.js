import {createHash} from 'node:crypto';
// Endpoint identity ignores credentials: two accounts on the same proxy are not a rotation.
export function proxyEndpoint(proxy){
 if(typeof proxy?.queueEndpoint==='string'&&/^[a-f0-9]{64}$/.test(proxy.queueEndpoint))return proxy.queueEndpoint;
 let host=proxy?.host,port=proxy?.port;
 if(proxy?.server){const u=new URL(proxy.server);host=u.hostname;port=u.port;}
 return createHash('sha256').update(JSON.stringify([String(host).toLowerCase(),String(port)])).digest('hex');
}

export function proxyEgressEndpoint(proxy,exitAddress){return createHash('sha256').update(JSON.stringify(['verified-egress-v1',exitAddress])).digest('hex');}
