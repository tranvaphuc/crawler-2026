import {HttpsProxyAgent} from 'https-proxy-agent';

// Permission to use a live TLS tunnel is never permission to open another one.
// The agent guard also covers a free socket dying while its permit RPC runs.
export class TransportAwareProxyAgent extends HttpsProxyAgent {
 async connect(req,options){
  if(options.crawlerWarmTunnelOnly){
   throw Object.assign(Error('PROXY_ENDPOINTS_UNAVAILABLE'),{code:'PROXY_ENDPOINTS_UNAVAILABLE',retryAfterMs:options.crawlerWarmTunnelOnly});
  }
  try{return await super.connect(req,options);}catch(error){
   if(!error.code&&error.message==='Proxy connection ended before receiving CONNECT response')error.code='PROXY_CONNECT_EOF';
   throw error;
  }
 }
}
export function hasReusableProxyTunnel(agent,url){
 const name=agent.getName({host:url.hostname,port:443,servername:url.hostname,secureEndpoint:true});
 // An ongoing redirect may still be draining its tiny response. Node can
 // queue the next request on that same TLS socket; the connect guard above
 // forbids replacing it with a new tunnel under conditional permission.
 return [...(agent.freeSockets[name]||[]),...(agent.sockets?.[name]||[])].some(socket=>socket.encrypted===true&&socket.authorized===true&&socket.servername===url.hostname&&!socket.destroyed&&socket.writable===true&&socket.secureConnecting!==true);
}
