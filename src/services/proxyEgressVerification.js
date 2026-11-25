import https from 'node:https';
import {isIP} from 'node:net';
import {HttpsProxyAgent} from 'https-proxy-agent';

// Independent TLS-verified egress observation. Never infer an exit change from
// provider generation, credentials or ISP labels; never follow redirects.
export async function verifyProxyEgress(proxy,{timeoutMs=3000,service='ipify',request=https.get,makeAgent=(url,options)=>new HttpsProxyAgent(url,options)}={}){
 if(!['ipify','cloudflare'].includes(service))throw Object.assign(Error('Invalid egress service'),{code:'PROXY_EGRESS_CONFIG_INVALID'});
 const url=proxy.server?new URL(proxy.server):new URL('http://'+proxy.host+':'+proxy.port);
 if(proxy.username)url.username=proxy.username;if(proxy.password)url.password=proxy.password;
 const signal=AbortSignal.timeout(timeoutMs),agent=makeAgent(url,{timeout:Math.min(service==='cloudflare'?6000:2000,timeoutMs),signal});let responseObserved=false;
 try{return await new Promise((resolve,reject)=>{
  const req=request(service==='cloudflare'?'https://www.cloudflare.com/cdn-cgi/trace':'https://api.ipify.org?format=json',{agent,signal,headers:{accept:service==='cloudflare'?'text/plain':'application/json'}},res=>{
   responseObserved=true;
   let body='';res.on('data',chunk=>{body+=chunk;if(body.length>(service==='cloudflare'?4096:1024))req.destroy(Object.assign(Error('PROXY_EGRESS_INVALID'),{code:'PROXY_EGRESS_INVALID'}));});
   res.on('error',reject);res.on('end',()=>{try{const ip=service==='cloudflare'?body.match(/^ip=(.+)$/m)?.[1]?.trim():JSON.parse(body).ip;if(res.statusCode!==200||!isIP(ip))throw Error();resolve(ip);}catch{reject(Object.assign(Error('PROXY_EGRESS_INVALID'),{code:'PROXY_EGRESS_INVALID'}));}});
  });req.on('error',reject);
 });}catch(error){const failure=new Error('Independent egress verification failed',{cause:error});failure.code=error?.name==='AbortError'?'ABORT_ERR':error?.code||'PROXY_EGRESS_ERROR';failure.responseObserved=responseObserved;throw failure;}finally{agent.destroy();}
}
