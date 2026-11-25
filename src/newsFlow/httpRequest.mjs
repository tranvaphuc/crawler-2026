import {readFileSync} from 'node:fs';import tls from 'node:tls';import {createRequire} from 'node:module';import {performance} from 'node:perf_hooks';import axios from 'axios';import {HttpsProxyAgent} from 'https-proxy-agent';import {HttpProxyAgent} from 'http-proxy-agent';
import {publicLiteralCookie,ResearchHttpCookies} from '../web/researchHttpCookies.mjs';
const require=createRequire(import.meta.resolve('https-proxy-agent'));require('debug').disable();
export const NEWS_HTTP_MAX_TIMEOUT_MS=5000;
const cas=[...tls.rootCertificates,...['sectigo-dv-r36.pem','globalsign-ov-2018.pem','rapidssl-g1.pem','globalsign-dv-2020.pem','sectigo-dv-2018.pem'].map(f=>readFileSync(new URL('../../config/web-sources/tls/'+f,import.meta.url),'utf8'))];
class NewsHttpsProxyAgent extends HttpsProxyAgent{addRequest(req,options){req.maxHeaderSize=65536;return super.addRequest(req,options);}}
class NewsHttpProxyAgent extends HttpProxyAgent{addRequest(req,options){req.maxHeaderSize=65536;return super.addRequest(req,options);}}
export function createNewsProxyAgent(p,signal,target,timeoutMs=NEWS_HTTP_MAX_TIMEOUT_MS){const u=new URL('http://'+p.host+':'+p.port);u.username=p.username;u.password=p.password;const Agent=new URL(target).protocol==='https:'?NewsHttpsProxyAgent:NewsHttpProxyAgent;const agent=new Agent(u,{keepAlive:false,signal,timeout:Math.min(timeoutMs,NEWS_HTTP_MAX_TIMEOUT_MS),maxHeaderSize:65536});agent.options={...agent.options,ca:cas,rejectUnauthorized:true};return agent;}
export async function requestNewsHttp({url,proxy,headers,timeoutMs=NEWS_HTTP_MAX_TIMEOUT_MS,maxBytes=4000000,method='GET',data}){
 if(!Number.isFinite(timeoutMs)||timeoutMs<=0)throw Error('NEWS_INVALID_HTTP_TIMEOUT');timeoutMs=Math.min(timeoutMs,NEWS_HTTP_MAX_TIMEOUT_MS);
 const startedAt=Date.now(),start=performance.now(),controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs),agent=createNewsProxyAgent(proxy,controller.signal,url,timeoutMs);let connectStatus=null;
 agent.on('proxyConnect',r=>connectStatus=r.statusCode);
 try{
  const request=extraHeaders=>axios.request({url,method,data,proxy:false,httpAgent:agent,httpsAgent:agent,maxRedirects:0,signal:controller.signal,timeout:Math.max(1,timeoutMs-(performance.now()-start)),responseType:'arraybuffer',maxContentLength:maxBytes,validateStatus:()=>true,headers:{...headers,...extraHeaders}});
  let response=await request({}),bootstrap=null,sessionCookies=[];
  const selfRedirect=['GET',undefined].includes(method)&&[301,302,303,307,308].includes(response.status)&&response.headers.location&&new URL(response.headers.location,url).href===new URL(url).href;
  if(selfRedirect&&response.headers['set-cookie']){
   const jar=new ResearchHttpCookies();jar.store(url,response.headers['set-cookie']);const incoming=jar.header(url),names=new Set(incoming.split(';').map(s=>s.trim().split('=')[0]));
   const existing=String(headers?.Cookie||'').split(';').map(s=>s.trim()).filter(Boolean),cookie=[...existing.filter(s=>!names.has(s.split('=')[0])),incoming].filter(Boolean).join('; ');
   if(incoming&&cookie!==existing.join('; ')){sessionCookies=Array.isArray(response.headers['set-cookie'])?response.headers['set-cookie']:[response.headers['set-cookie']];response=await request({Cookie:cookie});}
  }else if(response.status===200)bootstrap=publicLiteralCookie(Buffer.from(response.data).toString('utf8'),url);
  // This exact, publisher-declared literal cookie is a bounded public-session
  // handshake, not a retry of an HTTP error. Keep the same proxy and deadline.
  if(bootstrap){const cookie=bootstrap.split(';')[0],existing=String(headers?.Cookie||'').split(';').map(s=>s.trim()).filter(s=>s&&!s.startsWith('D1N='));response=await request({Cookie:[...existing,cookie].join('; ')});}
  const networkElapsedMs=performance.now()-start;
  if(networkElapsedMs>=timeoutMs){controller.abort();return {error:'request_deadline_exceeded',connectStatus,networkElapsedMs,startedAt,completedAt:Date.now()};}
  const responseHeaders=response.headers.toJSON();if(bootstrap)responseHeaders['set-cookie']=[...Array.isArray(responseHeaders['set-cookie'])?responseHeaders['set-cookie']:responseHeaders['set-cookie']?[responseHeaders['set-cookie']]:[],bootstrap];
  if(sessionCookies.length)responseHeaders['set-cookie']=[...sessionCookies,...Array.isArray(responseHeaders['set-cookie'])?responseHeaders['set-cookie']:responseHeaders['set-cookie']?[responseHeaders['set-cookie']]:[]];
  return {statusCode:response.status,headers:responseHeaders,data:response.data,connectStatus,networkElapsedMs,startedAt,completedAt:Date.now(),publicCookieBootstrap:!!bootstrap||!!sessionCookies.length,publicRedirectCookieBootstrap:!!sessionCookies.length};
 }catch(e){const code=String(e.code||'NETWORK_ERROR'),deadline=controller.signal.aborted||['ECONNABORTED','ETIMEDOUT'].includes(code);return {error:deadline?'request_deadline_exceeded':/^[A-Z0-9_]+$/.test(code)?code:'upstream_network_error',connectStatus,networkElapsedMs:performance.now()-start,startedAt,completedAt:Date.now()};}
 finally{clearTimeout(timer);agent.destroy();}
}
